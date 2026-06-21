import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createError, ErrorCode } from '../lib/errors.js'
import { llmConfigSchema, resolveLlmConfigApiKey, type LLMConfig } from '../lib/llm-config.js'
import {
  apiFormatFromConfig,
  azureChatCompletionsUrl,
  baseUrlFromConfig,
  geminiModelId,
  headersFromConfig,
  joinUrl,
  ollamaNativeChatUrl,
  providerFromConfig,
} from '../lib/llm-provider.js'
import type { APIFormat } from '../config/api-providers.js'
import {
  anthropicBody,
  azureChatBody,
  completionBody,
  geminiBody,
  ollamaNativeBody,
  openAICompatibleBody,
  openAIResponsesBody,
} from '../engine/native-bodies.js'
import { consumeNDJSON, consumeSSE } from '../engine/native-stream.js'
import { fetchModelsFromAPI } from '../services/llm-models.service.js'
import type { GenerationPreset } from '../services/preset.service.js'

const stBackendsRoute = new Hono()

const ST_CHAT_COMPLETION_SOURCES = [
  'openai',
  'claude',
  'openrouter',
  'ai21',
  'makersuite',
  'google',
  'vertexai',
  'mistralai',
  'custom',
  'cohere',
  'perplexity',
  'groq',
  'chutes',
  'electronhub',
  'nanogpt',
  'deepseek',
  'aimlapi',
  'xai',
  'pollinations',
  'moonshot',
  'fireworks',
  'cometapi',
  'azure_openai',
  'zai',
  'siliconflow',
] as const

const stChatCompletionSourceSchema = z.enum(ST_CHAT_COMPLETION_SOURCES)
const stMessageSchema = z.object({
  role: z.string(),
  content: z.union([
    z.string(),
    z.array(z.unknown()),
    z.record(z.unknown()),
  ]).optional(),
}).passthrough()

const stChatCompletionsPayloadSchema = z.object({
  chat_completion_source: stChatCompletionSourceSchema.default('openai'),
  reverse_proxy: z.string().optional(),
  proxy_password: z.string().optional(),
  model: z.string().optional(),
  messages: z.array(stMessageSchema).optional(),
  stream: z.boolean().optional(),
  max_tokens: z.number().optional(),
  max_output_tokens: z.number().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  min_p: z.number().optional(),
  repetition_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  custom_url: z.string().optional(),
  custom_include_headers: z.union([z.string(), z.record(z.unknown())]).optional(),
  custom_include_body: z.union([z.string(), z.record(z.unknown())]).optional(),
  custom_exclude_body: z.union([z.string(), z.array(z.string())]).optional(),
  customApiFormat: z.string().optional(),
  apiKeySessionId: z.string().optional(),
}).catchall(z.unknown())

type StChatCompletionsPayload = z.infer<typeof stChatCompletionsPayloadSchema>

stBackendsRoute.post(
  '/chat-completions/status',
  zValidator('json', stChatCompletionsPayloadSchema),
  async (c) => {
    const payload = c.req.valid('json')
    const config = resolveLlmConfigApiKey(configFromStPayload(payload))
    const models = await fetchModelsFromAPI(config)
    return c.json({ data: models.map(id => ({ id })) })
  },
)

stBackendsRoute.post(
  '/chat-completions/generate',
  zValidator('json', stChatCompletionsPayloadSchema),
  async (c) => {
    const payload = c.req.valid('json')
    const config = resolveLlmConfigApiKey(configFromStPayload(payload))
    const preset = presetFromStPayload(payload)
    const messages = messagesFromStPayload(payload)

    if (payload.stream === true) {
      return new Response(streamChatCompletion(config, preset, messages), {
        headers: headersForSse(),
      })
    }

    const result = await generateDirect(config, preset, messages)
    return c.json(openAICompletionResponse(result))
  },
)

