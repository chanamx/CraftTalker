/**
 * API Provider 配置
 * 整合 SillyTavern 和 TauriTavern 的 API 设置
 * 支持官方端点和反向代理
 */

export interface APIProviderConfig {
  id: string
  name: string
  defaultEndpoint: string
  supportsStreaming: boolean
  authType: 'bearer' | 'api-key' | 'custom'
  authHeader?: string
  requiredHeaders?: Record<string, string>
  reverseProxies?: ReverseProxyConfig[]
  rateLimit?: {
    requestsPerMinute: number
    tokensPerMinute?: number
  }
  modelDefaults?: {
    temperature?: number
    maxTokens?: number
    topP?: number
    frequencyPenalty?: number
    presencePenalty?: number
  }
}

export interface ReverseProxyConfig {
  name: string
  endpoint: string
  description?: string
  requiresAuth: boolean
  customHeaders?: Record<string, string>
}

/**
 * OpenAI 及兼容 API 配置
 */
export const OPENAI_CONFIG: APIProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  defaultEndpoint: 'https://api.openai.com/v1',
  supportsStreaming: true,
  authType: 'bearer',
  authHeader: 'Authorization',
  requiredHeaders: {
    'Content-Type': 'application/json',
  },
  reverseProxies: [
    {
      name: 'OpenRouter',
      endpoint: 'https://openrouter.ai/api/v1',
      description: '支持多模型路由',
      requiresAuth: true,
      customHeaders: {
        'HTTP-Referer': 'https://crafttalker.app',
      },
    },
    {
      name: 'Together AI',
      endpoint: 'https://api.together.xyz/v1',
      description: '开源模型托管',
      requiresAuth: true,
    },
    {
      name: 'Azure OpenAI',
      endpoint: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}',
      description: '需替换 resource 和 deployment',
      requiresAuth: true,
    },
  ],
  rateLimit: {
    requestsPerMinute: 60,
    tokensPerMinute: 90000,
  },
  modelDefaults: {
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  },
}

/**
 * Anthropic Claude 配置
 */
export const ANTHROPIC_CONFIG: APIProviderConfig = {
  id: 'anthropic',
  name: 'Anthropic',
  defaultEndpoint: 'https://api.anthropic.com/v1',
  supportsStreaming: true,
  authType: 'api-key',
  authHeader: 'x-api-key',
  requiredHeaders: {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  },
  reverseProxies: [
    {
      name: 'AWS Bedrock',
      endpoint: 'https://bedrock-runtime.{region}.amazonaws.com',
      description: '需替换 region',
      requiresAuth: true,
    },
  ],
  rateLimit: {
    requestsPerMinute: 50,
    tokensPerMinute: 100000,
  },
  modelDefaults: {
    temperature: 1.0,
    maxTokens: 4096,
    topP: 1,
  },
}

/**
 * Google Gemini 配置
 */
export const GOOGLE_CONFIG: APIProviderConfig = {
  id: 'google',
  name: 'Google Gemini',
  defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
  supportsStreaming: true,
  authType: 'api-key',
  authHeader: 'x-goog-api-key',
  requiredHeaders: {
    'Content-Type': 'application/json',
  },
  reverseProxies: [],
  rateLimit: {
    requestsPerMinute: 60,
  },
  modelDefaults: {
    temperature: 0.9,
    maxTokens: 8192,
    topP: 1,
  },
}

/**
 * Cohere 配置
 */
export const COHERE_CONFIG: APIProviderConfig = {
  id: 'cohere',
  name: 'Cohere',
  defaultEndpoint: 'https://api.cohere.ai/v1',
  supportsStreaming: true,
  authType: 'bearer',
  authHeader: 'Authorization',
  requiredHeaders: {
    'Content-Type': 'application/json',
  },
  reverseProxies: [],
  rateLimit: {
    requestsPerMinute: 100,
  },
  modelDefaults: {
    temperature: 0.75,
    maxTokens: 4096,
  },
}

/**
 * Mistral AI 配置
 */
export const MISTRAL_CONFIG: APIProviderConfig = {
  id: 'mistral',
  name: 'Mistral AI',
  defaultEndpoint: 'https://api.mistral.ai/v1',
  supportsStreaming: true,
  authType: 'bearer',
  authHeader: 'Authorization',
  requiredHeaders: {
    'Content-Type': 'application/json',
  },
  reverseProxies: [],
  rateLimit: {
    requestsPerMinute: 60,
  },
  modelDefaults: {
    temperature: 0.7,
    maxTokens: 8192,
  },
}

/**
 * 所有 API 提供商配置
 */
export const API_PROVIDERS: Record<string, APIProviderConfig> = {
  openai: OPENAI_CONFIG,
  anthropic: ANTHROPIC_CONFIG,
  google: GOOGLE_CONFIG,
  cohere: COHERE_CONFIG,
  mistral: MISTRAL_CONFIG,
}

/**
 * 获取提供商配置
 */
export function getProviderConfig(providerId: string): APIProviderConfig | undefined {
  return API_PROVIDERS[providerId]
}

/**
 * 构建完整的 API 端点 URL
 */
export function buildEndpointUrl(
  provider: string,
  customEndpoint?: string,
  reverseProxy?: string
): string {
  const config = getProviderConfig(provider)
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`)
  }

  if (reverseProxy) {
    const proxy = config.reverseProxies?.find(p => p.name === reverseProxy)
    if (proxy) {
      return proxy.endpoint
    }
  }

  if (customEndpoint) {
    return customEndpoint
  }

  return config.defaultEndpoint
}

/**
 * 构建请求头
 */
export function buildHeaders(
  provider: string,
  apiKey: string,
  customHeaders?: Record<string, string>,
  reverseProxy?: string
): Record<string, string> {
  const config = getProviderConfig(provider)
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`)
  }

  const headers: Record<string, string> = { ...config.requiredHeaders }

  if (config.authType === 'bearer') {
    headers[config.authHeader!] = `Bearer ${apiKey}`
  } else if (config.authType === 'api-key') {
    headers[config.authHeader!] = apiKey
  }

  if (reverseProxy) {
    const proxy = config.reverseProxies?.find(p => p.name === reverseProxy)
    if (proxy?.customHeaders) {
      Object.assign(headers, proxy.customHeaders)
    }
  }

  if (customHeaders) {
    Object.assign(headers, customHeaders)
  }

  return headers
}
