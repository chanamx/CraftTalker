import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { clearLlmKeySessionsForTest } from '../services/llm-session.service.js'

const previousNodeEnv = process.env.NODE_ENV
const previousAllowedOrigins = process.env.ALLOWED_ORIGINS

afterEach(() => {
  process.env.NODE_ENV = 'test'
  clearLlmKeySessionsForTest()

  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = previousNodeEnv
  }

  if (previousAllowedOrigins === undefined) {
    delete process.env.ALLOWED_ORIGINS
  } else {
    process.env.ALLOWED_ORIGINS = previousAllowedOrigins
  }
})

describe('production origin protections', () => {
  it('rejects JSON API key session creation from an untrusted browser origin', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOWED_ORIGINS = 'https://crafttalker.example'

    const res = await createApp().request('/api/llm-sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ apiKey: 'sk-cross-site', label: 'OpenAI' }),
    })

    expect(res.status).toBe(403)
  })

  it('rejects unsafe API key session writes marked as cross-site by Fetch Metadata', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOWED_ORIGINS = 'https://crafttalker.example'

    const res = await createApp().request('/api/llm-sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'cross-site',
      },
      body: JSON.stringify({ apiKey: 'sk-cross-site', label: 'OpenAI' }),
    })

    expect(res.status).toBe(403)
  })

  it('allows JSON API key session creation from an explicitly trusted production origin', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOWED_ORIGINS = 'https://crafttalker.example'

    const res = await createApp().request('/api/llm-sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://crafttalker.example',
      },
      body: JSON.stringify({ apiKey: 'sk-same-site', label: 'OpenAI' }),
    })

    expect(res.status).toBe(201)
    expect(JSON.stringify(await res.json())).not.toContain('sk-same-site')
  })

  it('allows trusted production origins even when the frontend is deployed cross-site from the API', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOWED_ORIGINS = 'https://crafttalker.example'

    const res = await createApp().request('/api/llm-sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://crafttalker.example',
        'Sec-Fetch-Site': 'cross-site',
      },
      body: JSON.stringify({ apiKey: 'sk-cross-site-trusted', label: 'OpenAI' }),
    })

    expect(res.status).toBe(201)
    expect(JSON.stringify(await res.json())).not.toContain('sk-cross-site-trusted')
  })
})
