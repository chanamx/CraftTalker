import type { Context } from 'hono'
import * as chatService from '../services/chat.service.js'
import * as characterService from '../services/character.service.js'
import * as presetService from '../services/preset.service.js'
import { AppError, ErrorCode } from '../lib/errors.js'
import {
  acquireGenerationLock,
  type GenerationLockInfo,
  type GenerationLock,
  type GenerationOperation,
} from '../lib/generation-locks.js'
import { resolveLlmConfigApiKey, type LLMConfig } from '../lib/llm-config.js'
import { resolveRuntimeOwnerId } from '../config/runtime.js'
import * as runService from '../services/run.service.js'
import type { EngineMessage, EnginePromptAnchors } from '../engine/types.js'
import type { WorldInfoChatMessage } from '../lib/world-info-compat.js'
import type { MatchedEntry } from '../lib/world-match.js'
import {
  executeNonStreamGeneration,
  GenerationStreamExecution,
} from '../services/generation-executor.js'

export interface GenerationOverrides {
  temperature?: number
  topP?: number
  contextLength?: number
  maxReplyLength?: number
}

export interface StCompatChatOverrideLine {
  name?: string
  is_user?: boolean
  is_system?: boolean
  mes: string
}

export interface StCompatExtensionPrompt {
  key: string
  value: string
  position?: number
  depth?: number
  scan?: boolean
  role?: number
}

export interface StCompatPromptMessage {
  role: EngineMessage['role']
  content: string
}

type Character = Awaited<ReturnType<typeof characterService.getCharacter>>
type Chat = Awaited<ReturnType<typeof chatService.getChat>>
type GenerationRun = Awaited<ReturnType<typeof runService.createGenerationRun>>
type WorldEntries = MatchedEntry[] | undefined

interface ChatMessageForGeneration extends WorldInfoChatMessage {
  role: EngineMessage['role']
}

export type LoadWorldEntries = (
  character: Character,
  chat: Chat,
  messages: ChatMessageForGeneration[],
  maxContext: number,
  model?: string,
  userName?: string,
  operation?: GenerationOperation,
  preset?: { type?: string; name?: string; regexScripts?: unknown[] },
  scanInjects?: string[],
) => Promise<WorldEntries>

interface PreparedGenerationContext {
  character: Character
  preset: presetService.GenerationPreset
  config: LLMConfig
  userName?: string
  messages: EngineMessage[]
  promptAnchors?: EnginePromptAnchors
  worldEntries: WorldEntries
}

export async function handleGenerate(input: {
  c: Context
  characterName: string
  chatId: string
  config: LLMConfig
  presetType?: presetService.GenerationPresetType
  presetName?: string
  stream?: boolean
  genOverrides?: GenerationOverrides
  isContinue?: boolean
  operation?: GenerationOperation
  beforeGenerate?: () => Promise<void>
  stCompatChatOverride?: StCompatChatOverrideLine[]
  stCompatExtensionPrompts?: StCompatExtensionPrompt[]
  stCompatPromptMessages?: StCompatPromptMessage[]
  loadWorldEntries: LoadWorldEntries
}) {
  const stream = input.stream ?? true
  const isContinue = input.isContinue ?? false
  const operation = input.operation ?? 'generate'
  const admission = await acquireGenerationLock({
    characterName: input.characterName,
    chatId: input.chatId,
    operation,
    signal: input.c.req.raw.signal,
    ownerId: resolveRuntimeOwnerId(),
    providerKey: input.config.source ?? input.config.type,
  })
  if (admission.status === 'rejected') {
    switch (admission.reason) {
      case 'not_accepting':
        return generationUnavailableResponse(input.c)
      case 'queue_full':
        return generationQueueBackpressureResponse(input.c, admission.retryAfterSeconds ?? 1, false)
      case 'queue_timeout':
        return generationQueueBackpressureResponse(input.c, admission.retryAfterSeconds ?? 1, true)
      case 'client_aborted':
        return generationCanceledBeforeStartResponse(input.c)
      case 'duplicate':
        return generationInProgressResponse(
          input.c,
          input.characterName,
          input.chatId,
          admission.existing,
        )
    }
  }
  const lock = admission.lock

  let run: GenerationRun | null = null
  let handlerOwnsRun = false
  let streamOwnsLock = false

  try {
    await runService.interruptActiveRunsForChat(input.characterName, input.chatId)
    run = await runService.createGenerationRun({
      characterName: input.characterName,
      chatId: input.chatId,
      operation,
    })

    const context = await prepareGenerationContext({
      characterName: input.characterName,
      chatId: input.chatId,
      config: input.config,
      presetType: input.presetType,
      presetName: input.presetName,
      genOverrides: input.genOverrides,
      beforeGenerate: input.beforeGenerate,
      stCompatChatOverride: input.stCompatChatOverride,
      stCompatExtensionPrompts: input.stCompatExtensionPrompts,
      stCompatPromptMessages: input.stCompatPromptMessages,
      loadWorldEntries: input.loadWorldEntries,
      operation,
    })

    if (stream) {
      const response = handleStreamGeneration(input.c, context, run, lock, isContinue)
      handlerOwnsRun = true
      streamOwnsLock = true
      return response
    }

    handlerOwnsRun = true
    return await handleNonStreamGeneration(input.c, context, run, lock, isContinue)
  } catch (error) {
    if (run && !handlerOwnsRun) {
      await runService.failRun(run.runId, {
        error: getErrorMessage(error),
        partialContent: '',
      }).catch(() => {})
    }
    throw error
  } finally {
    if (!streamOwnsLock) lock.release()
  }
}

