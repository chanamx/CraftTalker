import { describe, expect, it } from 'vitest'
import {
  PROVIDER_BY_SOURCE,
  apiFormatOptionsForProvider,
  canEditProviderEndpoint,
  formatForProvider,
  normalizedConfigForProvider,
} from '@/lib/llm-provider-options'
import type { LLMConfig } from '@/types'

const baseConfig: LLMConfig = {
  source: 'openai',
  apiUrl: 'https://proxy.example.test/v1',
  apiKey: '',
  model: 'test-model',
  type: 'openai',
  customApiFormat: 'openai_chat',
}

describe('LLM provider option rules', () => {
  it('hides vendor endpoints outside developer mode and keeps compatible endpoints editable', () => {
    const openai = PROVIDER_BY_SOURCE.get('openai')
    const customOpenAI = PROVIDER_BY_SOURCE.get('custom_openai_chat')

    expect(canEditProviderEndpoint(openai, false)).toBe(false)
    expect(canEditProviderEndpoint(openai, true)).toBe(true)
    expect(canEditProviderEndpoint(customOpenAI, false)).toBe(true)
  })

  it('normalizes vendor endpoints in normal mode but preserves them in developer mode', () => {
    const openai = PROVIDER_BY_SOURCE.get('openai')

    expect(normalizedConfigForProvider(baseConfig, openai, false)).toMatchObject({
      source: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      customApiFormat: 'openai_chat',
    })

    expect(normalizedConfigForProvider(baseConfig, openai, true)).toMatchObject({
      source: 'openai',
      apiUrl: 'https://proxy.example.test/v1',
      customApiFormat: 'openai_chat',
    })
  })

  it('clamps protocol-specific custom sources to their supported format', () => {
    const customClaude = PROVIDER_BY_SOURCE.get('custom_claude')
    const options = apiFormatOptionsForProvider(customClaude)

    expect(formatForProvider(customClaude, 'openai_chat')).toBe('anthropic_messages')
    expect(options).toEqual([{ value: 'anthropic_messages', label: 'Claude Messages' }])
  })
})
