import { describe, expect, it } from 'vitest'
import { migrateSettingsState } from '@/stores/settings-store'

describe('settings-store migrations', () => {
  it('migrates legacy maxTokens to maxReplyLength', () => {
    const migrated = migrateSettingsState({
      llmConfig: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'secret',
        model: 'example-model',
        type: 'openai',
      },
      genConfig: {
        temperature: 0.8,
        topP: 0.95,
        contextLength: 8192,
        maxTokens: 1024,
      },
    })

    expect(migrated.genConfig?.maxReplyLength).toBe(1024)
    expect('maxTokens' in (migrated.genConfig as object)).toBe(false)
    expect(migrated.llmConfig?.apiKey).toBe('secret')
  })

  it('fills missing settings with defaults', () => {
    const migrated = migrateSettingsState({})

    expect(migrated.llmConfig?.apiUrl).toBe('http://localhost:1234/v1')
    expect(migrated.genConfig?.contextLength).toBe(4096)
    expect(migrated.genConfig?.maxReplyLength).toBe(512)
    expect(migrated.developerMode).toBe(false)
  })

  it('preserves server-side API key session references', () => {
    const migrated = migrateSettingsState({
      llmConfig: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: '',
        apiKeySessionId: 'session-123',
        model: 'example-model',
        type: 'openai',
      },
    })

    expect(migrated.llmConfig?.apiKey).toBe('')
    expect(migrated.llmConfig?.apiKeySessionId).toBe('session-123')
  })
})
