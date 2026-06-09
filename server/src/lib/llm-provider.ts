import {
  buildEndpointUrl,
  buildHeaders,
  getProviderConfig,
  type APIFormat,
} from '../config/api-providers.js'
import type { LLMConfig } from './llm-config.js'

export const DEFAULT_AZURE_OPENAI_API_VERSION = '2024-10-21'

const OPENAI_COMPAT_SOURCES = new Set([
  'openai',
  'openrouter',
  'groq',
  'fireworks',
  'togetherai',
  'perplexity',
  'deepseek',
  'moonshot',
  'siliconflow',
  'xai',
  'mistral',
  'cohere',
  'ollama',
  'lmstudio',
  'vllm',
  'llamacpp',
  'custom_openai_chat',
])

export function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${trimTrailingSlashes(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`
}

function joinOllamaNativeUrl(baseUrl: string, path: string): string {
  const normalizedPath = trimTrailingSlashes(baseUrl).endsWith('/api')
    ? path.replace(/^\/api/, '')
    : path
  return joinUrl(baseUrl, normalizedPath)
}

export function canonicalApiFormat(format: string | undefined): APIFormat | undefined {
  switch (format) {
    case 'claude_messages':
      return 'anthropic_messages'
    case 'gemini_interactions':
      return 'gemini_generate_content'
    case 'openai_chat':
    case 'openai_completion':
    case 'openai_responses':
    case 'azure_openai_chat':
    case 'anthropic_messages':
    case 'gemini_generate_content':
    case 'ollama_native_chat':
      return format
    default:
      return undefined
  }
}

function legacyProviderFromType(type: LLMConfig['type']): string {
  switch (type) {
    case 'kobold':
    case 'textgen':
    case 'novel':
      return type
    case 'custom':
      return 'custom_openai_chat'
    case 'openai':
    default:
      return 'openai'
  }
}

export function providerFromConfig(config: LLMConfig): string {
  if (config.source) {
    if (config.source === 'google') return 'gemini'
    if (config.source === 'custom_claude') return 'anthropic'
    if (config.source === 'custom_gemini') return 'gemini'
    if (config.source === 'custom_openai_responses') return 'openai'
    return config.source
  }
  return legacyProviderFromType(config.type)
}

export function apiFormatFromConfig(config: LLMConfig): APIFormat {
  const customFormat = canonicalApiFormat(config.customApiFormat)
  if (customFormat) return customFormat

  if (config.source === 'azure_openai') return 'azure_openai_chat'
  if (config.source === 'ollama_native') return 'ollama_native_chat'
  if (config.source === 'custom_claude') return 'anthropic_messages'
  if (config.source === 'custom_gemini') return 'gemini_generate_content'
  if (config.source === 'custom_openai_responses') return 'openai_responses'
  if (config.type !== 'openai' && config.type !== 'custom') return 'openai_completion'

  const provider = providerFromConfig(config)
  return getProviderConfig(provider)?.apiFormat ?? (OPENAI_COMPAT_SOURCES.has(provider) ? 'openai_chat' : 'openai_chat')
}

export function baseUrlFromConfig(config: LLMConfig, provider = providerFromConfig(config)): string {
  if (config.useReverseProxy && config.reverseProxyUrl) return trimTrailingSlashes(config.reverseProxyUrl)

  if (provider === 'azure_openai') {
    const resourceName = config.azureConfig?.resourceName?.trim()
    const apiUrl = config.apiUrl.trim()
    if (resourceName && (!apiUrl || apiUrl.includes('{resource}'))) {
      return `https://${resourceName}.openai.azure.com`
    }
  }

  if (config.source?.startsWith('custom_')) return trimTrailingSlashes(config.apiUrl)

  const providerConfig = getProviderConfig(provider)
  if (!providerConfig) return trimTrailingSlashes(config.apiUrl)

  return trimTrailingSlashes(buildEndpointUrl(
    provider,
    config.apiUrl,
    config.reverseProxyName,
  ))
}

export function headersFromConfig(config: LLMConfig, provider = providerFromConfig(config)): Record<string, string> {
  const providerConfig = getProviderConfig(provider)
  if (!providerConfig) {
    return {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      ...(config.customHeaders ?? {}),
    }
  }

  return buildHeaders(
    provider,
    config.apiKey,
    config.customHeaders,
    config.reverseProxyName,
  )
}

export function azureDeploymentName(config: LLMConfig): string {
  return config.azureConfig?.deploymentName?.trim() || config.model
}

export function azureApiVersion(config: LLMConfig): string {
  return config.azureConfig?.apiVersion?.trim() || DEFAULT_AZURE_OPENAI_API_VERSION
}

export function azureChatCompletionsUrl(baseUrl: string, config: LLMConfig): string {
  const deployment = encodeURIComponent(azureDeploymentName(config))
  const version = encodeURIComponent(azureApiVersion(config))
  return joinUrl(baseUrl, `/openai/deployments/${deployment}/chat/completions?api-version=${version}`)
}

export function modelListUrlFromConfig(config: LLMConfig): string {
  const provider = providerFromConfig(config)
  const apiFormat = apiFormatFromConfig(config)
  const baseUrl = baseUrlFromConfig(config, provider)

  if (apiFormat === 'ollama_native_chat') return joinOllamaNativeUrl(baseUrl, '/api/tags')
  if (apiFormat === 'azure_openai_chat') {
    return joinUrl(baseUrl, `/openai/deployments?api-version=${encodeURIComponent(azureApiVersion(config))}`)
  }
  return joinUrl(baseUrl, '/models')
}

export function ollamaNativeChatUrl(baseUrl: string): string {
  return joinOllamaNativeUrl(baseUrl, '/api/chat')
}
