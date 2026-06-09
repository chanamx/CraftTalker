/**
 * API Provider 配置
 * 整合 SillyTavern 和 TauriTavern 的 API 设置
 * 支持官方端点和反向代理
 */

export interface APIProviderConfig {
  id: string
  name: string
  defaultEndpoint: string
  apiFormat: APIFormat
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

export const API_FORMATS = [
  'openai_chat',
  'openai_completion',
  'openai_responses',
  'azure_openai_chat',
  'anthropic_messages',
  'gemini_generate_content',
  'ollama_native_chat',
] as const

export type APIFormat = typeof API_FORMATS[number]

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
  apiFormat: 'openai_chat',
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
        'X-OpenRouter-Title': 'CraftTalker',
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
  apiFormat: 'anthropic_messages',
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
  apiFormat: 'gemini_generate_content',
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
  apiFormat: 'openai_chat',
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
  apiFormat: 'openai_chat',
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

function openAICompatibleProvider(
  id: string,
  name: string,
  defaultEndpoint: string,
  options: Partial<Pick<APIProviderConfig, 'rateLimit' | 'modelDefaults' | 'reverseProxies' | 'requiredHeaders' | 'supportsStreaming' | 'authType' | 'authHeader' | 'apiFormat'>> = {},
): APIProviderConfig {
  const requiredHeaders = {
    'Content-Type': 'application/json',
    ...(options.requiredHeaders ?? {}),
  }

  return {
    id,
    name,
    defaultEndpoint,
    apiFormat: options.apiFormat ?? 'openai_chat',
    supportsStreaming: options.supportsStreaming ?? true,
    authType: options.authType ?? 'bearer',
    authHeader: options.authHeader ?? 'Authorization',
    ...options,
    requiredHeaders,
  }
}

export const OPENROUTER_CONFIG = openAICompatibleProvider(
  'openrouter',
  'OpenRouter',
  'https://openrouter.ai/api/v1',
  {
    requiredHeaders: {
      'HTTP-Referer': 'https://crafttalker.app',
      'X-OpenRouter-Title': 'CraftTalker',
    },
    reverseProxies: [
      {
        name: 'OpenRouter',
        endpoint: 'https://openrouter.ai/api/v1',
        requiresAuth: true,
        customHeaders: {
          'HTTP-Referer': 'https://crafttalker.app',
          'X-OpenRouter-Title': 'CraftTalker',
        },
      },
    ],
  },
)

export const GROQ_CONFIG = openAICompatibleProvider('groq', 'Groq', 'https://api.groq.com/openai/v1')
export const FIREWORKS_CONFIG = openAICompatibleProvider('fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1')
export const TOGETHER_CONFIG = openAICompatibleProvider('togetherai', 'Together AI', 'https://api.together.xyz/v1')
export const PERPLEXITY_CONFIG = openAICompatibleProvider('perplexity', 'Perplexity', 'https://api.perplexity.ai')
export const DEEPSEEK_CONFIG = openAICompatibleProvider('deepseek', 'DeepSeek', 'https://api.deepseek.com/v1')
export const MOONSHOT_CONFIG = openAICompatibleProvider('moonshot', 'Moonshot/Kimi', 'https://api.moonshot.cn/v1')
export const SILICONFLOW_CONFIG = openAICompatibleProvider('siliconflow', 'SiliconFlow', 'https://api.siliconflow.cn/v1')
export const XAI_CONFIG = openAICompatibleProvider('xai', 'xAI', 'https://api.x.ai/v1')
export const AI21_CONFIG = openAICompatibleProvider('ai21', 'AI21', 'https://api.ai21.com/studio/v1')
export const AIMLAPI_CONFIG = openAICompatibleProvider(
  'aimlapi',
  'AI/ML API',
  'https://api.aimlapi.com/v1',
  {
    requiredHeaders: {
      'HTTP-Referer': 'https://crafttalker.app',
      'X-Title': 'CraftTalker',
    },
  },
)
export const ELECTRONHUB_CONFIG = openAICompatibleProvider('electronhub', 'Electron Hub', 'https://api.electronhub.ai/v1')
export const CHUTES_CONFIG = openAICompatibleProvider('chutes', 'Chutes', 'https://llm.chutes.ai/v1')
export const NANOGPT_CONFIG = openAICompatibleProvider('nanogpt', 'NanoGPT', 'https://nano-gpt.com/api/v1')
export const COMETAPI_CONFIG = openAICompatibleProvider('cometapi', 'CometAPI', 'https://api.cometapi.com/v1')
export const ZAI_CONFIG = openAICompatibleProvider(
  'zai',
  'Z.AI',
  'https://api.z.ai/api/paas/v4',
  {
    requiredHeaders: {
      'Accept-Language': 'en-US,en',
    },
  },
)
export const POLLINATIONS_CONFIG = openAICompatibleProvider('pollinations', 'Pollinations', 'https://gen.pollinations.ai/v1')
export const OLLAMA_CONFIG = openAICompatibleProvider('ollama', 'Ollama', 'http://localhost:11434/v1')
export const OLLAMA_NATIVE_CONFIG = openAICompatibleProvider(
  'ollama_native',
  'Ollama Native',
  'http://localhost:11434',
  {
    apiFormat: 'ollama_native_chat',
  },
)
export const LMSTUDIO_CONFIG = openAICompatibleProvider('lmstudio', 'LM Studio', 'http://localhost:1234/v1')
export const VLLM_CONFIG = openAICompatibleProvider('vllm', 'vLLM', 'http://localhost:8000/v1')
export const LLAMACPP_CONFIG = openAICompatibleProvider('llamacpp', 'llama.cpp', 'http://localhost:8080/v1')

export const AZURE_OPENAI_CONFIG: APIProviderConfig = {
  id: 'azure_openai',
  name: 'Azure OpenAI',
  defaultEndpoint: 'https://{resource}.openai.azure.com',
  apiFormat: 'azure_openai_chat',
  supportsStreaming: true,
  authType: 'api-key',
  authHeader: 'api-key',
  requiredHeaders: {
    'Content-Type': 'application/json',
  },
  reverseProxies: [],
  modelDefaults: {
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
  },
}

/**
 * 所有 API 提供商配置
 */
export const API_PROVIDERS: Record<string, APIProviderConfig> = {
  openai: OPENAI_CONFIG,
  azure_openai: AZURE_OPENAI_CONFIG,
  openrouter: OPENROUTER_CONFIG,
  anthropic: ANTHROPIC_CONFIG,
  google: GOOGLE_CONFIG,
  gemini: GOOGLE_CONFIG,
  groq: GROQ_CONFIG,
  fireworks: FIREWORKS_CONFIG,
  togetherai: TOGETHER_CONFIG,
  perplexity: PERPLEXITY_CONFIG,
  deepseek: DEEPSEEK_CONFIG,
  moonshot: MOONSHOT_CONFIG,
  siliconflow: SILICONFLOW_CONFIG,
  xai: XAI_CONFIG,
  ai21: AI21_CONFIG,
  aimlapi: AIMLAPI_CONFIG,
  electronhub: ELECTRONHUB_CONFIG,
  chutes: CHUTES_CONFIG,
  nanogpt: NANOGPT_CONFIG,
  cometapi: COMETAPI_CONFIG,
  zai: ZAI_CONFIG,
  pollinations: POLLINATIONS_CONFIG,
  ollama: OLLAMA_CONFIG,
  ollama_native: OLLAMA_NATIVE_CONFIG,
  lmstudio: LMSTUDIO_CONFIG,
  vllm: VLLM_CONFIG,
  llamacpp: LLAMACPP_CONFIG,
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

  if (apiKey && config.authType === 'bearer') {
    headers[config.authHeader!] = `Bearer ${apiKey}`
  } else if (apiKey && config.authType === 'api-key') {
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
