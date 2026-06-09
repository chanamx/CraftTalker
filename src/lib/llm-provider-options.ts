import type { ChatCompletionSource, CustomAPIFormat, LLMConfig } from '@/types'

export type ProviderCategory = 'official' | 'gateway' | 'local' | 'custom'
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
  endpointEditMode: ProviderEditMode
  formatEditMode: ProviderEditMode
}

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
    endpointEditMode: 'always',
    formatEditMode: 'developer',
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
    endpointEditMode: 'always',
    formatEditMode: 'developer',
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
    endpointEditMode: 'always',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'developer',
    formatEditMode: 'developer',
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
    endpointEditMode: 'always',
    formatEditMode: 'developer',
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
    endpointEditMode: 'always',
    formatEditMode: 'developer',
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
    endpointEditMode: 'always',
    formatEditMode: 'always',
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
    endpointEditMode: 'always',
    formatEditMode: 'always',
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
    endpointEditMode: 'always',
    formatEditMode: 'always',
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
    endpointEditMode: 'always',
    formatEditMode: 'always',
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

export function apiFormatLabel(format: CustomAPIFormat | undefined): string {
  if (format === 'claude_messages') return 'Claude Messages'
  if (format === 'gemini_interactions') return 'Gemini generateContent'
  return API_FORMAT_OPTIONS.find(option => option.value === format)?.label ?? 'OpenAI Chat Completions'
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
  const canEditEndpoint = provider.endpointEditMode === 'always' || developerMode
  const canEditFormat = provider.formatEditMode === 'always' || developerMode

  return {
    ...config,
    source: provider.value,
    apiUrl: canEditEndpoint && config.apiUrl.trim()
      ? config.apiUrl
      : provider.endpoint,
    type: provider.type,
    customApiFormat: canEditFormat
      ? config.customApiFormat ?? provider.format
      : provider.format,
  }
}