function configFromStPayload(payload: StChatCompletionsPayload): LLMConfig {
  const source = normalizeStSource(payload.chat_completion_source)
  assertSupportedStSource(source)
  const reverseProxy = stringValue(payload.reverse_proxy)
  const apiKey = stringValue(payload.proxy_password)
  const model = stringValue(payload.model) || defaultModelForSource(source)
  const customApiFormat = customApiFormatFromPayload(payload)
  const customHeaders = customHeadersFromStPayload(payload)
  const customBodyFields = customBodyFieldsFromStPayload(payload)
  const excludeBodyFields = excludeBodyFieldsFromStPayload(payload)

  if (source === 'claude') {
    return llmConfigSchema.parse({
      source: 'custom_claude',
      apiUrl: reverseProxy || 'https://api.anthropic.com/v1',
      apiKey,
      apiKeySessionId: stringValue(payload.apiKeySessionId) || undefined,
      model,
      type: 'openai',
    })
  }

  if (source === 'makersuite') {
    return llmConfigSchema.parse({
      source: 'custom_gemini',
      apiUrl: geminiBaseUrlFromStPayload(reverseProxy),
      apiKey,
      apiKeySessionId: stringValue(payload.apiKeySessionId) || undefined,
      model,
      type: 'openai',
    })
  }

  if (source === 'custom') {
    return llmConfigSchema.parse({
      source: customApiFormat === 'openai_responses' ? 'custom_openai_responses' : 'custom_openai_chat',
      apiUrl: stringValue(payload.custom_url) || reverseProxy || 'https://api.openai.com/v1',
      apiKey,
      apiKeySessionId: stringValue(payload.apiKeySessionId) || undefined,
      model,
      type: 'openai',
      ...(customApiFormat ? { customApiFormat } : {}),
      ...(customHeaders ? { customHeaders } : {}),
      ...(customBodyFields ? { customBodyFields } : {}),
      ...(excludeBodyFields ? { excludeBodyFields } : {}),
    })
  }

  if (source === 'azure_openai') {
    const azureBaseUrl = stringValue(payload.azure_base_url) || reverseProxy || 'https://{resource}.openai.azure.com'
    return llmConfigSchema.parse({
      source: 'azure_openai',
      apiUrl: azureBaseUrl,
      apiKey,
      apiKeySessionId: stringValue(payload.apiKeySessionId) || undefined,
      model,
      type: 'openai',
      azureConfig: {
        resourceName: '',
        deploymentName: stringValue(payload.azure_deployment_name) || model,
        apiVersion: stringValue(payload.azure_api_version) || '2024-10-21',
      },
      ...(customHeaders ? { customHeaders } : {}),
      ...(customBodyFields ? { customBodyFields } : {}),
      ...(excludeBodyFields ? { excludeBodyFields } : {}),
    })
  }

  return llmConfigSchema.parse({
    source: sourceFromStSource(source),
    apiUrl: reverseProxy || defaultBaseUrlForSource(source),
    apiKey,
    apiKeySessionId: stringValue(payload.apiKeySessionId) || undefined,
    model,
    type: 'openai',
    ...(customHeaders ? { customHeaders } : {}),
    ...(customBodyFields ? { customBodyFields } : {}),
    ...(excludeBodyFields ? { excludeBodyFields } : {}),
  })
}

function presetFromStPayload(payload: StChatCompletionsPayload): GenerationPreset {
  const stopSequences = stopSequencesFromStPayload(payload.stop)
  return {
    name: 'ST host chat-completions compatibility',
    temperature: numberValue(payload.temperature, 0.7),
    top_p: numberValue(payload.top_p, 1),
    top_k: numberValue(payload.top_k, 0),
    top_a: 0,
    min_p: numberValue(payload.min_p, 0),
    repetition_penalty: numberValue(payload.repetition_penalty, 1),
    repetition_penalty_range: 0,
    repetition_penalty_slope: 0,
    frequency_penalty: numberValue(payload.frequency_penalty, 0),
    presence_penalty: numberValue(payload.presence_penalty, 0),
    typical_p: 1,
    tfs: 1,
    mirostat_mode: 0,
    mirostat_tau: 5,
    mirostat_eta: 0.1,
    sampler_order: [],
    skip_special_tokens: true,
    ban_eos_token: false,
    add_bos_token: false,
    token_healing: false,
    seed: -1,
    grammar_string: '',
    guidance_scale: 1,
    negative_prompt: '',
    dry_allowed_length: 0,
    dry_multiplier: 0,
    dry_base: 0,
    dry_sequence_breakers: '',
    xtc_threshold: 0,
    xtc_probability: 0,
    max_tokens: numberValue(payload.max_tokens ?? payload.max_output_tokens, 1024),
    stop_sequences: stopSequences,
    raw: {},
  }
}

