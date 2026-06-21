import { describe, expect, it } from 'vitest'
import {
  anthropicBody,
  geminiBody,
  openAICompatibleBody,
  openAIResponsesBody,
} from '../native-bodies.js'
import type { LLMConfig } from '../../lib/llm-config.js'
import { getDefaultPreset } from '../../services/preset.service.js'

const baseConfig: LLMConfig = {
  source: 'openai',
  apiUrl: 'https://api.example.test/v1',
  apiKey: 'sk-test',
  model: 'model-a',
  type: 'openai',
  customApiFormat: 'openai_chat',
}

const preset = {
  ...getDefaultPreset(),
  temperature: 0.7,
  max_tokens: 128,
  top_p: 0.9,
  frequency_penalty: 0.1,
  presence_penalty: 0.2,
  repetition_penalty: 1.05,
}

describe('native request bodies', () => {
  it('applies custom body fields and exclusions after building OpenAI-compatible bodies', () => {
    const body = openAICompatibleBody({
      ...baseConfig,
      customBodyFields: {
        temperature: 0.2,
        extra_flag: true,
      },
      excludeBodyFields: ['presence_penalty', 'stream'],
    }, preset, [{ role: 'user', content: 'Hello' }], true)

    expect(body).toMatchObject({
      model: 'model-a',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.2,
      frequency_penalty: 0.1,
      extra_flag: true,
    })
    expect(body).not.toHaveProperty('presence_penalty')
    expect(body).not.toHaveProperty('stream')
  })

  it('maps system messages into Anthropic system text and normalizes non-assistant roles to user', () => {
    const body = anthropicBody(baseConfig, preset, [
      { role: 'system', content: 'First rule' },
      { role: 'system', content: 'Second rule' },
      { role: 'user', content: 'Hi' },
      { role: 'tool', content: 'Tool output' },
      { role: 'assistant', content: 'Hello' },
    ], false)

    expect(body).toMatchObject({
      system: 'First rule\n\nSecond rule',
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'user', content: 'Tool output' },
        { role: 'assistant', content: 'Hello' },
      ],
      stream: false,
    })
  })

  it('maps OpenAI Responses roles conservatively and disables storage', () => {
    const body = openAIResponsesBody(baseConfig, preset, [
      { role: 'system', content: 'System' },
      { role: 'developer', content: 'Developer' },
      { role: 'assistant', content: 'Assistant' },
      { role: 'tool', content: 'Unknown role' },
    ], true)

    expect(body).toMatchObject({
      input: [
        { role: 'system', content: 'System' },
        { role: 'developer', content: 'Developer' },
        { role: 'assistant', content: 'Assistant' },
        { role: 'user', content: 'Unknown role' },
      ],
      store: false,
      stream: true,
      max_output_tokens: 128,
    })
  })

  it('moves Gemini system messages into systemInstruction and maps assistant to model', () => {
    const body = geminiBody(baseConfig, preset, [
      { role: 'system', content: 'Speak softly' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ])

    expect(body).toMatchObject({
      systemInstruction: { parts: [{ text: 'Speak softly' }] },
      contents: [
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'Hello' }] },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 128,
      },
    })
  })
})
