import type { ChatCompletionSource, CustomAPIFormat, LLMConfig } from '@/types'

export type ProviderCategory = 'official' | 'gateway' | 'local' | 'custom'
export type ProviderDisplayGroup = 'compatible' | 'vendor'
export type ProviderEditMode = 'always' | 'developer'

export interface ProviderOption {
  value: ChatCompletionSource
  label: string
  endpoint: string
  type: LLMConfig['type']
  format: CustomAPIFormat
  model: string
  description: string
  category: ProviderCategory
  displayGroup: ProviderDisplayGroup
  endpointEditMode: ProviderEditMode
  formatEditMode: ProviderEditMode
  allowedFormats?: CustomAPIFormat[]
  searchAliases?: string[]
}

export const PROVIDER_DISPLAY_GROUPS: { value: ProviderDisplayGroup; label: string }[] = [
  { value: 'compatible', label: '兼容 / 自定义 API' },
  { value: 'vendor', label: '厂商 / 平台 API' },
]

export const LLM_PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: 'lmstudio',
    label: 'LM Studio',
    endpoint: 'http://localhost:1234/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'local-model',
    description: '本地 OpenAI-compatible 服务',
    category: 'local',
    displayGroup: 'compatible',
    endpointEditMode: 'always',
    formatEditMode: 'developer',
    searchAliases: ['local', 'openai compatible'],
  },
  {
    value: 'ollama',
    label: 'Ollama',
    endpoint: 'http://localhost:11434/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'llama3.1',
    description: '本地 Ollama OpenAI-compatible API',
    category: 'local',
    displayGroup: 'compatible',
    endpointEditMode: 'always',
    formatEditMode: 'developer',
    searchAliases: ['local', 'openai compatible'],
  },
  {
    value: 'ollama_native',
    label: 'Ollama Native',
    endpoint: 'http://localhost:11434',
    type: 'openai',
    format: 'ollama_native_chat',
    model: 'llama3.1',
    description: 'Ollama 原生 /api/chat 与 /api/tags',
    category: 'local',
    displayGroup: 'compatible',
    endpointEditMode: 'always',
    formatEditMode: 'developer',
    searchAliases: ['local', 'native'],
  },
  {
    value: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'gpt-4o-mini',
    description: '官方 OpenAI Chat Completions',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['chat completions'],
  },
  {
    value: 'azure_openai',
    label: 'Azure OpenAI',
    endpoint: 'https://{resource}.openai.azure.com',
    type: 'openai',
    format: 'azure_openai_chat',
    model: 'deployment-name',
    description: 'Azure deployment-scoped Chat Completions',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['microsoft', 'deployment'],
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'openai/gpt-4o-mini',
    description: '多模型路由与中转',
    category: 'gateway',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['router', 'proxy', '中转'],
  },
  {
    value: 'anthropic',
    label: 'Claude / Anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    type: 'openai',
    format: 'anthropic_messages',
    model: 'claude-3-5-haiku-latest',
    description: 'Claude Messages API',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['anthropic', 'claude messages'],
  },
  {
    value: 'google',
    label: 'Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    type: 'openai',
    format: 'gemini_generate_content',
    model: 'gemini-2.0-flash',
    description: 'Google Gemini generateContent API',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['google', 'makersuite', 'generatecontent'],
  },
  {
    value: 'groq',
    label: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'llama-3.1-8b-instant',
    description: '高速 OpenAI-compatible 托管',
    category: 'gateway',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible'],
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'deepseek-chat',
    description: 'DeepSeek OpenAI-compatible API',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible'],
  },
  {
    value: 'moonshot',
    label: 'Moonshot / Kimi',
    endpoint: 'https://api.moonshot.cn/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'moonshot-v1-8k',
    description: 'Kimi OpenAI-compatible API',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['kimi', 'openai compatible'],
  },
  {
    value: 'siliconflow',
    label: 'SiliconFlow',
    endpoint: 'https://api.siliconflow.cn/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'deepseek-ai/DeepSeek-V3',
    description: '国内模型聚合与托管',
    category: 'gateway',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible', '中转'],
  },
  {
    value: 'togetherai',
    label: 'Together AI',
    endpoint: 'https://api.together.xyz/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    description: '开源模型托管',
    category: 'gateway',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible'],
  },
  {
    value: 'fireworks',
    label: 'Fireworks AI',
    endpoint: 'https://api.fireworks.ai/inference/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    description: 'OpenAI-compatible 模型服务',
    category: 'gateway',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible'],
  },
  {
    value: 'perplexity',
    label: 'Perplexity',
    endpoint: 'https://api.perplexity.ai',
    type: 'openai',
    format: 'openai_chat',
    model: 'sonar',
    description: 'Perplexity OpenAI-compatible API',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible'],
  },
  {
    value: 'mistral',
    label: 'Mistral AI',
    endpoint: 'https://api.mistral.ai/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'mistral-large-latest',
    description: 'Mistral OpenAI-compatible API',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible'],
  },
  {
    value: 'cohere',
    label: 'Cohere',
    endpoint: 'https://api.cohere.ai/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'command-r-plus',
    description: 'Cohere OpenAI-compatible 入口',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible'],
  },
  {
    value: 'xai',
    label: 'xAI',
    endpoint: 'https://api.x.ai/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'grok-2-latest',
    description: 'xAI OpenAI-compatible API',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['grok', 'openai compatible'],
  },
  {
    value: 'ai21',
    label: 'AI21',
    endpoint: 'https://api.ai21.com/studio/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'jamba-large',
    description: 'AI21 Jamba Chat Completions',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['jamba'],
  },
  {
    value: 'aimlapi',
    label: 'AI/ML API',
    endpoint: 'https://api.aimlapi.com/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'chatgpt-4o-latest',
    description: '多模型 OpenAI-compatible 聚合服务',
    category: 'gateway',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible', '中转'],
  },
  {
    value: 'electronhub',
    label: 'Electron Hub',
    endpoint: 'https://api.electronhub.ai/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'gpt-4o-mini',
    description: 'Electron Hub 多模型 OpenAI-compatible API',
    category: 'gateway',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['electronhub', 'openai compatible', '中转'],
  },
  {
    value: 'chutes',
    label: 'Chutes',
    endpoint: 'https://llm.chutes.ai/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'deepseek-ai/DeepSeek-V3-0324',
    description: 'Chutes OpenAI-compatible 开源模型服务',
    category: 'gateway',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible'],
  },
  {
    value: 'nanogpt',
    label: 'NanoGPT',
    endpoint: 'https://nano-gpt.com/api/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'gpt-4o-mini',
    description: 'NanoGPT OpenAI-compatible API',
    category: 'gateway',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible'],
  },
  {
    value: 'cometapi',
    label: 'CometAPI',
    endpoint: 'https://api.cometapi.com/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'gpt-4o',
    description: 'CometAPI OpenAI-compatible 聚合服务',
    category: 'gateway',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible', '中转'],
  },
  {
    value: 'pollinations',
    label: 'Pollinations',
    endpoint: 'https://gen.pollinations.ai/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'openai',
    description: 'Pollinations OpenAI-compatible 文本入口',
    category: 'gateway',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['openai compatible'],
  },
  {
    value: 'zai',
    label: 'Z.AI / GLM',
    endpoint: 'https://api.z.ai/api/paas/v4',
    type: 'openai',
    format: 'openai_chat',
    model: 'glm-4.6',
    description: 'Z.AI GLM OpenAI-compatible API',
    category: 'official',
    displayGroup: 'vendor',
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
    searchAliases: ['glm', 'zhipu', 'openai compatible'],
  },
  {
    value: 'vllm',
    label: 'vLLM',
    endpoint: 'http://localhost:8000/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'local-model',
    description: '本地/服务器 vLLM OpenAI-compatible API',
    category: 'local',
    displayGroup: 'compatible',
    endpointEditMode: 'always',
    formatEditMode: 'developer',
    searchAliases: ['local', 'openai compatible'],
  },
  {
    value: 'llamacpp',
    label: 'llama.cpp',
    endpoint: 'http://localhost:8080/v1',
    type: 'openai',
    format: 'openai_chat',
    model: 'local-model',
    description: 'llama.cpp server OpenAI-compatible API',
    category: 'local',
    displayGroup: 'compatible',
    endpointEditMode: 'always',
    formatEditMode: 'developer',
    searchAliases: ['local', 'openai compatible'],
  },
  {
    value: 'custom_openai_chat',
    label: '自定义 OpenAI Chat',
    endpoint: 'https://example.com/v1',
    type: 'custom',
    format: 'openai_chat',
    model: 'model-name',
    description: '官方/小众厂商/中转站通用入口',
    category: 'custom',
    displayGroup: 'compatible',
    endpointEditMode: 'always',
    formatEditMode: 'developer',
    allowedFormats: ['openai_chat'],
    searchAliases: ['custom', 'openai compatible', 'proxy', '中转'],
  },
  {
    value: 'custom_openai_responses',
    label: '自定义 OpenAI Responses',
    endpoint: 'https://example.com/v1',
    type: 'custom',
    format: 'openai_responses',
    model: 'model-name',
    description: 'OpenAI Responses 格式兼容入口',
    category: 'custom',
    displayGroup: 'compatible',
    endpointEditMode: 'always',
    formatEditMode: 'developer',
    allowedFormats: ['openai_responses'],
    searchAliases: ['custom', 'responses'],
  },
  {
    value: 'custom_claude',
    label: '自定义 Claude',
    endpoint: 'https://example.com/v1',
    type: 'custom',
    format: 'anthropic_messages',
    model: 'claude-compatible-model',
    description: 'Claude Messages 格式兼容入口',
    category: 'custom',
    displayGroup: 'compatible',
    endpointEditMode: 'always',
    formatEditMode: 'developer',
    allowedFormats: ['anthropic_messages'],
    searchAliases: ['custom', 'anthropic', 'claude messages'],
  },
  {
    value: 'custom_gemini',
    label: '自定义 Gemini',
    endpoint: 'https://example.com/v1beta',
    type: 'custom',
    format: 'gemini_generate_content',
    model: 'gemini-compatible-model',
    description: 'Gemini generateContent 格式兼容入口',
    category: 'custom',
    displayGroup: 'compatible',
    endpointEditMode: 'always',
    formatEditMode: 'developer',
    allowedFormats: ['gemini_generate_content'],
    searchAliases: ['custom', 'google', 'generatecontent'],
  },
]

