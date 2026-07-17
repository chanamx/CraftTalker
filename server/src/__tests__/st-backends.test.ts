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

  it('maps ST json_schema to OpenAI-compatible structured output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: '{"answer":"ok"}' }, finish_reason: 'stop' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openrouter',
        proxy_password: 'openrouter-key',
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Return JSON' }],
        json_schema: {
          name: 'answer',
          description: 'One structured answer',
          value: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
            additionalProperties: false,
          },
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(sentJson(fetchMock)).toMatchObject({
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'answer',
          description: 'One structured answer',
          strict: true,
          schema: {
            type: 'object',
            required: ['answer'],
          },
        },
      },
    })
    expect(sentJson(fetchMock)).not.toHaveProperty('json_schema')
  })

  it('applies ST structured output to streaming provider requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openrouter',
        proxy_password: 'openrouter-key',
        model: 'openai/gpt-4o-mini',
        stream: true,
        messages: [{ role: 'user', content: 'Return JSON' }],
        json_schema: { name: 'answer', value: { type: 'object' } },
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('ok')
    expect(sentJson(fetchMock)).toMatchObject({
      stream: true,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'answer', strict: true, schema: { type: 'object' } },
      },
    })
  })

  it('maps ST json_schema to Gemini response schema without replacing generation settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '{"answer":"ok"}' }] }, finishReason: 'STOP' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'makersuite',
        reverse_proxy: 'https://generativelanguage.googleapis.com',
        proxy_password: 'google-key',
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'Return JSON' }],
        max_output_tokens: 321,
        temperature: 0.25,
        json_schema: {
          name: 'answer',
          schema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
          },
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(sentJson(fetchMock)).toMatchObject({
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 321,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          required: ['answer'],
        },
      },
    })
  })

  it('maps ST json_schema to the OpenAI Responses text format', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      output_text: '{"answer":"ok"}',
      status: 'completed',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'custom',
        customApiFormat: 'openai_responses',
        custom_url: 'https://responses.example/v1',
        proxy_password: 'responses-key',
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: 'Return JSON' }],
        json_schema: {
          name: 'answer',
          value: { type: 'object', properties: { answer: { type: 'string' } } },
          strict: false,
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(sentJson(fetchMock)).toMatchObject({
      text: {
        format: {
          type: 'json_schema',
          name: 'answer',
          strict: false,
          schema: { type: 'object' },
        },
      },
    })
  })

  it('rejects malformed or unsupported ST structured output before provider fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const app = createTestApp()

    const malformed = await app.request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openrouter',
        proxy_password: 'openrouter-key',
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Return JSON' }],
        json_schema: { name: 'answer', value: 'not-an-object' },
      }),
    })
    expect(malformed.status).toBe(400)
    await expect(malformed.json()).resolves.toMatchObject({
      error: expect.stringContaining('json_schema'),
      code: 1001,
    })

    const unsupported = await app.request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'claude',
        reverse_proxy: 'https://api.anthropic.com/v1',
        proxy_password: 'claude-key',
        model: 'claude-3-5-sonnet-latest',
        messages: [{ role: 'user', content: 'Return JSON' }],
        json_schema: { name: 'answer', value: { type: 'object' } },
      }),
    })
    expect(unsupported.status).toBe(400)
    await expect(unsupported.json()).resolves.toMatchObject({
      error: expect.stringContaining('Claude structured output'),
      code: 1001,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards OpenAI-compatible tools and preserves non-streaming tool calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{
        message: {
          content: '',
          tool_calls: [{
            id: 'call-weather',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Shanghai"}' },
          }],
          reasoning_details: [{ type: 'reasoning.encrypted', id: 'call-weather', data: 'tool-signature' }],
        },
        finish_reason: 'tool_calls',
      }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openrouter',
        proxy_password: 'openrouter-key',
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Read weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'get_weather' } },
      }),
    })

    expect(res.status).toBe(200)
    expect(sentJson(fetchMock)).toMatchObject({
      tools: [{ type: 'function', function: { name: 'get_weather' } }],
      tool_choice: { type: 'function', function: { name: 'get_weather' } },
    })
    await expect(res.json()).resolves.toMatchObject({
      choices: [{
        message: {
          tool_calls: [{ id: 'call-weather', function: { name: 'get_weather', arguments: '{"city":"Shanghai"}' } }],
          reasoning_details: [{ id: 'call-weather', data: 'tool-signature' }],
        },
        finish_reason: 'tool_calls',
      }],
    })
  })

  it('preserves OpenAI-compatible assistant tool calls and tool results on the follow-up turn', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'Shanghai is sunny.' }, finish_reason: 'stop' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openrouter',
        proxy_password: 'openrouter-key',
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'user', content: 'Weather?' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: 'call-weather',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"Shanghai"}' },
            }],
            reasoning_details: [{ type: 'reasoning.encrypted', id: 'call-weather', data: 'tool-signature' }],
            reasoning_content: 'provider reasoning state',
          },
          {
            role: 'tool',
            content: '{"condition":"sunny"}',
            tool_call_id: 'call-weather',
            name: 'get_weather',
          },
        ],
        tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object' } } }],
        tool_choice: 'auto',
      }),
    })

    expect(res.status).toBe(200)
    expect(sentJson(fetchMock)).toMatchObject({
      messages: [
        { role: 'user', content: 'Weather?' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call-weather',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Shanghai"}' },
          }],
          reasoning_details: [{ type: 'reasoning.encrypted', id: 'call-weather', data: 'tool-signature' }],
          reasoning_content: 'provider reasoning state',
        },
        {
          role: 'tool',
          content: '{"condition":"sunny"}',
          tool_call_id: 'call-weather',
          name: 'get_weather',
        },
      ],
    })
  })

  it('passes through OpenAI-compatible streaming tool-call deltas', async () => {
    const providerChunk = 'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-weather","type":"function","function":{"name":"get_weather","arguments":"{}"}}]}}]}\n\n'
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([providerChunk, 'data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openrouter',
        proxy_password: 'openrouter-key',
        model: 'openai/gpt-4o-mini',
        stream: true,
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object' } } }],
        tool_choice: 'auto',
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(providerChunk + 'data: [DONE]\n\n')
    expect(sentJson(fetchMock)).toMatchObject({
      stream: true,
      tools: [{ type: 'function', function: { name: 'get_weather' } }],
      tool_choice: 'auto',
    })
  })

  it('maps ST tools to Gemini declarations and preserves native non-streaming tool responses', async () => {
    const responseContent = {
      role: 'model',
      parts: [{
        functionCall: { name: 'get_weather', args: { city: 'Shanghai' } },
        thoughtSignature: 'gemini-tool-signature',
      }],
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{ content: responseContent, finishReason: 'STOP' }],
      modelVersion: 'gemini-2.5-flash',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'makersuite',
        reverse_proxy: 'https://generativelanguage.googleapis.com',
        proxy_password: 'google-key',
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Read weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
          },
        }],
        tool_choice: 'required',
      }),
    })

    expect(res.status).toBe(200)
    expect(sentJson(fetchMock)).toMatchObject({
      tools: [{
        functionDeclarations: [{
          name: 'get_weather',
          description: 'Read weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        }],
      }],
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    })
    await expect(res.json()).resolves.toMatchObject({
      choices: [{ message: { content: '' }, finish_reason: 'STOP' }],
      responseContent,
      model: 'gemini-2.5-flash',
    })
  })

  it('converts ST tool-call history to Gemini function calls and responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{ content: { role: 'model', parts: [{ text: 'Shanghai is sunny.' }] }, finishReason: 'STOP' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'makersuite',
        reverse_proxy: 'https://generativelanguage.googleapis.com',
        proxy_password: 'google-key',
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'user', content: 'Weather?' },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Checking weather.' }],
            signature: 'gemini-text-signature',
          },
          {
            role: 'assistant',
            content: [{
              type: 'tool_calls',
              tool_calls: [{
                id: 'call-weather',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"city":"Shanghai"}' },
                signature: 'gemini-tool-signature',
              }],
            }],
          },
          {
            role: 'tool',
            content: '{"condition":"sunny"}',
            tool_call_id: 'call-weather',
            name: 'get_weather',
          },
        ],
      }),
    })

    expect(res.status).toBe(200)
    expect(sentJson(fetchMock)).toMatchObject({
      contents: [
        { role: 'user', parts: [{ text: 'Weather?' }] },
        {
          role: 'model',
          parts: [
            { text: 'Checking weather.', thoughtSignature: 'gemini-text-signature' },
            {
              functionCall: { name: 'get_weather', args: { city: 'Shanghai' } },
              thoughtSignature: 'gemini-tool-signature',
            },
          ],
        },
        {
          role: 'user',
          parts: [{
            functionResponse: {
              name: 'get_weather',
              response: { name: 'get_weather', content: '{"condition":"sunny"}' },
            },
          }],
        },
      ],
    })
  })

  it('passes through native Gemini streaming events for ST consumers', async () => {
    const providerChunk = 'data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"get_weather","args":{"city":"Shanghai"}},"thoughtSignature":"gemini-tool-signature"}]},"finishReason":"STOP"}]}\n\n'
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([providerChunk]))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'makersuite',
        reverse_proxy: 'https://generativelanguage.googleapis.com',
        proxy_password: 'google-key',
        model: 'gemini-2.5-flash',
        stream: true,
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object' } } }],
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(providerChunk)
  })

  it('keeps native Gemini text streaming events for LittleWhiteBox without tools', async () => {
    const providerChunk = 'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Sunny."}]},"finishReason":"STOP"}]}\n\n'
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([providerChunk]))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'makersuite',
        reverse_proxy: 'https://generativelanguage.googleapis.com',
        proxy_password: 'google-key',
        model: 'gemini-2.5-flash',
        stream: true,
        messages: [{ role: 'user', content: 'Weather?' }],
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(providerChunk)
  })

  it('maps ST tools to Claude definitions and preserves native non-streaming content', async () => {
    const content = [{
      type: 'tool_use',
      id: 'toolu_weather',
      name: 'get_weather',
      input: { city: 'Shanghai' },
    }]
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: 'msg_claude_tool',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      content,
      stop_reason: 'tool_use',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'claude',
        reverse_proxy: 'https://api.anthropic.com/v1',
        proxy_password: 'claude-key',
        model: 'claude-sonnet-4-5',
        use_sysprompt: true,
        messages: [
          { role: 'system', content: 'Use tools carefully.' },
          { role: 'user', content: 'Weather?' },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Read weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
          },
        }],
        tool_choice: 'required',
      }),
    })

    expect(res.status).toBe(200)
    expect(sentJson(fetchMock)).toMatchObject({
      system: 'Use tools carefully.',
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [{
        name: 'get_weather',
        description: 'Read weather',
        input_schema: { type: 'object', properties: { city: { type: 'string' } } },
      }],
      tool_choice: { type: 'any' },
    })
    await expect(res.json()).resolves.toMatchObject({
      choices: [{ message: { content: '' }, finish_reason: 'tool_use' }],
      content,
      model: 'claude-sonnet-4-5',
    })
  })

  it('replays LittleWhiteBox Claude content blocks and tool results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      model: 'claude-sonnet-4-5',
      content: [{ type: 'text', text: 'Shanghai is sunny.' }],
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
        model: 'claude-sonnet-4-5',
        messages: [
          { role: 'user', content: 'Weather?' },
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'I should check.', signature: 'claude-thinking-signature' },
              { type: 'text', text: 'Checking weather.' },
              {
                type: 'tool_use',
                id: 'toolu_weather',
                name: 'get_weather',
                input: { city: 'Shanghai' },
              },
            ],
          },
          {
            role: 'tool',
            content: '{"condition":"sunny"}',
            tool_call_id: 'toolu_weather',
          },
        ],
      }),
    })

    expect(res.status).toBe(200)
    expect(sentJson(fetchMock)).toMatchObject({
      messages: [
        { role: 'user', content: 'Weather?' },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'I should check.', signature: 'claude-thinking-signature' },
            { type: 'text', text: 'Checking weather.' },
            { type: 'tool_use', id: 'toolu_weather', name: 'get_weather', input: { city: 'Shanghai' } },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_weather', content: '{"condition":"sunny"}' }],
        },
      ],
    })
  })

  it('passes through native Claude input_json_delta streaming events', async () => {
    const chunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-sonnet-4-5"}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_weather","name":"get_weather","input":{}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":\\"Shanghai\\"}"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(chunks))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'claude',
        reverse_proxy: 'https://api.anthropic.com/v1',
        proxy_password: 'claude-key',
        model: 'claude-sonnet-4-5',
        stream: true,
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object' } } }],
        tool_choice: 'auto',
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(chunks.join(''))
  })

  it('keeps native Claude text streaming events without tools', async () => {
    const chunks = [
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Sunny."}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(chunks))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'claude',
        reverse_proxy: 'https://api.anthropic.com/v1',
        proxy_password: 'claude-key',
        model: 'claude-sonnet-4-5',
        stream: true,
        messages: [{ role: 'user', content: 'Weather?' }],
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(chunks.join(''))
  })

  it('rejects malformed and unsupported ST tool calls before provider fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const app = createTestApp()

    const malformed = await app.request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openrouter',
        proxy_password: 'openrouter-key',
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [{ type: 'function', function: { name: '', parameters: [] } }],
      }),
    })
    expect(malformed.status).toBe(400)
    await expect(malformed.json()).resolves.toMatchObject({ error: expect.stringContaining('tools'), code: 1001 })

    const mismatchedChoice = await app.request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openrouter',
        proxy_password: 'openrouter-key',
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object' } } }],
        tool_choice: { type: 'function', function: { name: 'missing_tool' } },
      }),
    })
    expect(mismatchedChoice.status).toBe(400)
    await expect(mismatchedChoice.json()).resolves.toMatchObject({ error: expect.stringContaining('tool_choice'), code: 1001 })

    const malformedGeminiHistory = await app.request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'makersuite',
        reverse_proxy: 'https://generativelanguage.googleapis.com',
        proxy_password: 'google-key',
        model: 'gemini-2.5-flash',
        messages: [{
          role: 'assistant',
          content: [{
            type: 'tool_calls',
            tool_calls: [{
              id: 'call-weather',
              type: 'function',
              function: { name: 'get_weather', arguments: 'not-json' },
            }],
          }],
        }],
      }),
    })
    expect(malformedGeminiHistory.status).toBe(400)
    await expect(malformedGeminiHistory.json()).resolves.toMatchObject({ error: expect.stringContaining('JSON object'), code: 1001 })

    const malformedClaudeHistory = await app.request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'claude',
        reverse_proxy: 'https://api.anthropic.com/v1',
        proxy_password: 'claude-key',
        model: 'claude-sonnet-4-5',
        messages: [{
          role: 'assistant',
          content: [{ type: 'tool_use', name: 'get_weather', input: { city: 'Shanghai' } }],
        }],
      }),
    })
    expect(malformedClaudeHistory.status).toBe(400)
    await expect(malformedClaudeHistory.json()).resolves.toMatchObject({ error: expect.stringContaining('tool_use'), code: 1001 })

    const unsupportedNativeHistory = await app.request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'custom',
        custom_url: 'https://api.openai.com/v1',
        proxy_password: 'openai-key',
        customApiFormat: 'openai_responses',
        model: 'gpt-5',
        messages: [{
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_weather', name: 'get_weather', input: { city: 'Shanghai' } }],
        }],
      }),
    })
    expect(unsupportedNativeHistory.status).toBe(400)
    await expect(unsupportedNativeHistory.json()).resolves.toMatchObject({ error: expect.stringContaining('tool calling'), code: 1001 })

    const unsupported = await app.request('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'custom',
        custom_url: 'https://api.openai.com/v1',
        proxy_password: 'openai-key',
        customApiFormat: 'openai_responses',
        model: 'gpt-5',
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object' } } }],
      }),
    })
    expect(unsupported.status).toBe(400)
    await expect(unsupported.json()).resolves.toMatchObject({ error: expect.stringContaining('tool calling'), code: 1001 })
    expect(fetchMock).not.toHaveBeenCalled()
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
