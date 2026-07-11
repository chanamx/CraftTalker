import type { Context } from 'hono'
import * as chatService from '../services/chat.service.js'
import * as characterService from '../services/character.service.js'
import * as presetService from '../services/preset.service.js'
import { getEngine } from '../engine/index.js'
import { AppError, ErrorCode } from '../lib/errors.js'
import {
  getGenerationLockInfo,
  tryAcquireGenerationLock,
  type GenerationLock,
  type GenerationOperation,
} from '../lib/generation-locks.js'
import { resolveLlmConfigApiKey, type LLMConfig } from '../lib/llm-config.js'
import * as runService from '../services/run.service.js'
import type { EngineMessage } from '../engine/types.js'
import type { WorldInfoChatMessage } from '../lib/world-info-compat.js'
import type { MatchedEntry } from '../lib/world-match.js'

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
) => Promise<WorldEntries>

interface PreparedGenerationContext {
  character: Character
  preset: presetService.GenerationPreset
  config: LLMConfig
  userName?: string
  messages: EngineMessage[]
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
  const lock = tryAcquireGenerationLock(input.characterName, input.chatId, operation)
  if (!lock) return generationInProgressResponse(input.c, input.characterName, input.chatId)

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
    return await handleNonStreamGeneration(input.c, context, run, isContinue)
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

function generationInProgressResponse(c: Context, characterName: string, chatId: string) {
  const active = getGenerationLockInfo(characterName, chatId)
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
  const messagesWithExtensionPrompts = applyStCompatExtensionPrompts(chatMessages, extensionPrompts)
  const promptMessages = input.stCompatPromptMessages
    ? extractStCompatPromptMessages(input.stCompatPromptMessages)
    : messagesWithExtensionPrompts
  const messagesForWorldScan = input.stCompatPromptMessages
    ? promptMessages
    : extensionPrompts.some(prompt => prompt.scan === true)
      ? applyStCompatExtensionPrompts(chatMessages, extensionPrompts.filter(prompt => prompt.scan === true))
      : chatMessages
  const messages = promptMessages.map(({ role, content }) => ({ role, content }))
  const worldEntries = await input.loadWorldEntries(
    character,
    chat,
    messagesForWorldScan,
    getContextLength(preset, input.genOverrides),
    resolvedConfig.model,
    userName,
    input.operation,
  )

  return {
    character,
    preset,
    config: resolvedConfig,
    userName,
    messages,
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
  const streamGenerator = getEngine().generateStream({
    messages: context.messages,
    character: context.character,
    preset: context.preset,
    config: context.config,
    userName: context.userName,
    signal: c.req.raw.signal,
    worldEntries: context.worldEntries,
  })
  const handler = new StreamGenerationHandler({
    run,
    lock,
    isContinue,
  })

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      await handler.handleStream(streamGenerator, controller)
    },
    cancel() {
      handler.cancel()
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
  isContinue: boolean,
) {
  let partialContent = ''

  try {
    const response = await getEngine().generate({
      messages: context.messages,
      character: context.character,
      preset: context.preset,
      config: context.config,
      userName: context.userName,
      worldEntries: context.worldEntries,
    })
    partialContent = response.content
    const committedLineIndex = await saveGeneratedContent({
      characterName: run.characterName,
      chatId: run.chatId,
      content: response.content,
      isContinue,
    })

    await runService.completeRun(run.runId, {
      partialContent: response.content,
      committedLineIndex,
    }).catch(() => {})

    return c.json({
      content: response.content,
      finishReason: response.finishReason,
      usage: response.usage,
    })
  } catch (error) {
    await runService.failRun(run.runId, {
      error: getErrorMessage(error),
      partialContent,
    }).catch(() => {})
    throw error
  }
}

class StreamGenerationHandler {
  private readonly encoder = new TextEncoder()
  private readonly chunks: string[] = []
  private canceled = false
  private saved = false
  private terminalRunStarted = false
  private lockReleased = false
  private lastPartialFlushAt = 0
  private committedLineIndex: number | undefined

  constructor(
    private readonly options: {
      run: GenerationRun
      lock: GenerationLock
      isContinue: boolean
    },
  ) {}

  async handleStream(
    streamGenerator: AsyncGenerator<string, void, unknown>,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): Promise<void> {
    try {
      for await (const chunk of streamGenerator) {
        if (this.canceled) break
        this.chunks.push(chunk)
        controller.enqueue(this.encodeSse({ content: chunk }))
        await this.flushPartial()
      }
      if (this.canceled) return

      await this.flushPartial(true)
      this.committedLineIndex = await this.saveGeneratedContent()
      await this.completeRun()
      controller.enqueue(this.encodeSse({
        done: true,
        runId: this.options.run.runId,
        ...(this.committedLineIndex !== undefined ? { committedLineIndex: this.committedLineIndex } : {}),
      }))
      controller.enqueue(this.encoder.encode('data: [DONE]\n\n'))
      controller.close()
    } catch (error) {
      if (!this.canceled) await this.handleError(error, controller)
    } finally {
      this.releaseLock()
    }
  }

  cancel(): void {
    this.canceled = true
    if (this.startTerminalRun()) {
      runService.cancelRun(this.options.run.runId, {
        partialContent: this.fullContent(),
        error: 'Client disconnected',
      }).catch(() => {})
    }
    this.releaseLock()
  }

  private async saveGeneratedContent(): Promise<number | undefined> {
    if (this.saved) return this.committedLineIndex

    this.committedLineIndex = await saveGeneratedContent({
      characterName: this.options.run.characterName,
      chatId: this.options.run.chatId,
      content: this.fullContent(),
      isContinue: this.options.isContinue,
    })
    this.saved = true
    return this.committedLineIndex
  }

  private async flushPartial(force = false): Promise<void> {
    const now = Date.now()
    if (!force && now - this.lastPartialFlushAt < 500) return
    this.lastPartialFlushAt = now
    await runService.updateRunPartial(this.options.run.runId, this.fullContent()).catch(() => {})
  }

  private async completeRun(): Promise<void> {
    if (!this.startTerminalRun()) return

    await runService.completeRun(this.options.run.runId, {
      partialContent: this.fullContent(),
      committedLineIndex: this.committedLineIndex,
    }).catch(() => {})
  }

  private async handleError(
    error: unknown,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): Promise<void> {
    if (!(error instanceof AppError)) {
      this.committedLineIndex = await this.saveGeneratedContent().catch(() => this.committedLineIndex)
    }

    if (this.startTerminalRun()) {
      await runService.failRun(this.options.run.runId, {
        error: getErrorMessage(error),
        partialContent: this.fullContent(),
        committedLineIndex: this.committedLineIndex,
      }).catch(() => {})
    }

    try {
      controller.enqueue(this.encodeSse(getStreamErrorPayload(error)))
      controller.close()
    } catch {
      // The client may already have disconnected.
    }
  }

  private startTerminalRun(): boolean {
    if (this.terminalRunStarted) return false
    this.terminalRunStarted = true
    return true
  }

  private releaseLock(): void {
    if (this.lockReleased) return
    this.lockReleased = true
    this.options.lock.release()
  }

  private fullContent(): string {
    return this.chunks.join('')
  }

  private encodeSse(payload: unknown): Uint8Array {
    return this.encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
  }
}

async function saveGeneratedContent(input: {
  characterName: string
  chatId: string
  content: string
  isContinue: boolean
}): Promise<number | undefined> {
  if (!input.content) return undefined

  if (input.isContinue) {
    const chatData = await chatService.getChat(input.characterName, input.chatId)
    const lastIdx = chatData.lines.length - 1
    const lastLine = chatData.lines[lastIdx] as { mes?: string; is_user?: boolean }
    if (lastIdx > 0 && lastLine.mes !== undefined && !lastLine.is_user) {
      await chatService.editMessage(input.characterName, input.chatId, lastIdx, lastLine.mes + input.content)
      return lastIdx
    }
    return undefined
  }

  await chatService.addMessage(input.characterName, input.chatId, false, input.content)
  const chatData = await chatService.getChat(input.characterName, input.chatId)
  return chatData.lines.length - 1
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

function extensionPromptRole(prompt: StCompatExtensionPrompt): ChatMessageForGeneration['role'] {
  switch (prompt.role) {
    case EXTENSION_PROMPT_ROLE.USER:
      return 'user'
    case EXTENSION_PROMPT_ROLE.ASSISTANT:
      return 'assistant'
    case EXTENSION_PROMPT_ROLE.SYSTEM:
    default:
      return 'system'
  }
}

function extensionPromptMessage(prompt: StCompatExtensionPrompt): ChatMessageForGeneration {
  return {
    name: prompt.key,
    role: extensionPromptRole(prompt),
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

  for (const prompt of prompts) {
    if (!prompt.value) continue
    const message = extensionPromptMessage(prompt)

    if (prompt.position === EXTENSION_PROMPT_POSITION.AFTER_PROMPT) {
      after.push(message)
      continue
    }

    if (prompt.position === EXTENSION_PROMPT_POSITION.IN_CHAT) {
      const depth = typeof prompt.depth === 'number' && Number.isFinite(prompt.depth)
        ? Math.max(0, Math.floor(prompt.depth))
        : 0
      const insertIdx = Math.max(0, result.length - depth)
      result.splice(insertIdx, 0, message)
      continue
    }

    before.push(message)
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
