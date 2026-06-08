import { AppError, ErrorCode } from './errors.js'
import { resolveLlmSessionApiKey } from '../services/llm-session.service.js'
import type { ChatCompletionSource } from '../services/llm.service.js'
import { z } from 'zod'

const legacyTypeSchema = z.enum(['openai', 'kobold', 'textgen', 'novel', 'custom'])

export const llmApiFormatSchema = z.enum([
  'openai_chat',
  'openai_completion',
  'openai_responses',
  'anthropic_messages',
  'gemini_generate_content',
  // Legacy names accepted from earlier ST/TauriTavern mapping work.
  'claude_messages',
  'gemini_interactions',
])

const llmSourceSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'azure_openai',
  'vertexai',
  'openrouter',
  'groq',
  'fireworks',
  'togetherai',
  'perplexity',
  'deepseek',
  'moonshot',
  'siliconflow',
  'minimax',
  'zhipu',
  'mistral',
  'cohere',
  'ai21',
  'xai',
  'pollinations',
  'kobold',
  'textgen',
  'ollama',
  'llamacpp',
  'vllm',
  'custom_openai_chat',
  'custom_openai_responses',
  'custom_claude',
  'custom_gemini',
])

export const llmConfigSchema = z.object({
  source: llmSourceSchema.optional(),
  apiUrl: z.string(),
  apiKey: z.string(),
  apiKeySessionId: z.string().optional(),
  model: z.string(),
  type: legacyTypeSchema.default('openai'),
  useReverseProxy: z.boolean().optional(),
  reverseProxyUrl: z.string().optional(),
  reverseProxyPassword: z.string().optional(),
  reverseProxyName: z.string().optional(),
  customApiFormat: llmApiFormatSchema.optional(),
  customHeaders: z.record(z.string()).optional(),
  customBodyFields: z.record(z.unknown()).optional(),
  excludeBodyFields: z.array(z.string()).optional(),
  azureConfig: z.object({
    resourceName: z.string(),
    deploymentName: z.string(),
    apiVersion: z.string(),
  }).optional(),
  vertexConfig: z.object({
    projectId: z.string(),
    region: z.string(),
    authMode: z.enum(['express', 'service_account']),
  }).optional(),
  regionEndpoint: z.string().optional(),
})

export interface LlmConfigWithSession {
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
  customApiFormat?: z.infer<typeof llmApiFormatSchema>
  customHeaders?: Record<string, string>
  customBodyFields?: Record<string, unknown>
  excludeBodyFields?: string[]
}

export function resolveLlmConfigApiKey<T extends LlmConfigWithSession>(config: T): T {
  if (!config.apiKeySessionId) return config

  const apiKey = resolveLlmSessionApiKey(config.apiKeySessionId)
  if (apiKey === null) {
    throw new AppError(
      ErrorCode.LLM_CONNECTION_ERROR,
      'API key session was not found. Re-save the LLM connection settings.',
      { apiKeySessionId: config.apiKeySessionId },
    )
  }

  return {
    ...config,
    apiKey,
  }
}
