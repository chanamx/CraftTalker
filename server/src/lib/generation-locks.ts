export type GenerationOperation = 'generate' | 'regenerate' | 'continue'

export interface GenerationLockInfo {
  characterName: string
  chatId: string
  operation: GenerationOperation
  startedAt: number
}

export interface GenerationLock extends GenerationLockInfo {
  release: () => void
}

const activeLocks = new Map<string, GenerationLockInfo>()

function lockKey(characterName: string, chatId: string): string {
  return `${characterName}\u0000${chatId}`
}

export function tryAcquireGenerationLock(
  characterName: string,
  chatId: string,
  operation: GenerationOperation,
): GenerationLock | null {
  const key = lockKey(characterName, chatId)
  if (activeLocks.has(key)) return null

  const info: GenerationLockInfo = {
    characterName,
    chatId,
    operation,
    startedAt: Date.now(),
  }
  activeLocks.set(key, info)

  let released = false
  return {
    ...info,
    release: () => {
      if (released) return
      released = true
      if (activeLocks.get(key) === info) {
        activeLocks.delete(key)
      }
    },
  }
}

export function getGenerationLockInfo(characterName: string, chatId: string): GenerationLockInfo | null {
  return activeLocks.get(lockKey(characterName, chatId)) ?? null
}

export function clearGenerationLocksForTest(): void {
  if (process.env.NODE_ENV === 'test') {
    activeLocks.clear()
  }
}