function streamChatCompletion(
  config: LLMConfig,
  preset: GenerationPreset,
  messages: DirectMessage,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        const context = requestContext(config, preset, messages, true)
        const response = await fetchLLM(context.url, context.headers, context.body)
        for await (const text of streamTextFromResponse(response, context.apiFormat)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIStreamChunk(text))}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: errorMessage(error) } })}\n\n`))
        controller.close()
      }
    },
  })
}

type DirectMessage = Array<{ role: string; content: string }>

interface DirectCompletionResult {
  content: string
  finishReason: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

function messagesFromStPayload(payload: StChatCompletionsPayload): DirectMessage {
  const messages = payload.messages ?? []
  const normalized = messages
    .map(message => ({
      role: normalizeRole(message.role),
      content: contentToText(message.content),
    }))
    .filter(message => message.content.trim() !== '')
  return normalized.length ? normalized : [{ role: 'user', content: '' }]
}

function normalizeRole(role: string): 'system' | 'user' | 'assistant' {
  if (role === 'system') return 'system'
  if (role === 'assistant') return 'assistant'
  return 'user'
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part
      if (isRecord(part) && typeof part.text === 'string') return part.text
      return ''
    }).filter(Boolean).join('\n')
  }
  if (isRecord(content) && typeof content.text === 'string') return content.text
  return ''
}

async function generateDirect(
  config: LLMConfig,
  preset: GenerationPreset,
  messages: DirectMessage,
): Promise<DirectCompletionResult> {
  const context = requestContext(config, preset, messages, false)
  const response = await fetchLLM(context.url, context.headers, context.body)
  const data = await response.json() as Record<string, unknown>
  return parseCompletionResult(data, context.apiFormat)
}

function openAICompletionResponse(result: DirectCompletionResult): Record<string, unknown> {
  return {
    id: `chatcmpl-crafttalker-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'crafttalker-compat',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: result.content,
      },
      finish_reason: result.finishReason,
    }],
    ...(result.usage ? {
      usage: {
        prompt_tokens: result.usage.promptTokens,
        completion_tokens: result.usage.completionTokens,
        total_tokens: result.usage.totalTokens,
      },
    } : {}),
  }
}

function openAIStreamChunk(content: string): Record<string, unknown> {
  return {
    id: `chatcmpl-crafttalker-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'crafttalker-compat',
    choices: [{
      index: 0,
      delta: { content },
      finish_reason: null,
    }],
  }
}

function requestContext(
  config: LLMConfig,
  preset: GenerationPreset,
  messages: DirectMessage,
  stream: boolean,
): {
  apiFormat: APIFormat
  body: Record<string, unknown>
  headers: Record<string, string>
  url: string
} {
  const provider = providerFromConfig(config)
  const apiFormat = apiFormatFromConfig(config)
  const baseUrl = baseUrlFromConfig(config, provider)
  const headers = headersFromConfig(config, provider)

  switch (apiFormat) {
    case 'anthropic_messages':
      return {
        apiFormat,
        body: anthropicBody(config, preset, messages, stream),
        headers,
        url: joinUrl(baseUrl, '/messages'),
      }
    case 'gemini_generate_content': {
      const model = encodeURIComponent(geminiModelId(config.model))
      return {
        apiFormat,
        body: geminiBody(config, preset, messages),
        headers,
        url: joinUrl(baseUrl, `/models/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`),
      }
    }
    case 'azure_openai_chat':
      return {
        apiFormat,
        body: azureChatBody(config, preset, messages, stream),
        headers,
        url: azureChatCompletionsUrl(baseUrl, config),
      }
    case 'ollama_native_chat':
      return {
        apiFormat,
        body: ollamaNativeBody(config, preset, messages, stream),
        headers,
        url: ollamaNativeChatUrl(baseUrl),
      }
    case 'openai_completion':
      return {
        apiFormat,
        body: completionBody(config, preset, messages.map(message => message.content).join('\n\n'), stream),
        headers,
        url: joinUrl(baseUrl, '/completions'),
      }
    case 'openai_responses':
      return {
        apiFormat,
        body: openAIResponsesBody(config, preset, messages, stream),
        headers,
        url: joinUrl(baseUrl, '/responses'),
      }
    case 'openai_chat':
    default:
      return {
        apiFormat,
        body: openAICompatibleBody(config, preset, messages, stream),
        headers,
        url: joinUrl(baseUrl, '/chat/completions'),
      }
  }
}

async function fetchLLM(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM API request failed (${response.status}): ${errorText}`)
  }
  return response
}

