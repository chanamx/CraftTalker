import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'

describe('request resource limits', () => {
  it('rejects oversized ordinary JSON requests before route processing', async () => {
    const response = await createApp().request('/api/chats/LimitBot/missing/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'x'.repeat(5 * 1024 * 1024) }),
    })

    expect(response.status).toBe(413)
  })

  it('allows the existing bounded chat import size class', async () => {
    const boundary = `----crafttalker-${Date.now()}`
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="character_name"',
      '',
      'LimitBot',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="small.jsonl"',
      'Content-Type: application/jsonl',
      '',
      JSON.stringify({ chat_metadata: {}, user_name: 'User', character_name: 'LimitBot' }),
      `--${boundary}--`,
      '',
    ].join('\r\n')

    const response = await createApp().request('/api/chats/import', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    })

    expect(response.status).toBe(201)
  })

  it('rejects oversized LLM configuration fields', async () => {
    const response = await createApp().request('/api/llm/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'custom_openai_chat',
        apiUrl: `https://example.test/${'x'.repeat(10_000)}`,
        apiKey: '',
        model: 'model',
        type: 'custom',
      }),
    })

    expect(response.status).toBe(400)
  })

  it('rejects oversized chat message fields even within the request envelope', async () => {
    const response = await createApp().request('/api/chats/LimitBot/missing/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'x'.repeat(300_000) }),
    })

    expect(response.status).toBe(400)
  })
})


it('rejects deeply nested unknown JSON fields', async () => {
  let nested: Record<string, unknown> = { value: true }
  for (let index = 0; index < 20; index += 1) nested = { child: nested }
  const response = await createApp().request('/api/chats/LimitBot/missing/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'hello', extra: nested }),
  })
  expect(response.status).toBe(400)
})
