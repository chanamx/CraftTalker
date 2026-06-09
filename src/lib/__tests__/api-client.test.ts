import { describe, expect, it, vi } from 'vitest'
import { consumeSSEStream, request } from '@/lib/api-client'

function streamFromText(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

describe('api-client', () => {
  it('reads JSON responses through the API base path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(request<{ success: boolean }>('/health')).resolves.toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/health', {
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('throws structured API errors for failed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Bad config', code: 4001 }), {
          status: 400,
          statusText: 'Bad Request',
        })
      )
    )

    await expect(request('/engine/test')).rejects.toMatchObject({
      apiError: { error: 'Bad config', code: 4001 },
      statusCode: 400,
    })
  })

  it('handles empty successful responses without forcing JSON parsing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    await expect(request('/empty')).resolves.toBeUndefined()
  })

  it('uses plain text failed responses as readable API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Proxy unavailable', {
          status: 502,
          statusText: 'Bad Gateway',
        })
      )
    )

    await expect(request('/engine/test')).rejects.toMatchObject({
      apiError: { error: 'Proxy unavailable', code: -1 },
      statusCode: 502,
    })
  })

  it('consumes SSE chunks until completion', async () => {
    const onChunk = vi.fn()
    const onComplete = vi.fn()
    const response = new Response(streamFromText(
      'data: {"content":"Hel"}\n\ndata: {"content":"lo"}\n\ndata: [DONE]\n\n'
    ))

    await consumeSSEStream(response, { onChunk, onComplete })

    expect(onChunk).toHaveBeenNthCalledWith(1, 'Hel')
    expect(onChunk).toHaveBeenNthCalledWith(2, 'lo')
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('reports structured SSE errors', async () => {
    const onError = vi.fn()
    const onComplete = vi.fn()
    const response = new Response(streamFromText(
      'data: {"error":{"error":"Provider failed","code":502}}\n\n'
    ))

    await consumeSSEStream(response, { onError, onComplete })

    expect(onError).toHaveBeenCalledWith({ error: 'Provider failed', code: 502 })
    expect(onComplete).not.toHaveBeenCalled()
  })
})
