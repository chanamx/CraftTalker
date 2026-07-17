import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useChatStore, streamKey } from '@/stores/chat-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useSendMessage, useGenerateStream } from '@/hooks/use-chats'
import { useCommitRun, useDiscardRun, useRecoverableRuns } from '@/hooks/use-runs'
import { ApiRequestError, api, consumeSSEStream, type ChatDetail, type ChatLine, type StCompatChatOverrideLine, type StCompatExtensionPrompt, type StCompatGenerationOptions, type StCompatPromptMessage } from '@/lib/api'
import { emitStExtensionEvent, emitStExtensionEventAsync, getStExtensionPromptsBridge, runStGenerationBeforeEndBridge, runStGenerationInterceptorsBridge, runStPromptLifecycleBridge, stEventTypes, syncStExtensionContextBridge } from '@/lib/st-extension-bridge'
import { useToast } from '@/lib/toast'
import { mapChatLineToMessage, type ChatMessage } from '@/types'

type StGenerationChatLine = {
  name: string
  is_user: boolean
  is_system: boolean
  mes: string
}

type StreamCommitMode = 'append' | 'continue' | 'replace-last'

function getMessageName(message: ChatMessage, assistantName: string): string {
  if (message.role === 'assistant') return assistantName
  if (message.role === 'system') return 'System'
  return 'User'
}

function mapMessageToStChatLine(message: ChatMessage, assistantName: string): StGenerationChatLine {
  return {
    name: getMessageName(message, assistantName),
    is_user: message.role === 'user',
    is_system: message.role === 'system',
    mes: message.content,
  }
}

function mapChatLineToStChatLine(line: ChatLine, assistantName: string): StGenerationChatLine {
  const isUser = line.is_user === true
  const isSystem = line.is_system === true

  return {
    name: line.name ?? line.user_name ?? line.character_name ?? (isUser ? 'User' : isSystem ? 'System' : assistantName),
    is_user: isUser,
    is_system: isSystem,
    mes: line.mes ?? '',
  }
}

