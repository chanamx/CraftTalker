import { createError, ErrorCode } from '../lib/errors.js'

export type StreamExtractor = (data: unknown) => string | undefined

export async function* consumeSSE(
  response: Response,
  extract: StreamExtractor,
): AsyncGenerator<string, void, unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw createError(ErrorCode.LLM_CONNECTION_ERROR, 'LLM response body is empty', {})

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') return

      try {
        const parsed: unknown = JSON.parse(data)
        const content = extract(parsed)
        if (content) yield content
      } catch {
        continue
      }
    }
  }
}

export async function* consumeNDJSON(
  response: Response,
  extract: StreamExtractor,
): AsyncGenerator<string, void, unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw createError(ErrorCode.LLM_CONNECTION_ERROR, 'LLM response body is empty', {})

  const decoder = new TextDecoder()
  let buffer = ''

  const flushLine = function* (line: string): Generator<string> {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      const parsed: unknown = JSON.parse(trimmed)
      const content = extract(parsed)
      if (content) yield content
    } catch {
      return
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      yield* flushLine(line)
    }
  }

  if (buffer.trim()) {
    yield* flushLine(buffer)
  }
}
