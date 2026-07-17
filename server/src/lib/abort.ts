export function createAbortError(signal?: AbortSignal, fallbackMessage = 'Operation aborted'): Error {
  const reason = signal?.reason
  const message = reason instanceof Error
    ? reason.message
    : typeof reason === 'string' && reason.trim()
      ? reason
      : fallbackMessage
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export function throwIfAborted(signal?: AbortSignal, fallbackMessage?: string): void {
  if (signal?.aborted) throw createAbortError(signal, fallbackMessage)
}