function buildStGenerationChat(
  messages: ChatMessage[],
  assistantName: string,
  extraLine?: ChatLine,
): StGenerationChatLine[] {
  const chat = messages.map(message => mapMessageToStChatLine(message, assistantName))
  if (extraLine) chat.push(mapChatLineToStChatLine(extraLine, assistantName))
  return chat
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sanitizeStGenerationChatSnapshot(
  chat: unknown[],
  assistantName: string,
): StCompatChatOverrideLine[] {
  return chat.flatMap((line) => {
    if (!isRecord(line)) return []

    const mes = typeof line.mes === 'string'
      ? line.mes
      : typeof line.content === 'string'
        ? line.content
        : null
    if (mes === null) return []

    const isUser = line.is_user === true
    const isSystem = line.is_system === true
    const name = typeof line.name === 'string' && line.name.trim()
      ? line.name
      : isUser
        ? 'User'
        : isSystem
          ? 'System'
          : assistantName

    return [{
      name,
      is_user: isUser,
      is_system: isSystem,
      mes,
    }]
  })
}

function stLineToPromptMessage(line: StCompatChatOverrideLine): StCompatPromptMessage {
  return {
    role: line.is_system ? 'system' : line.is_user ? 'user' : 'assistant',
    content: line.mes,
  }
}

function stSnapshotToChatLines(snapshot: StGenerationChatLine[]): ChatLine[] {
  return snapshot.map(line => ({
    name: line.name,
    is_user: line.is_user,
    is_system: line.is_system,
    mes: line.mes,
  }))
}

function chatLinesToMessages(lines: ChatLine[]): ChatMessage[] {
  return lines
    .map((line, fileIndex) => ({ line, fileIndex }))
    .filter(({ line }) => 'mes' in line)
    .map(({ line, fileIndex }) => mapChatLineToMessage(line, fileIndex))
}

function applyGeneratedLineToChatLines(
  lines: ChatLine[],
  assistantLine: ChatLine,
  commitMode: StreamCommitMode,
  nativeMessageIndex: number,
): ChatLine[] {
  if (commitMode === 'continue') {
    const nextLines = [...lines]
    const targetIdx = Math.min(Math.max(0, nativeMessageIndex), nextLines.length - 1)
    if (targetIdx > 0) {
      const last = nextLines[targetIdx] as Record<string, unknown>
      nextLines[targetIdx] = {
        ...last,
        mes: `${typeof last.mes === 'string' ? last.mes : ''}${assistantLine.mes ?? ''}`,
        send_date: assistantLine.send_date,
      }
    }
    return nextLines
  }

  if (commitMode === 'replace-last') {
    if (lines.length === 0) return [assistantLine]
    const nextLines = [...lines]
    const replaceIdx = Math.min(Math.max(0, nativeMessageIndex), nextLines.length - 1)
    nextLines[replaceIdx] = assistantLine
    return nextLines
  }

  return [...lines, assistantLine]
}

function replaceChatLine(lines: ChatLine[], lineIndex: number, line: ChatLine): ChatLine[] {
  if (lineIndex < 0 || lineIndex >= lines.length) return lines
  const nextLines = [...lines]
  nextLines[lineIndex] = { ...nextLines[lineIndex], ...line }
  return nextLines
}

function upsertFinalizedChatLine(lines: ChatLine[], lineIndex: number, line: ChatLine): ChatLine[] {
  if (lineIndex === lines.length) return [...lines, line]
  return replaceChatLine(lines, lineIndex, line)
}

function stGenerationId(
  charName: string,
  chatId: string,
  messageId: number,
  generationType: string,
): string {
  return `${charName}:${chatId}:${messageId}:${generationType}`
}

function resolveNativeGeneratedLineIndex(
  commitMode: StreamCommitMode,
  generatedMessageId: number,
  lines: ChatLine[],
  committedLineIndex?: number,
): number {
  if (Number.isInteger(committedLineIndex) && committedLineIndex !== undefined && committedLineIndex >= 0) {
    return committedLineIndex
  }
  if (commitMode === 'append') return lines.length
  if (commitMode === 'continue') return Math.max(0, lines.length - 1)

  const firstMessageIndex = lines.findIndex(line => 'mes' in line)
  const jsonlHeaderOffset = firstMessageIndex >= 0 ? firstMessageIndex : 0
  return Math.min(
    Math.max(0, generatedMessageId + jsonlHeaderOffset),
    Math.max(0, lines.length - 1),
  )
}

const EXTENSION_PROMPT_POSITION = {
  NONE: -1,
  IN_CHAT: 1,
  AFTER_PROMPT: 3,
} as const

function extensionPromptRole(role: StCompatExtensionPrompt['role']): StCompatPromptMessage['role'] {
  if (role === 1) return 'user'
  if (role === 2) return 'assistant'
  return 'system'
}

function extensionPromptToMessage(prompt: StCompatExtensionPrompt): StCompatPromptMessage {
  return {
    role: extensionPromptRole(prompt.role),
    content: prompt.value,
  }
}

function buildStGeneratePromptMessages(
  chatOverride: StCompatChatOverrideLine[],
  extensionPrompts: StCompatExtensionPrompt[],
): StCompatPromptMessage[] {
  const result = chatOverride.map(stLineToPromptMessage)
  if (extensionPrompts.length === 0) return result

  const before: StCompatPromptMessage[] = []
  const after: StCompatPromptMessage[] = []
  const inChat: StCompatExtensionPrompt[] = []

  for (const prompt of extensionPrompts) {
    if (!prompt.value) continue
    if (prompt.position === EXTENSION_PROMPT_POSITION.NONE) continue

    if (prompt.position === EXTENSION_PROMPT_POSITION.IN_CHAT) {
      inChat.push(prompt)
      continue
    }

    const message = extensionPromptToMessage(prompt)
    if (prompt.position === EXTENSION_PROMPT_POSITION.AFTER_PROMPT) {
      after.push(message)
      continue
    }

    before.push(message)
  }

  const originalMessageCount = result.length
  const grouped = new Map<number, Map<number, string[]>>()
  for (const prompt of inChat.sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)) {
    const content = prompt.value.trim()
    if (!content) continue
    const depth = typeof prompt.depth === 'number' && Number.isFinite(prompt.depth)
      ? Math.max(0, Math.floor(prompt.depth))
      : 0
    const role = prompt.role === 1 || prompt.role === 2 ? prompt.role : 0
    const byRole = grouped.get(depth) ?? new Map<number, string[]>()
    const contents = byRole.get(role) ?? []
    contents.push(content)
    byRole.set(role, contents)
    grouped.set(depth, byRole)
  }

  for (const depth of [...grouped.keys()].sort((left, right) => left - right)) {
    const insertIdx = Math.max(0, originalMessageCount - depth)
    const byRole = grouped.get(depth)
    for (const role of [0, 1, 2]) {
      const contents = byRole?.get(role)
      if (!contents?.length) continue
      result.splice(insertIdx, 0, {
        role: extensionPromptRole(role),
        content: contents.join('\n'),
      })
    }
  }

  return [...before, ...result, ...after]
}

