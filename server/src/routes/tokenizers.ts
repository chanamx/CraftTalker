import { Hono } from 'hono'
import { createTokenCounter } from '../lib/tokenizer.js'

const tokenizersRoute = new Hono()

tokenizersRoute.post('/claude/encode', async (c) => {
  const payload = await c.req.json().catch(() => ({})) as unknown
  const count = await countTokens(textFromPayload(payload), 'claude-3-5-sonnet-latest')
  return c.json({ count })
})

tokenizersRoute.post('/openai/count', async (c) => {
  const payload = await c.req.json().catch(() => []) as unknown
  const model = c.req.query('model') || 'gpt-4o'
  const tokenCount = await countTokens(textFromPayload(payload), model)
  return c.json({ token_count: tokenCount, count: tokenCount })
})

async function countTokens(text: string, model: string): Promise<number> {
  return await createTokenCounter(model)(text)
}

function textFromPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (Array.isArray(payload)) return payload.map(textFromPayload).filter(Boolean).join('\n')
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.text === 'string') return record.text
    if (typeof record.content === 'string') return record.content
    if (Array.isArray(record.content)) return textFromPayload(record.content)
    return JSON.stringify(record)
  }
  return ''
}

export { tokenizersRoute }