function parseCompletionResult(data: Record<string, unknown>, apiFormat: APIFormat): DirectCompletionResult {
  const providerError = providerErrorMessage(data)
  if (providerError) {
    throw createError(ErrorCode.LLM_API_ERROR, providerError)
  }

  if (apiFormat === 'anthropic_messages') {
    const content = Array.isArray(data.content)
      ? data.content.map(block => isRecord(block) && typeof block.text === 'string' ? block.text : '').join('')
      : ''
    return { content, finishReason: stringValue(data.stop_reason) || 'stop' }
  }

  if (apiFormat === 'gemini_generate_content') {
    const candidates = Array.isArray(data.candidates) ? data.candidates : []
    const candidate = isRecord(candidates[0]) ? candidates[0] : {}
    return {
      content: geminiCandidateText(candidate),
      finishReason: stringValue(candidate.finishReason) || 'stop',
    }
  }

  if (apiFormat === 'ollama_native_chat') {
    const message = isRecord(data.message) ? data.message : {}
    return {
      content: stringValue(message.content),
      finishReason: stringValue(data.done_reason) || 'stop',
    }
  }

  if (apiFormat === 'openai_responses') {
    return {
      content: responsesOutputText(data),
      finishReason: stringValue(data.status) || 'stop',
    }
  }

  const choices = Array.isArray(data.choices) ? data.choices : []
  const first = isRecord(choices[0]) ? choices[0] : {}
  const message = isRecord(first.message) ? first.message : {}
  const usage = parseOpenAIUsage(data)
  return {
    content: stringValue(message.content) || stringValue(first.text),
    finishReason: stringValue(first.finish_reason) || 'stop',
    ...(usage ? { usage } : {}),
  }
}

async function* streamTextFromResponse(response: Response, apiFormat: APIFormat): AsyncGenerator<string, void, unknown> {
  if (apiFormat === 'ollama_native_chat') {
    yield* consumeNDJSON(response, parsed => {
      const data = isRecord(parsed) ? parsed : {}
      const message = isRecord(data.message) ? data.message : {}
      return stringValue(message.content) || undefined
    })
    return
  }

  yield* consumeSSE(response, parsed => {
    const data = isRecord(parsed) ? parsed : {}
    if (apiFormat === 'anthropic_messages') {
      const delta = isRecord(data.delta) ? data.delta : {}
      return stringValue(delta.text) || undefined
    }
    if (apiFormat === 'gemini_generate_content') {
      const candidates = Array.isArray(data.candidates) ? data.candidates : []
      const candidate = isRecord(candidates[0]) ? candidates[0] : {}
      return geminiCandidateText(candidate) || undefined
    }
    if (apiFormat === 'openai_responses') {
      return data.type === 'response.output_text.delta' ? stringValue(data.delta) || undefined : undefined
    }
    const choices = Array.isArray(data.choices) ? data.choices : []
    const first = isRecord(choices[0]) ? choices[0] : {}
    const delta = isRecord(first.delta) ? first.delta : {}
    return stringValue(delta.content) || stringValue(first.text) || undefined
  })
}

