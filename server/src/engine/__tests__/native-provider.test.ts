import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeEngine } from '../native.js'
import type { EngineRequest } from '../types.js'
import { getDefaultPreset } from '../../services/preset.service.js'
import type { CharacterCard } from '../../lib/png-parser.js'

const character: CharacterCard = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  name: 'TestBot',
  description: 'A test character',
  personality: '',
  scenario: '',
  first_mes: '',
  mes_example: '',
  creator_notes: '',
  system_prompt: 'Stay concise.',
  post_history_instructions: '',
  alternate_greetings: [],
  tags: [],
  creator: '',
  character_version: '',
  extensions: {},
}

const preset = {
  ...getDefaultPreset(),
  temperature: 0.7,
  top_p: 0.9,
  max_tokens: 128,
  frequency_penalty: 0,
  presence_penalty: 0,
  repetition_penalty: 1,
}

function request(config: EngineRequest['config']): EngineRequest {
  return {
    config,
    preset,
    character,
    messages: [{ role: 'user', content: 'Hello' }],
  }
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function streamResponse(text: string): Response {
  return new Response(text, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NativeEngine provider routing', () => {
  it('sends OpenAI-compatible providers to chat completions with bearer auth and provider headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new NativeEngine()
    const result = await engine.generate(request({
      source: 'openrouter',
      apiUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'or-key',
      model: 'openai/gpt-4o-mini',
      type: 'openai',
    }))

    expect(result.content).toBe('hi')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer or-key',
      'HTTP-Referer': 'https://crafttalker.app',
      'X-OpenRouter-Title': 'CraftTalker',
    })
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'openai/gpt-4o-mini',
      stream: false,
    })
  })

  it('routes AIMLAPI through OpenAI-compatible chat completions with attribution headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'aiml reply' }, finish_reason: 'stop' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new NativeEngine()
    const result = await engine.generate(request({
      source: 'aimlapi',
      apiUrl: 'https://api.aimlapi.com/v1',
      apiKey: 'aiml-key',
      model: 'chatgpt-4o-latest',
      type: 'openai',
    }))

    expect(result.content).toBe('aiml reply')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.aimlapi.com/v1/chat/completions')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer aiml-key',
      'HTTP-Referer': 'https://crafttalker.app',
      'X-Title': 'CraftTalker',
    })
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'chatgpt-4o-latest',
      stream: false,
    })
  })

  it('sends Anthropic sources to messages with x-api-key and anthropic-version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      content: [{ type: 'text', text: 'claude reply' }],
      stop_reason: 'end_turn',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new NativeEngine()
    const result = await engine.generate(request({
      source: 'anthropic',
      apiUrl: 'https://api.anthropic.com/v1',
      apiKey: 'claude-key',
      model: 'claude-3-5-haiku-latest',
      type: 'openai',
      customHeaders: { 'anthropic-beta': 'test-beta' },
    }))

    expect(result.content).toBe('claude reply')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers).toMatchObject({
      'x-api-key': 'claude-key',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'test-beta',
    })
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'claude-3-5-haiku-latest',
      stream: false,
    })
    expect(body).toHaveProperty('system')
  })

  it('sends Gemini sources to generateContent with x-goog-api-key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{
        content: { parts: [{ text: 'gemini reply' }] },
        finishReason: 'STOP',
      }],
      usageMetadata: {
        promptTokenCount: 5,
        candidatesTokenCount: 2,
        totalTokenCount: 7,
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new NativeEngine()
    const result = await engine.generate(request({
      source: 'google',
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gemini-key',
      model: 'gemini-2.0-flash',
      type: 'openai',
    }))

    expect(result.content).toBe('gemini reply')
    expect(result.usage?.totalTokens).toBe(7)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent')
    expect(init.headers).toMatchObject({
      'x-goog-api-key': 'gemini-key',
    })
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toHaveProperty('contents')
    expect(body).toHaveProperty('systemInstruction')
  })

  it('allows custom OpenAI-compatible headers and body customizations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'custom reply' }, finish_reason: 'stop' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new NativeEngine()
    await engine.generate(request({
      source: 'custom_openai_chat',
      apiUrl: 'https://proxy.example.test/v1',
      apiKey: 'proxy-key',
      model: 'custom-model',
      type: 'custom',
      customHeaders: { 'X-Proxy-App': 'CraftTalker' },
      customBodyFields: { provider_option: true },
      excludeBodyFields: ['frequency_penalty'],
    }))

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer proxy-key',
      'X-Proxy-App': 'CraftTalker',
    })
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.provider_option).toBe(true)
    expect(body.frequency_penalty).toBeUndefined()
  })

  it('sends custom OpenAI Responses providers to /responses with Responses body shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      output_text: 'responses reply',
      status: 'completed',
      usage: {
        input_tokens: 11,
        output_tokens: 5,
        total_tokens: 16,
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new NativeEngine()
    const result = await engine.generate(request({
      source: 'custom_openai_responses',
      apiUrl: 'https://responses.example.test/v1',
      apiKey: 'responses-key',
      model: 'gpt-4.1-mini',
      type: 'custom',
      customApiFormat: 'openai_responses',
    }))

    expect(result.content).toBe('responses reply')
    expect(result.finishReason).toBe('completed')
    expect(result.usage).toEqual({
      promptTokens: 11,
      completionTokens: 5,
      totalTokens: 16,
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://responses.example.test/v1/responses')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer responses-key',
    })

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'gpt-4.1-mini',
      max_output_tokens: 128,
      store: false,
      stream: false,
    })
    expect(body).not.toHaveProperty('messages')
    expect(body).not.toHaveProperty('max_tokens')
    expect(body.input).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'system' }),
      expect.objectContaining({ role: 'user', content: 'Hello' }),
    ]))
  })

  it('parses OpenAI Responses SSE output text deltas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([
      `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'hel' })}`,
      `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'lo' })}`,
      `data: ${JSON.stringify({ type: 'response.completed' })}`,
      'data: [DONE]',
    ].join('\n\n')))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new NativeEngine()
    const chunks: string[] = []
    for await (const chunk of engine.generateStream(request({
      source: 'custom_openai_responses',
      apiUrl: 'https://responses.example.test/v1',
      apiKey: 'responses-key',
      model: 'gpt-4.1-mini',
      type: 'custom',
      customApiFormat: 'openai_responses',
    }))) {
      chunks.push(chunk)
    }

    expect(chunks.join('')).toBe('hello')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://responses.example.test/v1/responses')
    expect(JSON.parse(init.body as string)).toMatchObject({ stream: true })
  })

  it('sends Azure OpenAI requests to deployment chat completions with api-key auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'azure reply' }, finish_reason: 'stop' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new NativeEngine()
    const result = await engine.generate(request({
      source: 'azure_openai',
      apiUrl: 'https://{resource}.openai.azure.com',
      apiKey: 'azure-key',
      model: 'gpt-4o-mini-deploy',
      type: 'openai',
      azureConfig: {
        resourceName: 'craft-resource',
        deploymentName: 'gpt-4o-mini-deploy',
        apiVersion: '2024-10-21',
      },
    }))

    expect(result.content).toBe('azure reply')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://craft-resource.openai.azure.com/openai/deployments/gpt-4o-mini-deploy/chat/completions?api-version=2024-10-21')
    expect(init.headers).toMatchObject({
      'api-key': 'azure-key',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toMatchObject({
      stream: false,
      max_tokens: 128,
    })
    expect(body.model).toBeUndefined()
    expect(body.messages).toEqual(expect.any(Array))
  })

  it('uses Ollama native chat without auth for local /api endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      message: { role: 'assistant', content: 'ollama reply' },
      done_reason: 'stop',
      prompt_eval_count: 4,
      eval_count: 3,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new NativeEngine()
    const result = await engine.generate(request({
      source: 'ollama_native',
      apiUrl: 'http://localhost:11434',
      apiKey: '',
      model: 'llama3.1',
      type: 'openai',
    }))

    expect(result.content).toBe('ollama reply')
    expect(result.usage?.totalTokens).toBe(7)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:11434/api/chat')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'llama3.1',
      stream: false,
    })
    expect(body.messages).toEqual(expect.any(Array))
    expect(body.options).toMatchObject({
      temperature: 0.7,
      top_p: 0.9,
      num_predict: 128,
    })
  })

  it('parses Ollama native NDJSON streaming chunks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([
      JSON.stringify({ message: { content: 'hel' }, done: false }),
      JSON.stringify({ message: { content: 'lo' }, done: false }),
      JSON.stringify({ done: true }),
    ].join('\n')))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new NativeEngine()
    const chunks: string[] = []
    for await (const chunk of engine.generateStream(request({
      source: 'ollama_native',
      apiUrl: 'http://localhost:11434/api',
      apiKey: '',
      model: 'llama3.1',
      type: 'openai',
    }))) {
      chunks.push(chunk)
    }

    expect(chunks.join('')).toBe('hello')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:11434/api/chat')
    expect(JSON.parse(init.body as string)).toMatchObject({ stream: true })
  })
})