export const PROVIDER_BY_SOURCE = new Map(
  LLM_PROVIDER_OPTIONS.map(provider => [provider.value, provider]),
)

export const API_FORMAT_OPTIONS: { value: CustomAPIFormat; label: string }[] = [
  { value: 'openai_chat', label: 'OpenAI Chat Completions' },
  { value: 'openai_completion', label: 'OpenAI Legacy Completions' },
  { value: 'openai_responses', label: 'OpenAI Responses' },
  { value: 'azure_openai_chat', label: 'Azure OpenAI Chat Completions' },
  { value: 'anthropic_messages', label: 'Claude Messages' },
  { value: 'gemini_generate_content', label: 'Gemini generateContent' },
  { value: 'ollama_native_chat', label: 'Ollama Native Chat' },
]

export const API_TYPE_OPTIONS: { value: LLMConfig['type']; label: string }[] = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'kobold', label: 'KoboldAI' },
  { value: 'textgen', label: 'Text Generation UI' },
  { value: 'novel', label: 'NovelAI' },
  { value: 'custom', label: '自定义' },
]

export function canonicalAPIFormat(format: CustomAPIFormat | undefined): CustomAPIFormat | undefined {
  if (format === 'claude_messages') return 'anthropic_messages'
  if (format === 'gemini_interactions') return 'gemini_generate_content'
  return API_FORMAT_OPTIONS.some(option => option.value === format) ? format : undefined
}