function headersForSse(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseOpenAIUsage(data: Record<string, unknown>): DirectCompletionResult['usage'] {
  const usage = isRecord(data.usage) ? data.usage : null
  if (!usage) return undefined
  return {
    promptTokens: numberValue(usage.prompt_tokens, 0),
    completionTokens: numberValue(usage.completion_tokens, 0),
    totalTokens: numberValue(usage.total_tokens, 0),
  }
}

function geminiCandidateText(candidate: Record<string, unknown>): string {
  const content = isRecord(candidate.content) ? candidate.content : {}
  const parts = Array.isArray(content.parts) ? content.parts : []
  return parts.map(part => isRecord(part) ? stringValue(part.text) : '').join('')
}

function responsesOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string') return data.output_text
  const output = Array.isArray(data.output) ? data.output : []
  return output.flatMap(item => {
    if (!isRecord(item) || !Array.isArray(item.content)) return []
    return item.content.map(part => isRecord(part) ? stringValue(part.text) : '')
  }).join('')
}

function defaultModelForSource(source: StChatCompletionsPayload['chat_completion_source']): string {
  if (source === 'claude') return 'claude-3-5-sonnet-latest'
  if (source === 'makersuite') return 'gemini-2.0-flash'
  if (source === 'openrouter') return 'openai/gpt-4o-mini'
  if (source === 'mistralai') return 'mistral-small-latest'
  if (source === 'groq') return 'llama-3.1-8b-instant'
  if (source === 'deepseek') return 'deepseek-chat'
  if (source === 'xai') return 'grok-3-mini'
  return 'gpt-4o-mini'
}

function normalizeStSource(source: StChatCompletionsPayload['chat_completion_source']): StChatCompletionsPayload['chat_completion_source'] {
  if (source === 'google') return 'makersuite'
  return source
}

function assertSupportedStSource(source: StChatCompletionsPayload['chat_completion_source']): void {
  if (source === 'vertexai') {
    throw createError(ErrorCode.VALIDATION_ERROR, 'ST Vertex AI compatibility is not implemented yet; use Makersuite/Gemini or an OpenAI-compatible proxy for now.', { source })
  }
}

function sourceFromStSource(source: StChatCompletionsPayload['chat_completion_source']): LLMConfig['source'] {
  switch (source) {
    case 'openrouter':
      return 'openrouter'
    case 'ai21':
      return 'ai21'
    case 'cohere':
      return 'cohere'
    case 'perplexity':
      return 'perplexity'
    case 'groq':
      return 'groq'
    case 'chutes':
      return 'chutes'
    case 'electronhub':
      return 'electronhub'
    case 'nanogpt':
      return 'nanogpt'
    case 'deepseek':
      return 'deepseek'
    case 'aimlapi':
      return 'aimlapi'
    case 'xai':
      return 'xai'
    case 'pollinations':
      return 'pollinations'
    case 'moonshot':
      return 'moonshot'
    case 'fireworks':
      return 'fireworks'
    case 'cometapi':
      return 'cometapi'
    case 'zai':
      return 'zai'
    case 'siliconflow':
      return 'siliconflow'
    case 'mistralai':
      return 'mistral'
    default:
      return 'custom_openai_chat'
  }
}

