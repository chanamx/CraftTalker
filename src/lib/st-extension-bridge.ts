import type { ChatLine } from '@/lib/api'
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
  GENERATION_STARTED: 'generation_started',
  GENERATION_STOPPED: 'generation_stopped',
  GENERATION_ENDED: 'generation_ended',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_SWIPED: 'message_swiped',
} as const

let hostPromise: Promise<StExtensionHostModule> | null = null
let hostReadyPromise: Promise<StExtensionHostModule> | null = null
let latestContext: Partial<StHostContextState> | null = null

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

export function initializeStExtensionHostBridge(): void {
  void initializeHost().catch((error: unknown) => {
    console.error('Failed to initialize the ST extension host.', error)
  })
}

export function updateStExtensionContextBridge(next: Partial<StHostContextState>): void {
  latestContext = next
  void initializeHost()
    .then(host => host.updateStExtensionContext(next))
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