function generationUnavailableResponse(c: Context) {
  return c.json({
    error: 'Server is shutting down and cannot accept new generation requests',
    code: ErrorCode.SERVICE_UNAVAILABLE,
  }, 503)
}

function generationInProgressResponse(
  c: Context,
  characterName: string,
  chatId: string,
  active?: GenerationLockInfo,
) {
  return c.json({
    error: '当前聊天正在生成，请稍后再试',
    code: ErrorCode.GENERATION_IN_PROGRESS,
    details: active ? {
      characterName: active.characterName,
      chatId: active.chatId,
      operation: active.operation,
      startedAt: active.startedAt,
    } : { characterName, chatId },
  }, 409)
}

function generationQueueBackpressureResponse(
  c: Context,
  retryAfterSeconds: number,
  timedOut: boolean,
) {
  return c.json({
    error: timedOut
      ? 'Generation queue wait timed out. Please retry shortly.'
      : 'Generation queue is full. Please retry shortly.',
    code: ErrorCode.GENERATION_QUEUE_FULL,
    details: { retryAfterSeconds },
  }, 429, { 'Retry-After': String(retryAfterSeconds) })
}

function generationCanceledBeforeStartResponse(c: Context) {
  return c.json({
    error: 'Generation request was canceled before execution started.',
    code: ErrorCode.VALIDATION_ERROR,
  }, 408)
}

async function prepareGenerationContext(input: {
  characterName: string
  chatId: string
  config: LLMConfig
  presetType?: presetService.GenerationPresetType
  presetName?: string
  genOverrides?: GenerationOverrides
  beforeGenerate?: () => Promise<void>
  stCompatChatOverride?: StCompatChatOverrideLine[]
  stCompatExtensionPrompts?: StCompatExtensionPrompt[]
  stCompatPromptMessages?: StCompatPromptMessage[]
  loadWorldEntries: LoadWorldEntries
  operation: GenerationOperation
}): Promise<PreparedGenerationContext> {
  const resolvedConfig = resolveLlmConfigApiKey(input.config)

  await input.beforeGenerate?.()
  const character = await characterService.getCharacter(input.characterName)
  const chat = await chatService.getChat(input.characterName, input.chatId)
  const basePreset = await presetService.getGenerationPreset(input.presetType, input.presetName)
  const preset = mergePresetWithOverrides(basePreset, input.genOverrides)
  const userName = extractUserName(chat)
  const chatMessages = input.stCompatChatOverride
    ? extractStCompatChatOverrideMessages(input.stCompatChatOverride)
    : extractChatMessages(chat)
  const extensionPrompts = input.stCompatExtensionPrompts ?? []
  const hasPromptMessageOverride = input.stCompatPromptMessages !== undefined
  const promptAnchors = hasPromptMessageOverride ? undefined : buildStCompatPromptAnchors(extensionPrompts)
  const messagesWithExtensionPrompts = applyStCompatExtensionPrompts(
    chatMessages,
    extensionPrompts.filter(prompt => !isMainPromptAnchor(prompt)),
  )
  const promptMessages = hasPromptMessageOverride
    ? extractStCompatPromptMessages(input.stCompatPromptMessages ?? [])
    : messagesWithExtensionPrompts
  const scanInjects = extensionPrompts
    .filter(prompt => prompt.scan === true && prompt.value)
    .map(prompt => prompt.value)
  const messages = promptMessages.map(({ role, content }) => ({ role, content }))
  const worldEntries = await input.loadWorldEntries(
    character,
    chat,
    chatMessages,
    getContextLength(preset, input.genOverrides),
    resolvedConfig.model,
    userName,
    input.operation,
    {
      type: input.presetType,
      name: preset.name,
      regexScripts: Array.isArray(preset.regex_scripts) ? preset.regex_scripts : undefined,
    },
    scanInjects,
  )

  return {
    character,
    preset,
    config: resolvedConfig,
    userName,
    messages,
    promptAnchors,
    worldEntries,
  }
}

