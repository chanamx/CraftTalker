import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const LLMConfigSchema = z.object({
  source: z.string(),
  apiUrl: z.string(),
  apiKey: z.string(),
  customApiFormat: z.enum(['openai_chat', 'openai_responses', 'claude_messages', 'gemini_interactions']).optional(),
  useReverseProxy: z.boolean().optional(),
  reverseProxyUrl: z.string().optional(),
})

interface ModelListResponse {
  data?: Array<{ id: string; object?: string; created?: number; owned_by?: string }>
  models?: Array<{ id: string; name?: string }>
  [key: string]: unknown
}

/**
 * 获取模型列表路由
 */
export const llmRoutes = new Hono()

llmRoutes.post(
  '/models',
  zValidator('json', LLMConfigSchema),
  async (c) => {
    const config = c.req.valid('json')

    try {
      const models = await fetchModelsFromAPI(config)
      return c.json(models)
    } catch (error) {
      console.error('[LLM] Failed to fetch models:', error)
      return c.json({ error: 'Failed to fetch models', details: String(error) }, 500)
    }
  }
)

/**
 * 根据不同的 API 源获取模型列表
 */
async function fetchModelsFromAPI(config: z.infer<typeof LLMConfigSchema>): Promise<string[]> {
  const baseUrl = config.useReverseProxy && config.reverseProxyUrl
    ? config.reverseProxyUrl.replace(/\/+$/, '')
    : config.apiUrl.replace(/\/+$/, '')

  // 确定端点路径
  let endpoint = '/v1/models'

  // 自定义提供商处理
  if (config.source.startsWith('custom_')) {
    const format = config.customApiFormat || 'openai_chat'
    switch (format) {
      case 'openai_chat':
      case 'openai_responses':
        endpoint = '/v1/models'
        break
      case 'claude_messages':
        endpoint = '/v1/models'
        break
      case 'gemini_interactions':
        endpoint = '/v1/models'
        break
    }
  } else {
    // 根据不同提供商调整端点
    switch (config.source) {
      case 'anthropic':
        endpoint = '/v1/models'
        break
      case 'google':
      case 'vertexai':
        endpoint = '/v1/models'
        break
      case 'openai':
      case 'azure_openai':
      case 'openrouter':
      case 'groq':
      case 'fireworks':
      case 'togetherai':
      case 'perplexity':
      case 'deepseek':
      case 'moonshot':
      case 'siliconflow':
      case 'mistral':
      case 'cohere':
      case 'xai':
        endpoint = '/v1/models'
        break
      case 'ollama':
        endpoint = '/api/tags'
        break
      default:
        endpoint = '/v1/models'
    }
  }

  const url = `${baseUrl}${endpoint}`
  console.log('[LLM] Fetching models from:', url)

  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // 根据提供商添加认证头
  if (config.apiKey) {
    // 自定义提供商根据格式决定认证方式
    if (config.source.startsWith('custom_')) {
      const format = config.customApiFormat || 'openai_chat'
      switch (format) {
        case 'claude_messages':
          headers['x-api-key'] = config.apiKey
          headers['anthropic-version'] = '2023-06-01'
          break
        case 'gemini_interactions':
          headers['x-goog-api-key'] = config.apiKey
          break
        default:
          headers['Authorization'] = `Bearer ${config.apiKey}`
      }
    } else {
      // 官方提供商
      switch (config.source) {
        case 'anthropic':
          headers['x-api-key'] = config.apiKey
          headers['anthropic-version'] = '2023-06-01'
          break
        case 'google':
          headers['x-goog-api-key'] = config.apiKey
          break
        case 'openrouter':
          headers['Authorization'] = `Bearer ${config.apiKey}`
          headers['HTTP-Referer'] = 'https://crafttalker.app'
          headers['X-Title'] = 'CraftTalker'
          break
        default:
          headers['Authorization'] = `Bearer ${config.apiKey}`
      }
    }
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

  // 解析不同格式的响应
  return parseModelList(data)
}

/**
 * 解析不同提供商的模型列表响应
 */
function parseModelList(data: ModelListResponse): string[] {
  // OpenAI 格式: { data: [{ id: "gpt-4" }, ...] }
  if (data.data && Array.isArray(data.data)) {
    return data.data.map(m => m.id).filter(Boolean)
  }

  // Ollama 格式: { models: [{ name: "llama3.3" }, ...] }
  if (data.models && Array.isArray(data.models)) {
    return data.models.map(m => m.name || m.id).filter(Boolean)
  }

  // 其他格式尝试直接取数组
  if (Array.isArray(data)) {
    return data.map(m => {
      if (typeof m === 'string') return m
      if (m && typeof m === 'object' && 'id' in m) return (m as { id: string }).id
      if (m && typeof m === 'object' && 'name' in m) return (m as { name: string }).name
      return ''
    }).filter(Boolean)
  }

  console.warn('[LLM] Unknown model list format:', data)
  return []
}