export function apiFormatLabel(format: CustomAPIFormat | undefined): string {
  const canonical = canonicalAPIFormat(format)
  return API_FORMAT_OPTIONS.find(option => option.value === canonical)?.label ?? 'OpenAI Chat Completions'
}

export function allowedFormatsForProvider(provider: ProviderOption | undefined): CustomAPIFormat[] {
  if (!provider) return API_FORMAT_OPTIONS.map(option => option.value)
  return provider.allowedFormats ?? [provider.format]
}

export function apiFormatOptionsForProvider(provider: ProviderOption | undefined) {
  const allowedFormats = new Set(allowedFormatsForProvider(provider))
  return API_FORMAT_OPTIONS.filter(option => allowedFormats.has(option.value))
}

export function canEditProviderEndpoint(
  provider: ProviderOption | undefined,
  developerMode: boolean,
): boolean {
  if (!provider) return true
  if (provider.displayGroup === 'compatible') return true
  return developerMode
}

export function formatForProvider(
  provider: ProviderOption | undefined,
  format: CustomAPIFormat | undefined,
): CustomAPIFormat {
  if (!provider) return canonicalAPIFormat(format) ?? 'openai_chat'
  const canonical = canonicalAPIFormat(format)
  return canonical && allowedFormatsForProvider(provider).includes(canonical) ? canonical : provider.format
}

export function providerMatchesSearch(provider: ProviderOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  const haystack = [
    provider.label,
    provider.value,
    provider.description,
    provider.endpoint,
    apiFormatLabel(provider.format),
    ...(provider.searchAliases ?? []),
  ].join(' ').toLowerCase()
  return haystack.includes(normalizedQuery)
}

export function endpointSuffixForFormat(format: CustomAPIFormat | undefined): string {
  switch (format) {
    case 'openai_completion':
      return '/completions'
    case 'openai_responses':
      return '/responses'
    case 'anthropic_messages':
    case 'claude_messages':
      return '/messages'
    case 'gemini_generate_content':
    case 'gemini_interactions':
      return '/models/{model}:generateContent'
    case 'azure_openai_chat':
      return '/openai/deployments/{deployment}/chat/completions'
    case 'ollama_native_chat':
      return '/api/chat'
    case 'openai_chat':
    default:
      return '/chat/completions'
  }
}

export function normalizedConfigForProvider(
  config: LLMConfig,
  provider: ProviderOption | undefined,
  developerMode: boolean,
): LLMConfig {
  if (!provider) return config
  const canEditEndpoint = canEditProviderEndpoint(provider, developerMode)
  const canEditFormat = provider.formatEditMode === 'always' || developerMode
  const nextFormat = canEditFormat
    ? formatForProvider(provider, config.customApiFormat)
    : provider.format

  return {
    ...config,
    source: provider.value,
    apiUrl: canEditEndpoint && config.apiUrl.trim()
      ? config.apiUrl
      : provider.endpoint,
    type: provider.type,
    customApiFormat: nextFormat,
  }
}
