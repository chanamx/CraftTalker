import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import * as llmSessionService from '../services/llm-session.service.js'

const llmSessionsRoute = new Hono()

const createSchema = z.object({
  apiKey: z.string(),
  label: z.string().trim().min(1).max(120).optional(),
})

llmSessionsRoute.post('/', zValidator('json', createSchema), async (c) => {
  const session = llmSessionService.createLlmKeySession(c.req.valid('json'))
  return c.json(session, 201)
})

llmSessionsRoute.get('/:sessionId', async (c) => {
  const session = llmSessionService.getLlmKeySession(c.req.param('sessionId'))
  if (!session) return c.json({ error: 'LLM key session not found' }, 404)
  return c.json(session)
})

llmSessionsRoute.delete('/:sessionId', async (c) => {
  const deleted = llmSessionService.deleteLlmKeySession(c.req.param('sessionId'))
  if (!deleted) return c.json({ error: 'LLM key session not found' }, 404)
  return c.json({ success: true })
})

export { llmSessionsRoute }
