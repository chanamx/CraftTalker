import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useChatStore, streamKey } from '@/stores/chat-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useSendMessage, useGenerateStream } from '@/hooks/use-chats'
import { useCommitRun, useDiscardRun, useRecoverableRuns } from '@/hooks/use-runs'
import { ApiRequestError, api, consumeSSEStream, type ChatDetail } from '@/lib/api'
import { emitStExtensionEvent, stEventTypes } from '@/lib/st-extension-bridge'
import { useToast } from '@/lib/toast'
import type { ChatMessage } from '@/types'

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
    fetchResponse: (signal: AbortSignal) => Promise<Response>,
    mode: 'append' | 'continue' = 'append',
  ) => {
    const key = streamKey(charName, chatId)
    const abortController = new AbortController()
    startStreamEntry(key, abortController, mode)
    emitStExtensionEvent(stEventTypes.GENERATION_STARTED, mode)

    const chunks: string[] = []
    try {
      const response = await fetchResponse(abortController.signal)

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
          appendStream(key, chunks.join(''))
        },
        onError: (error) => {
          toast.error(error.error)
        },
      })
    } catch (err) {
      if (abortController.signal.aborted) {
        endStream(key)
        return
      }
      console.error('[Stream Error]', err)
      toast.error(err instanceof ApiRequestError ? err.apiError.error : 'AI 响应失败，请检查 LLM 配置')
    }

    const accumulated = chunks.join('')
    if (accumulated) {
      queryClient.setQueryData<ChatDetail>(['chats', charName, chatId], (old) => {
        if (!old) return old
        if (mode === 'continue') {
          const lines = [...old.lines]
          const lastIdx = lines.length - 1
          if (lastIdx > 0) {
            const last = lines[lastIdx] as Record<string, unknown>
            lines[lastIdx] = { ...last, mes: (last.mes as string ?? '') + accumulated, send_date: new Date().toISOString() }
          }
          return { ...old, lines }
        }
        return {
          ...old,
          lines: [...old.lines, {
            name: charDisplayName,
            is_user: false,
            is_system: false,
            send_date: new Date().toISOString(),
            mes: accumulated,
            extra: {},
          }],
        }
      })
    }

    endStream(key)
    emitStExtensionEvent(stEventTypes.GENERATION_ENDED)
  }, [toast, queryClient, startStreamEntry, appendStream, endStream])

  const handleSend = useCallback(async (content: string) => {
    if (!activeCharacter || !activeChatId) return

    const key = streamKey(activeCharacter.file_name, activeChatId)
    if (streams[key]) return // 防止重复请求

    const charName = activeCharacter.file_name
    const charDisplayName = activeCharacter.name
    const chatId = activeChatId

    try {
      await sendMessage.mutateAsync({ characterName: charName, chatId, content })
      emitStExtensionEvent(stEventTypes.MESSAGE_SENT, messages.length)
    } catch {
      toast.error('发送消息失败')
      return
    }

    await runStream(charName, charDisplayName, chatId, (signal) =>
      generateStream.mutateAsync({ characterName: charName, chatId, config: llmConfig, signal, genOverrides: genConfig })
    )
  }, [activeCharacter, activeChatId, streams, sendMessage, generateStream, llmConfig, genConfig, runStream, toast, messages.length])

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

  const handleRegenerate = useCallback(async (_lineIndex: number) => {
    if (!activeCharacter || !activeChatId) return

    const key = streamKey(activeCharacter.file_name, activeChatId)
    if (streams[key]) return // 防止重复请求

    const charName = activeCharacter.file_name
    const charDisplayName = activeCharacter.name
    const chatId = activeChatId

    await runStream(charName, charDisplayName, chatId, (signal) =>
      api.chats.regenerate(charName, chatId, llmConfig, undefined, undefined, signal, genConfig)
    )
  }, [activeCharacter, activeChatId, streams, llmConfig, genConfig, runStream])

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

    await runStream(charName, charDisplayName, chatId, (signal) =>
      api.chats.continue(charName, chatId, llmConfig, undefined, undefined, signal, genConfig),
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