function handleStreamGeneration(
  c: Context,
  context: PreparedGenerationContext,
  run: GenerationRun,
  lock: GenerationLock,
  isContinue: boolean,
) {
  const execution = new GenerationStreamExecution({
    run,
    isContinue,
    clientSignal: c.req.raw.signal,
    shutdownSignal: lock.signal,
    request: {
      messages: context.messages,
      character: context.character,
      preset: context.preset,
      config: context.config,
      userName: context.userName,
      promptAnchors: context.promptAnchors,
      worldEntries: context.worldEntries,
    },
  })
  const encoder = new TextEncoder()
  let sourceCanceled = false
  let lockReleased = false
  const releaseLock = () => {
    if (lockReleased) return
    lockReleased = true
    lock.release()
  }
  const encodeSse = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      // Keep `start` non-blocking so a client cancellation can reach the
      // underlying source while the generator is still waiting on upstream.
      void (async () => {
        try {
          for await (const event of execution.events()) {
            if (event.type === 'chunk') {
              controller.enqueue(encodeSse({ content: event.content }))
              continue
            }
            controller.enqueue(encodeSse({
              done: true,
              runId: event.runId,
              ...(event.committedLineIndex !== undefined
                ? { committedLineIndex: event.committedLineIndex }
                : {}),
            }))
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          }
          if (!sourceCanceled) controller.close()
        } catch (error) {
          if (!sourceCanceled) {
            try {
              controller.enqueue(encodeSse(getStreamErrorPayload(error)))
              controller.close()
            } catch {
              // The client may already have disconnected.
            }
          }
        } finally {
          releaseLock()
        }
      })()
    },
    async cancel(reason) {
      sourceCanceled = true
      await execution.cancel(reason)
      releaseLock()
    },
  })

  return c.body(readable, 200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
}

async function handleNonStreamGeneration(
  c: Context,
  context: PreparedGenerationContext,
  run: GenerationRun,
  lock: GenerationLock,
  isContinue: boolean,
) {
  const response = await executeNonStreamGeneration({
    run,
    isContinue,
    clientSignal: c.req.raw.signal,
    shutdownSignal: lock.signal,
    request: {
      messages: context.messages,
      character: context.character,
      preset: context.preset,
      config: context.config,
      userName: context.userName,
      promptAnchors: context.promptAnchors,
      worldEntries: context.worldEntries,
    },
  })

  return c.json({
    content: response.content,
    finishReason: response.finishReason,
    usage: response.usage,
  })
}

function mergePresetWithOverrides(
  basePreset: presetService.GenerationPreset,
  genOverrides?: GenerationOverrides,
): presetService.GenerationPreset {
  if (!genOverrides) return basePreset
  return {
    ...basePreset,
    ...(genOverrides.temperature !== undefined && { temperature: genOverrides.temperature }),
    ...(genOverrides.topP !== undefined && { top_p: genOverrides.topP }),
    ...(genOverrides.maxReplyLength !== undefined && { max_tokens: genOverrides.maxReplyLength }),
    ...(genOverrides.contextLength !== undefined && { max_context: genOverrides.contextLength }),
  }
}

function extractUserName(chat: Chat): string | undefined {
  const metadata = chat.lines[0] as { user_name?: string }
  return metadata?.user_name
}

function extractChatMessages(chat: Chat): ChatMessageForGeneration[] {
  return chat.lines
    .filter(line => 'mes' in line)
    .map(line => {
      const message = line as { name?: string; is_user: boolean; is_system?: boolean; mes: string }
      return {
        name: message.name,
        role: message.is_system ? 'system' as const : message.is_user ? 'user' as const : 'assistant' as const,
        content: message.mes,
      }
    })
}

function extractStCompatChatOverrideMessages(lines: StCompatChatOverrideLine[]): ChatMessageForGeneration[] {
  return lines.map(line => ({
    name: line.name,
    role: line.is_system ? 'system' as const : line.is_user ? 'user' as const : 'assistant' as const,
    content: line.mes,
  }))
}

