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
})
