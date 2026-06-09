import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { llmConfigSchema, resolveLlmConfigApiKey } from '../lib/llm-config.js'
import {
  apiFormatFromConfig,
  headersFromConfig,
  modelListUrlFromConfig,
  providerFromConfig,
} from '../lib/llm-provider.js'
import type { LLMConfig } from '../lib/llm-config.js'

interface ModelListResponse {
  data?: Array<{ id?: string; object?: string; created?: number; owned_by?: string }>
  models?: Array<{ id?: string; name?: string }>
  value?: Array<{ id?: string; model?: string }>
  [key: string]: unknown
}

export const llmRoutes = new Hono()

llmRoutes.post(
  '/models',
  zValidator('json', llmConfigSchema),
  async (c) => {
    const config = resolveLlmConfigApiKey(c.req.valid('json'))

    try {
      const models = await fetchModelsFromAPI(config)
      return c.json(models)
    } catch (error) {
      console.error('[LLM] Failed to fetch models:', error)
      return c.json({ error: 'Failed to fetch models', details: String(error) }, 500)
    }
  },
)

async function fetchModelsFromAPI(config: LLMConfig): Promise<string[]> {
  const provider = providerFromConfig(config)
  const apiFormat = apiFormatFromConfig(config)
  const url = modelListUrlFromConfig(config)
  const headers = headersFromConfig(config, provider)

  if (process.env.DEBUG_LLM === 'true') {
    console.info('[LLM] Fetching models from:', url)
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  const data = await response.json() as ModelListResponse
  return parseModelList(data, apiFormat)
}

function parseModelList(data: ModelListResponse | unknown[], apiFormat?: string): string[] {
  if (!Array.isArray(data) && apiFormat === 'azure_openai_chat' && data.value && Array.isArray(data.value)) {
    return data.value.map(m => m.id || m.model || '').filter(Boolean)
  }

  if (!Array.isArray(data) && data.data && Array.isArray(data.data)) {
    return data.data.map(m => m.id ?? '').filter(Boolean)
  }

  if (!Array.isArray(data) && data.models && Array.isArray(data.models)) {
    return data.models.map(m => m.name || m.id || '').filter(Boolean)
  }

  if (Array.isArray(data)) {
    return data.map(m => {
      if (typeof m === 'string') return m
      if (m && typeof m === 'object' && 'id' in m) return String((m as { id: string }).id)
      if (m && typeof m === 'object' && 'name' in m) return String((m as { name: string }).name)
      return ''
    }).filter(Boolean)
  }

  console.warn('[LLM] Unknown model list format:', data)
  return []
}
