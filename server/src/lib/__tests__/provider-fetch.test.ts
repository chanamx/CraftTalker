import { afterEach, describe, expect, it, vi } from 'vitest'
import { providerFetch } from '../provider-fetch.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('providerFetch', () => {
  it('validates remote endpoints before invoking fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(providerFetch({
      url: 'http://127.0.0.1:8080/models',
      source: 'custom_openai_chat',
      mode: 'remote',
      timeoutMs: 100,
    })).rejects.toThrow(/private|loopback/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts provider requests after the configured timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })))

    await expect(providerFetch({
      url: 'https://provider.example.test/models',
      source: 'custom_openai_chat',
      mode: 'remote',
      timeoutMs: 10,
    })).rejects.toBeDefined()
  })

  it('rejects responses whose declared size exceeds the operation limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('small', {
      headers: { 'Content-Length': '2048' },
    })))

    await expect(providerFetch({
      url: 'https://provider.example.test/models',
      source: 'custom_openai_chat',
      mode: 'remote',
      timeoutMs: 100,
      maxResponseBytes: 1024,
    })).rejects.toThrow(/too large/i)
  })

  it('stops reading chunked responses after the operation limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(700))
        controller.enqueue(new Uint8Array(700))
        controller.close()
      },
    }))))

    const response = await providerFetch({
      url: 'https://provider.example.test/models',
      source: 'custom_openai_chat',
      mode: 'remote',
      timeoutMs: 100,
      maxResponseBytes: 1024,
    })

    await expect(response.arrayBuffer()).rejects.toThrow(/too large/i)
  })
})
