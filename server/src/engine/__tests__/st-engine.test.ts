import { afterEach, describe, expect, it, vi } from 'vitest'
import { STEngine } from '../st-engine.js'
import { getDefaultPreset } from '../../services/preset.service.js'
import type { EngineRequest } from '../types.js'
import type { CharacterCard } from '../../lib/png-parser.js'

const character: CharacterCard = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  name: 'STBot',
  description: 'A compatibility character',
  personality: 'careful',
  scenario: 'A test room',
  first_mes: '',
  mes_example: '{{user}}: Hello\n{{char}}: Hi',
  creator_notes: '',
  system_prompt: 'You are {{char}}.',
  post_history_instructions: 'Reply to {{user}} as {{char}}.',
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

function request(overrides: Partial<EngineRequest['config']> = {}): EngineRequest {
  return {
    config: {
      source: 'openrouter',
      apiUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'or-key',
      model: 'openai/gpt-4o-mini',
      type: 'openai',
      ...overrides,
    },
    preset,
    character,
    userName: 'Bob',
    messages: [{ role: 'user', content: 'Hello {{char}}' }],
    worldEntries: [{
      content: '{{char}} keeps the old lore.',
      position: 0,
      depth: 0,
      insertion_order: 0,
      role: 0,
    }],
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

describe('STEngine compatibility shell', () => {
  it('preserves typed extension prompts around the compat main prompt', async () => {
    const anchoredRequest = request()
    anchoredRequest.promptAnchors = {
      beforeMain: [{ role: 'user', content: 'Before {{char}}' }],
      afterMain: [{ role: 'assistant', content: 'After {{user}}' }],
    }

    const messages = await new STEngine().buildCompatPrompt(anchoredRequest)
    const beforeIndex = messages.findIndex(message => message.content === 'Before STBot')
    const mainIndex = messages.findIndex(message => message.content.includes('[Character: STBot]'))
    const afterIndex = messages.findIndex(message => message.content === 'After Bob')

    expect(beforeIndex).toBeGreaterThanOrEqual(0)
    expect(beforeIndex).toBeLessThan(mainIndex)
    expect(mainIndex).toBeLessThan(afterIndex)
  })

  it('keeps the sillytavern engine identity while using NativeEngine provider transport', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'st reply' }, finish_reason: 'stop' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new STEngine()
    const result = await engine.generate(request())

    expect(engine.name).toBe('sillytavern')
    expect(result.content).toBe('st reply')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer or-key',
      'HTTP-Referer': 'https://crafttalker.app',
      'X-OpenRouter-Title': 'CraftTalker',
    })

    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const system = body.messages[0]?.content ?? ''
    expect(system).toContain('[World Info]\nSTBot keeps the old lore.')
    expect(system).toContain('[Character: STBot]')
    expect(system).toContain('[Scenario]\nA test room')
    expect(system).not.toContain('你是STBot')
    expect(body.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'Hello STBot' }),
      expect.objectContaining({ role: 'system', content: 'Reply to Bob as STBot.' }),
    ]))
  })

  it('delegates streaming through shared SSE parsing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const chunks: string[] = []
    for await (const chunk of new STEngine().generateStream(request())) {
      chunks.push(chunk)
    }

    expect(chunks.join('')).toBe('Hello')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      stream: true,
    })
  })
})
