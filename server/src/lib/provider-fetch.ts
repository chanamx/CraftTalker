import type { RuntimeMode } from '../config/runtime.js'
import { validateProviderEndpoint } from './provider-endpoint-policy.js'

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

export interface ProviderFetchOptions {
  url: string
  source?: string
  mode: RuntimeMode
  init?: RequestInit
  timeoutMs?: number
  maxResponseBytes?: number
}

function requestSignal(input: AbortSignal | null | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return input ? AbortSignal.any([input, timeoutSignal]) : timeoutSignal
}

function assertDeclaredResponseSize(response: Response, maxBytes: number): void {
  const contentLength = response.headers.get('Content-Length')
  if (!contentLength) return
  const bytes = Number(contentLength)
  if (Number.isFinite(bytes) && bytes > maxBytes) {
    throw new Error(`Provider response is too large (maximum ${maxBytes} bytes).`)
  }
}

function limitResponseBody(response: Response, maxBytes: number): Response {
  if (!response.body) return response
  const reader = response.body.getReader()
  let bytesRead = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read()
        if (result.done) {
          controller.close()
          return
        }
        bytesRead += result.value.byteLength
        if (bytesRead > maxBytes) {
          await reader.cancel('Provider response exceeded the configured size limit.').catch(() => undefined)
          controller.error(new Error(`Provider response is too large (maximum ${maxBytes} bytes).`))
          return
        }
        controller.enqueue(result.value)
      } catch (error) {
        controller.error(error)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export async function providerFetch(options: ProviderFetchOptions): Promise<Response> {
  const timeoutMs = Math.max(10, Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 10 * 60_000))
  const maxResponseBytes = Math.max(1, options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES)
  await validateProviderEndpoint(options.url, {
    mode: options.mode,
    source: options.source,
  })

  const response = await fetch(options.url, {
    ...options.init,
    signal: requestSignal(options.init?.signal, timeoutMs),
  })
  assertDeclaredResponseSize(response, maxResponseBytes)
  return limitResponseBody(response, maxResponseBytes)
}
