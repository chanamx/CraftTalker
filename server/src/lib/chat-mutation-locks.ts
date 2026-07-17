import { AsyncLocalStorage } from 'node:async_hooks'
import { createAbortError } from './abort.js'

interface HeldChatLock {
  active: boolean
}

const heldLocks = new AsyncLocalStorage<Map<string, HeldChatLock>>()
const activeTails = new Map<string, Promise<void>>()

function lockKey(characterName: string, chatId: string): string {
  return `${characterName}\u0000${chatId}`
}

export interface ChatMutationLockOptions {
  signal?: AbortSignal
}

function waitForLockTurn(previous: Promise<void>, signal?: AbortSignal): Promise<boolean> {
  if (!signal) return previous.then(() => true)
  if (signal.aborted) return Promise.resolve(false)

  return new Promise(resolve => {
    let settled = false
    const finish = (acquired: boolean) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      resolve(acquired)
    }
    const onAbort = () => finish(false)
    signal.addEventListener('abort', onAbort, { once: true })
    void previous.then(() => finish(true))
  })
}
export async function withChatMutationLock<T>(
  characterName: string,
  chatId: string,
  operation: () => Promise<T>,
  options: ChatMutationLockOptions = {},
): Promise<T> {
  const key = lockKey(characterName, chatId)
  const held = heldLocks.getStore()
  if (held?.get(key)?.active) return operation()
  if (options.signal?.aborted) throw createAbortError(options.signal, 'Chat mutation lock acquisition aborted')

  const previous = activeTails.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  activeTails.set(key, current)
  const releaseCurrent = () => {
    release()
    if (activeTails.get(key) === current) activeTails.delete(key)
  }

  const acquired = await waitForLockTurn(previous, options.signal)
  if (!acquired) {
    void previous.then(releaseCurrent)
    if (!options.signal) throw new Error('Chat mutation lock acquisition failed')
    throw createAbortError(options.signal, 'Chat mutation lock acquisition aborted')
  }
  if (options.signal?.aborted) {
    releaseCurrent()
    throw createAbortError(options.signal, 'Chat mutation lock acquisition aborted')
  }

  const token: HeldChatLock = { active: true }
  const nextHeld = new Map(held)
  nextHeld.set(key, token)
  try {
    return await heldLocks.run(nextHeld, operation)
  } finally {
    token.active = false
    releaseCurrent()
  }
}

export function clearChatMutationLocksForTest(): void {
  if (process.env.NODE_ENV === 'test') activeTails.clear()
}

export async function withChatMutationLocks<T>(
  keys: Array<{ characterName: string; chatId: string }>,
  operation: () => Promise<T>,
): Promise<T> {
  const ordered = [...keys].sort((left, right) => {
    const leftKey = lockKey(left.characterName, left.chatId)
    const rightKey = lockKey(right.characterName, right.chatId)
    return leftKey.localeCompare(rightKey)
  })
  const unique = ordered.filter((item, index) => index === 0 || lockKey(item.characterName, item.chatId) !== lockKey(ordered[index - 1].characterName, ordered[index - 1].chatId))
  const acquire = async (index: number): Promise<T> => {
    if (index >= unique.length) return operation()
    const item = unique[index]
    return withChatMutationLock(item.characterName, item.chatId, () => acquire(index + 1))
  }
  return acquire(0)
}
