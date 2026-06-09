export interface LLMConfig {
  source?: ChatCompletionSource
  apiUrl: string
  apiKey: string
  apiKeySessionId?: string
  model: string
  type: 'openai' | 'kobold' | 'textgen' | 'novel' | 'custom'
  useReverseProxy?: boolean
  reverseProxyUrl?: string
  reverseProxyPassword?: string
  reverseProxyName?: string
  customApiFormat?: CustomAPIFormat
  customHeaders?: Record<string, string>
  customBodyFields?: Record<string, unknown>
  excludeBodyFields?: string[]
  azureConfig?: {
    resourceName: string
    deploymentName: string
    apiVersion: string
  }
  vertexConfig?: {
    projectId: string
    region: string
    authMode: 'express' | 'service_account'
  }
  regionEndpoint?: string
}

export type ChatCompletionSource =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure_openai'
  | 'vertexai'
  | 'openrouter'
  | 'groq'
  | 'fireworks'
  | 'togetherai'
  | 'perplexity'
  | 'deepseek'
  | 'moonshot'
  | 'siliconflow'
  | 'minimax'
  | 'zhipu'
  | 'mistral'
  | 'cohere'
  | 'ai21'
  | 'aimlapi'
  | 'electronhub'
  | 'chutes'
  | 'nanogpt'
  | 'cometapi'
  | 'xai'
  | 'zai'
  | 'pollinations'
  | 'kobold'
  | 'textgen'
  | 'ollama'
  | 'ollama_native'
  | 'llamacpp'
  | 'vllm'
  | 'lmstudio'
  | 'custom_openai_chat'
  | 'custom_openai_responses'
  | 'custom_claude'
  | 'custom_gemini'

export type CustomAPIFormat =
  | 'openai_chat'
  | 'openai_completion'
  | 'openai_responses'
  | 'azure_openai_chat'
  | 'anthropic_messages'
  | 'gemini_generate_content'
  | 'ollama_native_chat'
  | 'claude_messages'
  | 'gemini_interactions'
