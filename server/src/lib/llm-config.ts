import { AppError, ErrorCode } from './errors.js'
import { resolveLlmSessionApiKey } from '../services/llm-session.service.js'
import { z } from 'zod'
import { inspectJsonComplexity } from './bounded-json.js'

const legacyTypeSchema = z.enum(['openai', 'kobold', 'textgen', 'novel', 'custom'])

const customHeadersSchema = z.record(z.string().max(8192)).superRefine((value, ctx) => {
  if (Object.keys(value).length > 64) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Too many custom headers' })
  }
  if (JSON.stringify(value).length > 64 * 1024) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Custom headers are too large' })
  }
})

const customBodyFieldsSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  if (Object.keys(value).length > 128) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Too many custom body fields' })
  }
  if (JSON.stringify(value).length > 256 * 1024) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Custom body fields are too large' })
  }
  if (!inspectJsonComplexity(value, { maxDepth: 12, maxNodes: 10_000, maxArrayLength: 1_000 }).ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Custom body fields are too complex' })
  }
})

export const llmApiFormatSchema = z.enum([
  'openai_chat',
  'openai_completion',
  'openai_responses',
  'azure_openai_chat',
  'anthropic_messages',
  'gemini_generate_content',
  'ollama_native_chat',
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
  'aimlapi',
  'electronhub',
  'chutes',
  'nanogpt',
  'cometapi',
  'xai',
  'zai',
  'pollinations',
  'kobold',
  'textgen',
  'ollama',
  'ollama_native',
  'llamacpp',
  'vllm',
  'lmstudio',
  'custom_openai_chat',
  'custom_openai_responses',
  'custom_claude',
  'custom_gemini',
])

export const llmConfigSchema = z.object({
  source: llmSourceSchema.optional(),
  apiUrl: z.string().trim().min(1).max(4096),
  apiKey: z.string().max(4096),
  apiKeySessionId: z.string().max(256).optional(),
  model: z.string().trim().min(1).max(512),
  type: legacyTypeSchema.default('openai'),
  useReverseProxy: z.boolean().optional(),
  reverseProxyUrl: z.string().max(4096).optional(),
  reverseProxyPassword: z.string().max(4096).optional(),
  reverseProxyName: z.string().max(256).optional(),
  customApiFormat: llmApiFormatSchema.optional(),
  customHeaders: customHeadersSchema.optional(),
  customBodyFields: customBodyFieldsSchema.optional(),
  excludeBodyFields: z.array(z.string().max(256)).max(128).optional(),
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

export type ChatCompletionSource = z.infer<typeof llmSourceSchema>
export type CustomAPIFormat = z.infer<typeof llmApiFormatSchema>
export type LLMConfig = z.infer<typeof llmConfigSchema>
export type LlmConfigWithSession = LLMConfig

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
