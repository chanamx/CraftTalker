import type { ApiError, StreamCallbacks } from '@/lib/api-types'

export const API_BASE = '/api'

export class ApiRequestError extends Error {
  apiError: ApiError
  statusCode: number

  constructor(apiError: ApiError, statusCode: number) {
    super(apiError.error)
    this.name = 'ApiRequestError'
    this.apiError = apiError
    this.statusCode = statusCode
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined

  const text = await response.text()
  if (!text.trim()) return undefined

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export function toApiError(value: unknown, fallback: ApiError): ApiError {
  if (typeof value === 'string' && value.trim()) {
    return { ...fallback, error: value.trim().slice(0, 500) }
  }
  if (!isRecord(value) || typeof value.error !== 'string') return fallback
  return {
    error: value.error,
    code: typeof value.code === 'number' ? value.code : fallback.code,
    details: isRecord(value.details) ? value.details : undefined,
  }
}

function parseStreamPayload(value: unknown): { content?: string; error?: ApiError } {
  if (!isRecord(value)) return {}
  if (isRecord(value.error) || typeof value.error === 'string') {
    return {
      error: toApiError(value.error, {
        error: typeof value.error === 'string' ? value.error : 'Stream error',
        code: -1,
      }),
    }
  }
  return typeof value.content === 'string' ? { content: value.content } : {}
}

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    const err = toApiError(await readResponseBody(res).catch(() => null), {
      error: res.statusText,
      code: -1,
    })
    throw new ApiRequestError(err, res.status)
  }

  return await readResponseBody(res) as T
}

export async function consumeSSEStream(
  response: Response,
  callbacks: StreamCallbacks
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError?.({ error: '无法读取响应流', code: -1 })
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
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
        if (data === '[DONE]') {
          callbacks.onComplete?.()
          return
        }

        try {
          const parsed = parseStreamPayload(JSON.parse(data) as unknown)
          if (parsed.error) {
            callbacks.onError?.(parsed.error)
            return
          }
          if (parsed.content) {
            callbacks.onChunk?.(parsed.content)
          }
        } catch {
          console.error('Failed to parse SSE data:', data)
        }
      }
    }
    callbacks.onComplete?.()
  } catch (error) {
    callbacks.onError?.({ error: String(error), code: -1 })
  }
}