function defaultBaseUrlForSource(source: StChatCompletionsPayload['chat_completion_source']): string {
  switch (source) {
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    case 'ai21':
      return 'https://api.ai21.com/studio/v1'
    case 'cohere':
      return 'https://api.cohere.ai/v1'
    case 'perplexity':
      return 'https://api.perplexity.ai'
    case 'groq':
      return 'https://api.groq.com/openai/v1'
    case 'chutes':
      return 'https://llm.chutes.ai/v1'
    case 'electronhub':
      return 'https://api.electronhub.ai/v1'
    case 'nanogpt':
      return 'https://nano-gpt.com/api/v1'
    case 'deepseek':
      return 'https://api.deepseek.com/beta'
    case 'aimlapi':
      return 'https://api.aimlapi.com/v1'
    case 'xai':
      return 'https://api.x.ai/v1'
    case 'pollinations':
      return 'https://gen.pollinations.ai/v1'
    case 'moonshot':
      return 'https://api.moonshot.cn/v1'
    case 'fireworks':
      return 'https://api.fireworks.ai/inference/v1'
    case 'cometapi':
      return 'https://api.cometapi.com/v1'
    case 'zai':
      return 'https://api.z.ai/api/paas/v4'
    case 'siliconflow':
      return 'https://api.siliconflow.cn/v1'
    case 'mistralai':
      return 'https://api.mistral.ai/v1'
    default:
      return 'https://api.openai.com/v1'
  }
}

function geminiBaseUrlFromStPayload(reverseProxy: string): string {
  if (!reverseProxy) return 'https://generativelanguage.googleapis.com/v1beta'
  const trimmed = reverseProxy.replace(/\/+$/, '')
  return /\/v\d[\w.-]*$/i.test(trimmed) ? trimmed : `${trimmed}/v1beta`
}

function customApiFormatFromPayload(payload: StChatCompletionsPayload): LLMConfig['customApiFormat'] | undefined {
  const value = stringValue(payload.customApiFormat)
  if (
    value === 'openai_chat'
    || value === 'openai_completion'
    || value === 'openai_responses'
    || value === 'azure_openai_chat'
    || value === 'anthropic_messages'
    || value === 'gemini_generate_content'
    || value === 'ollama_native_chat'
    || value === 'claude_messages'
    || value === 'gemini_interactions'
  ) {
    return value
  }
  return undefined
}

function customHeadersFromStPayload(payload: StChatCompletionsPayload): Record<string, string> | undefined {
  return parseHeaderLines(payload.custom_include_headers)
}

function customBodyFieldsFromStPayload(payload: StChatCompletionsPayload): Record<string, unknown> | undefined {
  return parseObjectLike(payload.custom_include_body)
}

function excludeBodyFieldsFromStPayload(payload: StChatCompletionsPayload): string[] | undefined {
  const raw = payload.custom_exclude_body
  if (Array.isArray(raw)) {
    const fields = raw.map(stringValue).filter(Boolean)
    return fields.length ? fields : undefined
  }
  const text = stringValue(raw)
  if (!text) return undefined
  const fields = text.split(/[\n,]+/).map(value => value.trim()).filter(Boolean)
  return fields.length ? fields : undefined
}

function parseHeaderLines(raw: unknown): Record<string, string> | undefined {
  if (isRecord(raw)) {
    const headers = Object.fromEntries(
      Object.entries(raw)
        .map(([key, value]) => [key.trim(), typeof value === 'string' ? value.trim() : String(value)] as const)
        .filter(([key, value]) => key && value),
    )
    return Object.keys(headers).length ? headers : undefined
  }

  const text = stringValue(raw)
  if (!text) return undefined
  const headers: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const separator = trimmed.indexOf(':')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    try {
      const parsed: unknown = JSON.parse(value)
      if (typeof parsed === 'string') value = parsed
    } catch {
      // Plain header text is accepted.
    }
    if (key && value) headers[key] = value
  }
  return Object.keys(headers).length ? headers : undefined
}

function parseObjectLike(raw: unknown): Record<string, unknown> | undefined {
  if (isRecord(raw)) return raw
  const text = stringValue(raw)
  if (!text) return undefined
  try {
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function stopSequencesFromStPayload(raw: unknown): string[] {
  if (typeof raw === 'string') return raw.trim() ? [raw] : []
  if (Array.isArray(raw)) return raw.map(stringValue).filter(Boolean)
  return []
}

function providerErrorMessage(data: Record<string, unknown>): string {
  const error = isRecord(data.error) ? data.error : null
  if (!error) return ''
  return stringValue(error.message) || stringValue(error.error) || stringValue(data.message) || 'LLM API request failed'
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export { stBackendsRoute }
