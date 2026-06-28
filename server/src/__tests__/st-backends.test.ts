import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { stBackendsRoute } from '../routes/st-backends.js'
import { appErrorHandler } from '../middleware/errorHandler.js'

function createTestApp() {
  const app = new Hono()
  app.route('/api/backends', stBackendsRoute)
  app.onError(appErrorHandler)
  return app
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sseResponse(chunks: string[]): Response {
  return new Response(chunks.join(''), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function sentJson(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body)) as Record<string, unknown>
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SillyTavern host chat-completions backend bridge', () => {
  it('serves a fallback model list for ST plugin configuration UIs', async () => {
    const res = await createTestApp().request('/api/backends/chat-completions/models')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'gpt-4o-mini' }),
      ]),
    })
  })

  it('lists models through the shared LLM provider model service', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'local-model' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openai',
        reverse_proxy: 'http://localhost:1234/v1',
        proxy_password: 'local-key',
        model: 'local-model',
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [{ id: 'local-model' }] })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:1234/v1/models', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer local-key',
      }),
    }))
  })

  it('serves fallback models for empty ST status probes without touching external providers', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'gpt-4o-mini' }),
      ]),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects empty ST generation probes before any provider request is made', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('requires a reverse_proxy'),
      code: 1001,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('generates an OpenAI-shaped non-streaming response without writing chats', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'Hello from host bridge' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openai',
        reverse_proxy: 'http://localhost:1234/v1',
        proxy_password: 'local-key',
        model: 'local-model',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 64,
        temperature: 0.2,
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      object: 'chat.completion',
      choices: [{
        message: { role: 'assistant', content: 'Hello from host bridge' },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 4,
        total_tokens: 7,
      },
    })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:1234/v1/chat/completions', expect.objectContaining({
      method: 'POST',
    }))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      model: 'local-model',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 64,
      temperature: 0.2,
      stream: false,
    })
  })

  it('streams OpenAI-shaped SSE chunks for LittleWhiteBox streaming callers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openai',
        reverse_proxy: 'http://localhost:1234/v1',
        model: 'local-model',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    const text = await res.text()
    expect(text).toContain('"content":"Hel"')
    expect(text).toContain('"content":"lo"')
    expect(text).toContain('data: [DONE]')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      stream: true,
    })
  })

  it('maps Claude source to Anthropic messages with ST proxy fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      content: [{ type: 'text', text: 'Claude bridge reply' }],
      stop_reason: 'end_turn',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'claude',
        reverse_proxy: 'https://api.anthropic.com/v1',
        proxy_password: 'claude-key',
        model: 'claude-3-5-sonnet-latest',
        messages: [
          { role: 'system', content: 'Follow the scene.' },
          { role: 'user', content: 'Hello' },
        ],
        max_tokens: 128,
        top_k: 40,
      }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      choices: [{ message: { content: 'Claude bridge reply' }, finish_reason: 'end_turn' }],
    })
    expect(fetchMock).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      headers: expect.objectContaining({
        'x-api-key': 'claude-key',
        'anthropic-version': '2023-06-01',
      }),
    }))
    expect(sentJson(fetchMock)).toMatchObject({
      model: 'claude-3-5-sonnet-latest',
      system: 'Follow the scene.',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 128,
      stream: false,
    })
  })

  it('maps Makersuite source to Gemini generateContent and normalizes ST base URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{
        content: { parts: [{ text: 'Gemini bridge reply' }] },
        finishReason: 'STOP',
      }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'makersuite',
        reverse_proxy: 'https://generativelanguage.googleapis.com',
        proxy_password: 'google-key',
        model: 'models/gemini-2.0-flash',
        messages: [
          { role: 'system', content: 'Use compact prose.' },
          { role: 'user', content: 'Hello' },
        ],
        max_output_tokens: 256,
      }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      choices: [{ message: { content: 'Gemini bridge reply' }, finish_reason: 'STOP' }],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-goog-api-key': 'google-key',
        }),
      }),
    )
    expect(sentJson(fetchMock)).toMatchObject({
      systemInstruction: { parts: [{ text: 'Use compact prose.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      generationConfig: { maxOutputTokens: 256 },
    })
  })

  it('accepts common ST OpenAI-compatible sources such as OpenRouter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'OpenRouter reply' }, finish_reason: 'stop' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openrouter',
        proxy_password: 'openrouter-key',
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer openrouter-key',
        'HTTP-Referer': 'https://crafttalker.app',
      }),
    }))
    expect(sentJson(fetchMock)).toMatchObject({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('translates ST custom source headers, body includes, and body excludes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'Custom reply' }, finish_reason: 'stop' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'custom',
        custom_url: 'https://custom.example/v1',
        proxy_password: 'fallback-key',
        model: 'custom-model',
        custom_include_headers: 'X-Proxy-App: CraftTalker\nAuthorization: "Bearer custom-key"',
        custom_include_body: '{"provider_option":true}',
        custom_exclude_body: 'frequency_penalty',
        messages: [{ role: 'user', content: 'Hello' }],
        frequency_penalty: 0.7,
      }),
    })

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith('https://custom.example/v1/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer custom-key',
        'X-Proxy-App': 'CraftTalker',
      }),
    }))
    expect(sentJson(fetchMock)).toMatchObject({
      model: 'custom-model',
      provider_option: true,
    })
    expect(sentJson(fetchMock)).not.toHaveProperty('frequency_penalty')
  })

  it('maps ST Azure OpenAI fields to the Azure deployment route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'Azure reply' }, finish_reason: 'stop' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'azure_openai',
        azure_base_url: 'https://crafttalker-test.openai.azure.com',
        azure_deployment_name: 'rp-deployment',
        azure_api_version: '2024-02-15-preview',
        proxy_password: 'azure-key',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://crafttalker-test.openai.azure.com/openai/deployments/rp-deployment/chat/completions?api-version=2024-02-15-preview',
      expect.objectContaining({
        headers: expect.objectContaining({
          'api-key': 'azure-key',
        }),
      }),
    )
    expect(sentJson(fetchMock)).toMatchObject({
      messages: [{ role: 'user', content: 'Hello' }],
      stream: false,
    })
    expect(sentJson(fetchMock)).not.toHaveProperty('model')
  })

  it('rejects recognized but unimplemented ST sources instead of silently rerouting them', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'vertexai',
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('Vertex AI compatibility is not implemented'),
      code: 1001,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
