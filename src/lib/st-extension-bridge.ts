import type { ChatLine } from '@/lib/api'
import type { StCompatExtensionPrompt, StCompatPromptMessage } from '@/lib/api-types'
import type { Character, ChatMessage } from '@/types'

type StExtensionHostModule = typeof import('@/lib/st-extension-host')

interface StHostContextState {
  activeCharacter: Character | null
  activeChatId: string | null
  characters: Character[]
  messages: ChatMessage[]
  chatLines: ChatLine[]
}

export const stEventTypes = {
  GENERATION_BEFORE_END: 'js_generation_before_end',
  GENERATION_STARTED: 'generation_started',
  GENERATION_STOPPED: 'generation_stopped',
  GENERATION_ENDED: 'generation_ended',
  STREAM_TOKEN_RECEIVED: 'stream_token_received',
  MESSAGE_RECEIVED: 'message_received',
  CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_SWIPED: 'message_swiped',
} as const

let hostPromise: Promise<StExtensionHostModule> | null = null
let hostReadyPromise: Promise<StExtensionHostModule> | null = null
let latestContext: Partial<StHostContextState> | null = null
const MAX_GENERATION_BEFORE_END_MESSAGE_CHARS = 200_000

function loadHost() {
  hostPromise ??= import('@/lib/st-extension-host')
  return hostPromise
}

function initializeHost() {
  hostReadyPromise ??= loadHost().then(async (host) => {
    if (latestContext) host.updateStExtensionContext(latestContext)
    await host.initializeStExtensionHost()
    if (latestContext) host.updateStExtensionContext(latestContext)
    return host
  })
  return hostReadyPromise
}

function mergeLatestContext(next: Partial<StHostContextState>): Partial<StHostContextState> {
  latestContext = { ...(latestContext ?? {}), ...next }
  return latestContext
}

export function initializeStExtensionHostBridge(): void {
  void initializeHost().catch((error: unknown) => {
    console.error('Failed to initialize the ST extension host.', error)
  })
}

export function updateStExtensionContextBridge(next: Partial<StHostContextState>): void {
  mergeLatestContext(next)
  void initializeHost()
    .then((host) => {
      if (latestContext) host.updateStExtensionContext(latestContext)
    })
    .catch((error: unknown) => {
      console.warn('[ST Compat] Failed to update extension context.', error)
    })
}

export function syncStExtensionContextBridge(next: Partial<StHostContextState>): Promise<void> {
  mergeLatestContext(next)
  return initializeHost()
    .then((host) => {
      if (latestContext) host.updateStExtensionContext(latestContext)
    })
    .catch((error: unknown) => {
      console.warn('[ST Compat] Failed to update extension context.', error)
    })
}

export function emitStExtensionEvent(type: string, ...args: unknown[]): void {
  void initializeHost()
    .then(host => host.eventSource.emit(type, ...args))
    .catch((error: unknown) => {
      console.warn('[ST Compat] Failed to emit extension event.', type, error)
    })
}

export function emitStExtensionEventAsync(type: string, ...args: unknown[]): Promise<void> {
  return initializeHost()
    .then(host => host.eventSource.emit(type, ...args))
    .catch((error: unknown) => {
      console.warn('[ST Compat] Failed to emit extension event.', type, error)
    })
}

export function runStGenerationInterceptorsBridge(
  chat: unknown[],
  contextSize: number,
  type: string,
): Promise<boolean> {
  return initializeHost()
    .then(host => host.runGenerationInterceptors(chat, contextSize, type))
    .catch((error: unknown) => {
      console.warn('[ST Compat] Failed to run generation interceptors.', error)
      return false
    })
}

function sanitizeStPromptMessages(value: unknown): StCompatPromptMessage[] {
  if (typeof value === 'string') {
    return [{ role: 'user', content: value }]
  }

  if (!Array.isArray(value)) return []

  return value.flatMap((message) => {
    if (typeof message !== 'object' || message === null) return []
    const source = message as Record<string, unknown>
    if (typeof source.content !== 'string') return []

    const role = source.role === 'system' || source.role === 'assistant' || source.role === 'user'
      ? source.role
      : 'user'

    return [{
      role,
      content: source.content,
    }]
  })
}

export type StPromptLifecycle = 'chat_completion' | 'text_completion'

export function runStPromptLifecycleBridge(
  promptMessages: StCompatPromptMessage[],
  type: string,
  lifecycle: StPromptLifecycle,
): Promise<StCompatPromptMessage[]> {
  return initializeHost()
    .then(async (host) => {
      const prompt = sanitizeStPromptMessages(promptMessages)
      await host.eventSource.emit(host.event_types.GENERATION_AFTER_COMMANDS, type, {}, false)

      const generateData = { prompt: prompt.map(message => ({ ...message })), type }
      await host.eventSource.emit(host.event_types.GENERATE_AFTER_DATA, generateData, false)
      const generatedPrompt = sanitizeStPromptMessages(generateData.prompt)
      const promptAfterGenerate = Array.isArray(generateData.prompt) && generateData.prompt.length === 0
        ? []
        : generatedPrompt.length > 0 ? generatedPrompt : prompt

      if (lifecycle === 'text_completion') return promptAfterGenerate

      const chatCompletionData = { messages: promptAfterGenerate.map(message => ({ ...message })), type }
      await host.eventSource.emit(host.event_types.CHAT_COMPLETION_SETTINGS_READY, chatCompletionData)
      const sanitized = sanitizeStPromptMessages(chatCompletionData.messages)
      if (Array.isArray(chatCompletionData.messages) && chatCompletionData.messages.length === 0) return []
      return sanitized.length > 0 ? sanitized : promptAfterGenerate
    })
    .catch((error: unknown) => {
      console.warn('[ST Compat] Failed to run prompt lifecycle hooks.', error)
      return promptMessages
    })
}

export function runStGenerateAfterDataBridge(
  promptMessages: StCompatPromptMessage[],
  type: string,
): Promise<StCompatPromptMessage[]> {
  return runStPromptLifecycleBridge(promptMessages, type, 'text_completion')
}

export function runStGenerationBeforeEndBridge(message: string, generationId: string): Promise<string> {
  return initializeHost()
    .then(async (host) => {
      const payload = { message }
      await host.eventSource.emit(host.event_types.GENERATION_BEFORE_END, payload, generationId)
      if (typeof payload.message !== 'string') return message
      if (payload.message.length > MAX_GENERATION_BEFORE_END_MESSAGE_CHARS) {
        console.warn('[ST Compat] Ignored generation-before-end message mutation because it exceeded the compatibility size limit.')
        return message
      }
      return payload.message
    })
    .catch((error: unknown) => {
      console.warn('[ST Compat] Failed to run generation-before-end hooks.', error)
      return message
    })
}

export function getStExtensionPromptsBridge(): Promise<StCompatExtensionPrompt[]> {
  return initializeHost()
    .then(host => host.getExtensionPromptsSnapshot())
    .catch((error: unknown) => {
      console.warn('[ST Compat] Failed to read extension prompts.', error)
      return []
    })
}
