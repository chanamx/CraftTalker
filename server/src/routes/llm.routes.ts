import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { llmConfigSchema, resolveLlmConfigApiKey } from '../lib/llm-config.js'
import { fetchModelsFromAPI } from '../services/llm-models.service.js'

export const llmRoutes = new Hono()

llmRoutes.post(
  '/models',
  zValidator('json', llmConfigSchema),
  async (c) => {
    const config = resolveLlmConfigApiKey(c.req.valid('json'))

    try {
      const models = await fetchModelsFromAPI(config, c.req.raw.signal)
      return c.json(models)
    } catch (error) {
      console.error('[LLM] Failed to fetch models:', error instanceof Error ? error.name : 'Unknown error')
      return c.json({ error: 'Failed to fetch models' }, 502)
    }
  },
)