function equalStPromptMessages(left: StCompatPromptMessage[], right: StCompatPromptMessage[]): boolean {
  return left.length === right.length
    && left.every((message, index) => message.role === right[index]?.role && message.content === right[index]?.content)
}

export function useChatActions(messages: ChatMessage[]) {
  const activeCharacter = useChatStore((s) => s.activeCharacter)
  const activeChatId = useChatStore((s) => s.activeChatId)
  const streams = useChatStore((s) => s.streams)
  const startStreamEntry = useChatStore((s) => s.startStream)
  const appendStream = useChatStore((s) => s.appendStream)
  const endStream = useChatStore((s) => s.endStream)
  const abortStream = useChatStore((s) => s.abortStream)

  const llmConfig = useSettingsStore((s) => s.llmConfig)
  const genConfig = useSettingsStore((s) => s.genConfig)

  const toast = useToast()
  const queryClient = useQueryClient()
  const sendMessage = useSendMessage()
  const generateStream = useGenerateStream()
  const recoverableRuns = useRecoverableRuns(activeCharacter?.file_name ?? null, activeChatId)
  const commitRun = useCommitRun()
  const discardRun = useDiscardRun()

  const currentKey = activeCharacter && activeChatId
    ? streamKey(activeCharacter.file_name, activeChatId)
    : null
  const currentStream = currentKey ? streams[currentKey] : undefined
  const isStreaming = !!currentStream
  const streamContent = currentStream?.content ?? ''

  const runStream = useCallback(async (
    charName: string,
    charDisplayName: string,
    chatId: string,
    fetchResponse: (
      signal: AbortSignal,
      stCompat: StCompatGenerationOptions,
    ) => Promise<Response>,
    mode: 'append' | 'continue' = 'append',
    stChatSnapshot = buildStGenerationChat(messages, charDisplayName),
    commitMode: StreamCommitMode = mode,
  ) => {
    const key = streamKey(charName, chatId)
    const generationType = mode === 'continue' ? 'continue' : 'normal'
    const generatedMessageId = mode === 'continue'
      ? Math.max(0, stChatSnapshot.length - 1)
      : stChatSnapshot.length
    const abortedByInterceptor = await runStGenerationInterceptorsBridge(
      stChatSnapshot,
      genConfig.contextLength,
      generationType,
    )
    if (abortedByInterceptor) return

    const stCompatChatOverride = sanitizeStGenerationChatSnapshot(stChatSnapshot, charDisplayName)
    const stCompatExtensionPrompts = await getStExtensionPromptsBridge()
    const basePromptMessages = buildStGeneratePromptMessages(stCompatChatOverride, stCompatExtensionPrompts)
    const promptLifecycle = llmConfig.customApiFormat === 'openai_completion'
      ? 'text_completion'
      : 'chat_completion'
    const hookPromptMessages = await runStPromptLifecycleBridge(
      basePromptMessages,
      generationType,
      promptLifecycle,
    )
    const stCompatPromptMessages = equalStPromptMessages(basePromptMessages, hookPromptMessages)
      ? undefined
      : hookPromptMessages
    const abortController = new AbortController()
    startStreamEntry(key, abortController, mode)
    emitStExtensionEvent(stEventTypes.GENERATION_STARTED, mode)

    const chunks: string[] = []
    let runId: string | undefined
    let committedLineIndex: number | undefined
    let streamFailed = false
    try {
      const response = await fetchResponse(abortController.signal, {
        chatOverride: stCompatChatOverride,
        extensionPrompts: stCompatExtensionPrompts,
        ...(stCompatPromptMessages ? { promptMessages: stCompatPromptMessages } : {}),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '请求失败' }))
        toast.error(err.error ?? '请求失败')
        endStream(key)
        emitStExtensionEvent(stEventTypes.GENERATION_ENDED)
        return
      }

      await consumeSSEStream(response, {
        onChunk: (chunk) => {
          chunks.push(chunk)
          const text = chunks.join('')
          appendStream(key, text)
          emitStExtensionEvent(stEventTypes.STREAM_TOKEN_RECEIVED, text)
        },
        onError: (error) => {
          streamFailed = true
          toast.error(error.error)
        },
        onComplete: (metadata) => {
          runId = metadata.runId
          committedLineIndex = metadata.committedLineIndex
        },
      })
    } catch (err) {
      if (abortController.signal.aborted) {
        endStream(key)
        return
      }
      streamFailed = true
      console.error('[Stream Error]', err)
      toast.error(err instanceof ApiRequestError ? err.apiError.error : 'AI 响应失败，请检查 LLM 配置')
    }

    const accumulated = chunks.join('')
    if (!streamFailed) {
      const finalGeneratedContent = await runStGenerationBeforeEndBridge(
        accumulated,
        stGenerationId(charName, chatId, generatedMessageId, generationType),
      )
      const assistantLine: ChatLine = {
        name: charDisplayName,
        is_user: false,
        is_system: false,
        send_date: new Date().toISOString(),
        mes: finalGeneratedContent,
        extra: {},
      }
      const cacheKey = ['chats', charName, chatId]
      const currentChat = queryClient.getQueryData<ChatDetail>(cacheKey)
      const baseLines = currentChat?.lines ?? stSnapshotToChatLines(stChatSnapshot)
      let nativeGeneratedLineIndex = resolveNativeGeneratedLineIndex(
        commitMode,
        generatedMessageId,
        baseLines,
        committedLineIndex,
      )
      let nextChatLines = applyGeneratedLineToChatLines(
        baseLines,
        assistantLine,
        commitMode,
        nativeGeneratedLineIndex,
      )
      let hasCommittedMessage = accumulated.length > 0

      if (finalGeneratedContent !== accumulated) {
        appendStream(key, finalGeneratedContent)
        if (runId) {
          try {
            const finalized = await api.runs.finalizeStOutput(runId, finalGeneratedContent)
            nativeGeneratedLineIndex = finalized.committedLineIndex
            nextChatLines = upsertFinalizedChatLine(baseLines, nativeGeneratedLineIndex, finalized.line)
            hasCommittedMessage = true
          } catch (error) {
            console.warn('[ST Compat] Failed to persist generation-before-end mutation; falling back to the server-committed generated text.', error)
            const fallbackLine: ChatLine = { ...assistantLine, mes: accumulated }
            nextChatLines = applyGeneratedLineToChatLines(baseLines, fallbackLine, commitMode, nativeGeneratedLineIndex)
            hasCommittedMessage = accumulated.length > 0
          }
        } else {
          console.warn('[ST Compat] Generation completed without a run id; plugin output mutation was not persisted.')
          const fallbackLine: ChatLine = { ...assistantLine, mes: accumulated }
          nextChatLines = applyGeneratedLineToChatLines(baseLines, fallbackLine, commitMode, nativeGeneratedLineIndex)
          hasCommittedMessage = accumulated.length > 0
        }
      }

      if (hasCommittedMessage) {
        queryClient.setQueryData<ChatDetail>(cacheKey, (old) => {
          if (!old) return old
          return { ...old, lines: nextChatLines }
        })
        await syncStExtensionContextBridge({
          activeCharacter,
          activeChatId: chatId,
          messages: chatLinesToMessages(nextChatLines),
          chatLines: nextChatLines,
        })
        await emitStExtensionEventAsync(stEventTypes.MESSAGE_RECEIVED, generatedMessageId, generationType)
        await emitStExtensionEventAsync(stEventTypes.CHARACTER_MESSAGE_RENDERED, generatedMessageId, generationType)
      }
    }

    endStream(key)
    emitStExtensionEvent(stEventTypes.GENERATION_ENDED)
  }, [activeCharacter, toast, queryClient, startStreamEntry, appendStream, endStream, messages, genConfig.contextLength])

  const handleSend = useCallback(async (content: string) => {
    if (!activeCharacter || !activeChatId) return

    const key = streamKey(activeCharacter.file_name, activeChatId)
    if (streams[key]) return // 防止重复请求

    const charName = activeCharacter.file_name
    const charDisplayName = activeCharacter.name
    const chatId = activeChatId

    let newLine: ChatLine
    try {
      newLine = await sendMessage.mutateAsync({ characterName: charName, chatId, content })
      emitStExtensionEvent(stEventTypes.MESSAGE_SENT, messages.length)
    } catch {
      toast.error('发送消息失败')
      return
    }

    await runStream(
      charName,
      charDisplayName,
      chatId,
      (signal, stCompat) =>
        generateStream.mutateAsync({ characterName: charName, chatId, config: llmConfig, signal, genOverrides: genConfig, stCompat }),
      'append',
      buildStGenerationChat(messages, charDisplayName, newLine),
    )
  }, [activeCharacter, activeChatId, streams, sendMessage, generateStream, llmConfig, genConfig, runStream, toast, messages])

  const handleStop = useCallback(() => {
    if (currentKey) abortStream(currentKey)
    emitStExtensionEvent(stEventTypes.GENERATION_STOPPED)
  }, [currentKey, abortStream])

  const handleDeleteMessage = useCallback(async (lineIndex: number) => {
    if (!activeCharacter || !activeChatId) return
    try {
      await api.chats.deleteMessage(activeCharacter.file_name, activeChatId, lineIndex)
      queryClient.setQueryData<ChatDetail>(['chats', activeCharacter.file_name, activeChatId], (old) => {
        if (!old) return old
        return { ...old, lines: old.lines.filter((_, i) => i !== lineIndex) }
      })
      emitStExtensionEvent(stEventTypes.MESSAGE_DELETED, lineIndex)
      toast.success('消息已删除')
    } catch {
      toast.error('删除消息失败')
    }
  }, [activeCharacter, activeChatId, queryClient, toast])

  const handleEditMessage = useCallback(async (lineIndex: number, content: string) => {
    if (!activeCharacter || !activeChatId) return
    try {
      const updated = await api.chats.editMessage(activeCharacter.file_name, activeChatId, lineIndex, content)
      queryClient.setQueryData<ChatDetail>(['chats', activeCharacter.file_name, activeChatId], (old) => {
        if (!old) return old
        const lines = [...old.lines]
        lines[lineIndex] = { ...lines[lineIndex], ...updated }
        return { ...old, lines }
      })
      emitStExtensionEvent(stEventTypes.MESSAGE_EDITED, lineIndex)
      emitStExtensionEvent(stEventTypes.MESSAGE_UPDATED, lineIndex)
      toast.success('消息已编辑')
    } catch {
      toast.error('编辑消息失败')
    }
  }, [activeCharacter, activeChatId, queryClient, toast])

  const handleRegenerate = useCallback(async (lineIndex: number) => {
    if (!activeCharacter || !activeChatId) return

    const key = streamKey(activeCharacter.file_name, activeChatId)
    if (streams[key]) return // 防止重复请求

    const charName = activeCharacter.file_name
    const charDisplayName = activeCharacter.name
    const chatId = activeChatId

    const stChatSnapshot = buildStGenerationChat(
      messages.filter(message => message.lineIndex !== lineIndex),
      charDisplayName,
    )

    await runStream(
      charName,
      charDisplayName,
      chatId,
      (signal, stCompat) =>
        api.chats.regenerate(charName, chatId, llmConfig, { signal, genOverrides: genConfig, stCompat }),
      'append',
      stChatSnapshot,
      'replace-last',
    )
  }, [activeCharacter, activeChatId, streams, llmConfig, genConfig, runStream, messages])

  const handleSwipe = useCallback(async (lineIndex: number, swipeId: number) => {
    if (!activeCharacter || !activeChatId) return
    try {
      const updated = await api.chats.switchSwipe(activeCharacter.file_name, activeChatId, lineIndex, swipeId)
      queryClient.setQueryData<ChatDetail>(['chats', activeCharacter.file_name, activeChatId], (old) => {
        if (!old) return old
        const lines = [...old.lines]
        lines[lineIndex] = { ...lines[lineIndex], ...updated }
        return { ...old, lines }
      })
      emitStExtensionEvent(stEventTypes.MESSAGE_SWIPED, lineIndex)
    } catch {
      toast.error('切换 Swipe 失败')
    }
  }, [activeCharacter, activeChatId, queryClient, toast])

  const handleContinue = useCallback(async () => {
    if (!activeCharacter || !activeChatId) return

    const key = streamKey(activeCharacter.file_name, activeChatId)
    if (streams[key]) return // 防止重复请求

    const charName = activeCharacter.file_name
    const charDisplayName = activeCharacter.name
    const chatId = activeChatId

    await runStream(charName, charDisplayName, chatId, (signal, stCompat) =>
      api.chats.continue(charName, chatId, llmConfig, { signal, genOverrides: genConfig, stCompat }),
      'continue',
    )
  }, [activeCharacter, activeChatId, streams, llmConfig, genConfig, runStream])

  const latestRecoverableRun = recoverableRuns.data?.[0] ?? null

  const handleCommitRun = useCallback(async (runId: string) => {
    if (!activeCharacter || !activeChatId) return
    try {
      await commitRun.mutateAsync(runId)
      await queryClient.invalidateQueries({ queryKey: ['chats', activeCharacter.file_name, activeChatId] })
      toast.success('已恢复中断回复')
    } catch {
      toast.error('恢复回复失败')
    }
  }, [activeCharacter, activeChatId, commitRun, queryClient, toast])

  const handleDiscardRun = useCallback(async (runId: string) => {
    try {
      await discardRun.mutateAsync(runId)
      toast.success('已忽略中断回复')
    } catch {
      toast.error('忽略回复失败')
    }
  }, [discardRun, toast])

  const streamMode = currentStream?.mode ?? 'append'

  const displayMessages = useMemo(() => {
    if (!isStreaming || !streamContent) return messages
    if (streamMode === 'continue' && messages.length > 0) {
      const last = messages[messages.length - 1]
      return [
        ...messages.slice(0, -1),
        { ...last, content: last.content + streamContent },
      ]
    }
    return [
      ...messages,
      {
        id: 'streaming',
        role: 'assistant' as const,
        content: streamContent,
        timestamp: Date.now(),
      },
    ]
  }, [messages, isStreaming, streamContent, streamMode])

  return {
    isStreaming,
    displayMessages,
    handleSend,
    handleStop,
    handleDeleteMessage,
    handleEditMessage,
    handleRegenerate,
    handleSwipe,
    handleContinue,
    recoverableRun: latestRecoverableRun,
    handleCommitRun,
    handleDiscardRun,
  }
}
