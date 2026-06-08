import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { buildEndpointUrl, buildHeaders, getProviderConfig } from '../config/api-providers.js'
import { llmConfigSchema, resolveLlmConfigApiKey } from '../lib/llm-config.js'
import type { LLMConfig } from '../services/llm.service.js'

interface ModelListResponse {
  data?: Array<{ id?: string; object?: string; created?: number; owned_by?: string }>
  models?: Array<{ id?: string; name?: string }>
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

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function joinUrl(baseUrl: string, path: string): string {
  return `${trimTrailingSlashes(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`
}

function providerFromConfig(config: { source?: string; type: string }): string {
  if (config.source) {
    if (config.source === 'google') return 'gemini'
    if (config.source === 'custom_claude') return 'anthropic'
    if (config.source === 'custom_gemini') return 'gemini'
    if (config.source === 'custom_openai_responses') return 'openai'
    return config.source
  }
  if (config.type === 'kobold' || config.type === 'textgen' || config.type === 'novel') return config.type
  if (config.type === 'custom') return 'custom_openai_chat'
  return 'openai'
}

function baseUrlFromConfig(config: {
  source?: string
  apiUrl: string
  useReverseProxy?: boolean
  reverseProxyUrl?: string
  reverseProxyName?: string
}, provider: string): string {
  if (config.useReverseProxy && config.reverseProxyUrl) return trimTrailingSlashes(config.reverseProxyUrl)
  if (config.source?.startsWith('custom_')) return trimTrailingSlashes(config.apiUrl)

  const providerConfig = getProviderConfig(provider)
  if (!providerConfig) return trimTrailingSlashes(config.apiUrl)
  return trimTrailingSlashes(buildEndpointUrl(provider, config.apiUrl, config.reverseProxyName))
}

function headersFromConfig(config: {
  apiKey: string
  customHeaders?: Record<string, string>
  reverseProxyName?: string
}, provider: string): Record<string, string> {
  if (!getProviderConfig(provider)) {
    return {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      ...(config.customHeaders ?? {}),
    }
  }

  return buildHeaders(provider, config.apiKey, config.customHeaders, config.reverseProxyName)
}

async function fetchModelsFromAPI(config: LLMConfig): Promise<string[]> {
  const provider = providerFromConfig(config)
  const baseUrl = baseUrlFromConfig(config, provider)
  const providerConfig = getProviderConfig(provider)
  const endpoint = provider === 'ollama' && !providerConfig ? '/api/tags' : '/models'
  const url = joinUrl(baseUrl, endpoint)
  const headers = headersFromConfig(config, provider)

  console.log('[LLM] Fetching models from:', url)

  const response = await fetch(url, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  const data = await response.json() as ModelListResponse
  return parseModelList(data)
}

function parseModelList(data: ModelListResponse | unknown[]): string[] {
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