function extractStCompatPromptMessages(messages: StCompatPromptMessage[]): ChatMessageForGeneration[] {
  return messages.map(message => ({
    role: message.role,
    content: message.content,
  }))
}

const EXTENSION_PROMPT_POSITION = {
  NONE: -1,
  IN_PROMPT: 0,
  IN_CHAT: 1,
  BEFORE_PROMPT: 2,
  AFTER_PROMPT: 3,
} as const

const EXTENSION_PROMPT_ROLE = {
  SYSTEM: 0,
  USER: 1,
  ASSISTANT: 2,
} as const

function extensionPromptRole(role: StCompatExtensionPrompt['role']): ChatMessageForGeneration['role'] {
  switch (role) {
    case EXTENSION_PROMPT_ROLE.USER:
      return 'user'
    case EXTENSION_PROMPT_ROLE.ASSISTANT:
      return 'assistant'
    case EXTENSION_PROMPT_ROLE.SYSTEM:
    default:
      return 'system'
  }
}

function isMainPromptAnchor(prompt: StCompatExtensionPrompt): boolean {
  return prompt.position === EXTENSION_PROMPT_POSITION.BEFORE_PROMPT
    || prompt.position === EXTENSION_PROMPT_POSITION.IN_PROMPT
}

function buildStCompatPromptAnchors(prompts: StCompatExtensionPrompt[]): EnginePromptAnchors | undefined {
  const beforeMain: EngineMessage[] = []
  const afterMain: EngineMessage[] = []

  for (const prompt of prompts) {
    if (!prompt.value) continue
    const message = { role: extensionPromptRole(prompt.role), content: prompt.value }
    if (prompt.position === EXTENSION_PROMPT_POSITION.BEFORE_PROMPT) beforeMain.push(message)
    if (prompt.position === EXTENSION_PROMPT_POSITION.IN_PROMPT) afterMain.push(message)
  }

  return beforeMain.length || afterMain.length ? { beforeMain, afterMain } : undefined
}

function extensionPromptMessage(prompt: StCompatExtensionPrompt): ChatMessageForGeneration {
  return {
    name: prompt.key,
    role: extensionPromptRole(prompt.role),
    content: prompt.value,
  }
}

function applyStCompatExtensionPrompts(
  messages: ChatMessageForGeneration[],
  prompts: StCompatExtensionPrompt[],
): ChatMessageForGeneration[] {
  if (prompts.length === 0) return messages

  const result = [...messages]
  const before: ChatMessageForGeneration[] = []
  const after: ChatMessageForGeneration[] = []
  const inChat: StCompatExtensionPrompt[] = []

  for (const prompt of prompts) {
    if (!prompt.value) continue
    if (prompt.position === EXTENSION_PROMPT_POSITION.NONE) continue

    if (prompt.position === EXTENSION_PROMPT_POSITION.IN_CHAT) {
      inChat.push(prompt)
      continue
    }

    const message = extensionPromptMessage(prompt)
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
    const role = prompt.role === EXTENSION_PROMPT_ROLE.USER || prompt.role === EXTENSION_PROMPT_ROLE.ASSISTANT
      ? prompt.role
      : EXTENSION_PROMPT_ROLE.SYSTEM
    const byRole = grouped.get(depth) ?? new Map<number, string[]>()
    const contents = byRole.get(role) ?? []
    contents.push(content)
    byRole.set(role, contents)
    grouped.set(depth, byRole)
  }

  for (const depth of [...grouped.keys()].sort((left, right) => left - right)) {
    const insertIdx = Math.max(0, originalMessageCount - depth)
    const byRole = grouped.get(depth)
    for (const role of [EXTENSION_PROMPT_ROLE.SYSTEM, EXTENSION_PROMPT_ROLE.USER, EXTENSION_PROMPT_ROLE.ASSISTANT]) {
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

function getContextLength(
  preset: presetService.GenerationPreset,
  genOverrides?: GenerationOverrides,
): number {
  const override = genOverrides?.contextLength
  if (typeof override === 'number' && Number.isFinite(override)) return override
  const presetContext = preset.max_context
  if (typeof presetContext === 'number' && Number.isFinite(presetContext)) return presetContext
  return 4096
}

function getStreamErrorPayload(error: unknown): { error: string; code: ErrorCode; details?: Record<string, unknown> } {
  if (error instanceof AppError) {
    return { error: error.message, code: error.code, details: error.details }
  }
  return { error: '生成过程中发生错误', code: ErrorCode.UNKNOWN_ERROR }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
