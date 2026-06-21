import type { Engine, EngineRequest, EngineResponse } from './types.js'
import type { APIFormat } from '../config/api-providers.js'
import type { LLMConfig } from '../lib/llm-config.js'
import type { GenerationPreset } from '../services/preset.service.js'
import {
  apiFormatFromConfig,
  azureChatCompletionsUrl,
  baseUrlFromConfig,
  geminiModelId,
  headersFromConfig,
  joinUrl,
  modelListUrlFromConfig,
  ollamaNativeChatUrl,
  providerFromConfig,
} from '../lib/llm-provider.js'
import {
  anthropicBody,
  azureChatBody,
  completionBody,
  geminiBody,
  ollamaNativeBody,
  openAICompatibleBody,
  openAIResponsesBody,
} from './native-bodies.js'
import { buildCompletionPrompt, buildOpenAIMessages, type ChatMessage } from './native-prompt.js'
import { consumeNDJSON, consumeSSE } from './native-stream.js'
import { createError, ErrorCode, AppError } from '../lib/errors.js'
import type { MacroEnv } from '../lib/macros.js'

interface NativeRequestContext {
  config: LLMConfig
  preset: GenerationPreset
  baseUrl: string
  headers: Record<string, string>
  apiFormat: APIFormat
  chatMessages: ChatMessage
  prompt: string
  signal?: AbortSignal
}

interface NativePromptInput {
  chatMessages: ChatMessage
  prompt: string
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string }
    text?: string
  }>
}

interface AnthropicStreamChunk {
  type?: string
  delta?: { text?: string }
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> }
  finishReason?: string
}

interface GeminiStreamChunk {
  candidates?: GeminiCandidate[]
}

interface OllamaStreamChunk {
  message?: { content?: string }
}

interface OpenAIResponsesStreamChunk {
  type?: string
  delta?: string
}

interface OpenAIResponseOutputItem {
  type?: string
  content?: Array<{
    type?: string
    text?: string
  }>
}

const DEBUG_LLM = process.env.DEBUG_LLM === 'true'

function debugLlm(message: string, details?: Record<string, unknown>): void {
  if (!DEBUG_LLM) return
  console.info('[LLM]', message, details ?? {})
}

function errorLlm(message: string, details?: Record<string, unknown>): void {
  console.error('[LLM]', message, details ?? {})
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asOpenAIStreamChunk(value: unknown): OpenAIStreamChunk {
  return isRecord(value) ? value as OpenAIStreamChunk : {}
}

function asAnthropicStreamChunk(value: unknown): AnthropicStreamChunk {
  return isRecord(value) ? value as AnthropicStreamChunk : {}
}

function asGeminiStreamChunk(value: unknown): GeminiStreamChunk {
  return isRecord(value) ? value as GeminiStreamChunk : {}
}

function asOllamaStreamChunk(value: unknown): OllamaStreamChunk {
  return isRecord(value) ? value as OllamaStreamChunk : {}
}

function asOpenAIResponsesStreamChunk(value: unknown): OpenAIResponsesStreamChunk {
  return isRecord(value) ? value as OpenAIResponsesStreamChunk : {}
}

function parseUsage(data: {
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
}): EngineResponse['usage'] {
  if (data.usage) {
    return {
      promptTokens: data.usage.prompt_tokens ?? 0,
      completionTokens: data.usage.completion_tokens ?? 0,
      totalTokens: data.usage.total_tokens ?? 0,
    }
  }
  if (data.usageMetadata) {
    return {
      promptTokens: data.usageMetadata.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
      totalTokens: data.usageMetadata.totalTokenCount ?? 0,
    }
  }
  return undefined
}

function parseResponsesUsage(data: {
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
}): EngineResponse['usage'] {
  if (!data.usage) return undefined
  return {
    promptTokens: data.usage.input_tokens ?? 0,
    completionTokens: data.usage.output_tokens ?? 0,
    totalTokens: data.usage.total_tokens ?? 0,
  }
}

function responseOutputText(data: { output_text?: string; output?: OpenAIResponseOutputItem[] }): string {
  if (typeof data.output_text === 'string') return data.output_text
  return data.output
    ?.flatMap(item => item.content ?? [])
    .filter(part => part.type === 'output_text' || typeof part.text === 'string')
    .map(part => part.text ?? '')
    .join('') ?? ''
}

function geminiTextFromCandidate(candidate: GeminiCandidate): string {
  return candidate.content?.parts?.map(part => part.text ?? '').join('') ?? ''
}

export class NativeEngine implements Engine {
  readonly name: string = 'native'

  async generate(request: EngineRequest): Promise<EngineResponse> {
    const context = this.buildRequestContext(request)

    switch (context.apiFormat) {
      case 'anthropic_messages':
        return this.generateAnthropic(context)
      case 'gemini_generate_content':
        return this.generateGemini(context)
      case 'azure_openai_chat':
        return this.generateAzureChatCompletion(context)
      case 'ollama_native_chat':
        return this.generateOllamaNative(context)
      case 'openai_completion':
        return this.generateCompletion(context)
      case 'openai_responses':
        return this.generateResponses(context)
      case 'openai_chat':
      default:
        return this.generateChatCompletion(context)
    }
  }

  async *generateStream(request: EngineRequest): AsyncGenerator<string, void, unknown> {
    const context = this.buildRequestContext(request)

    switch (context.apiFormat) {
      case 'anthropic_messages':
        yield* this.streamAnthropic(context)
        break
      case 'gemini_generate_content':
        yield* this.streamGemini(context)
        break
      case 'azure_openai_chat':
        yield* this.streamAzureChatCompletion(context)
        break
      case 'ollama_native_chat':
        yield* this.streamOllamaNative(context)
        break
      case 'openai_completion':
        yield* this.streamCompletion(context)
        break
      case 'openai_responses':
        yield* this.streamResponses(context)
        break
      case 'openai_chat':
      default:
        yield* this.streamChatCompletion(context)
    }
  }

  async testConnection(config: LLMConfig): Promise<boolean> {
    const provider = providerFromConfig(config)
    const url = modelListUrlFromConfig(config)
    const headers = headersFromConfig(config, provider)

    debugLlm('test request', { url })
    try {
      const response = await fetch(url, { headers })
      debugLlm('test response', { url, status: response.status })
      return response.ok
    } catch (e) {
      errorLlm('test failed', { url, error: String(e) })
      return false
    }
  }

  protected buildRequestContext(request: EngineRequest): NativeRequestContext {
    const { config, preset, character, userName, signal } = request
    const provider = providerFromConfig(config)
    const apiFormat = apiFormatFromConfig(config)
    const baseUrl = baseUrlFromConfig(config, provider)
    const headers = headersFromConfig(config, provider)
    const macroEnv: MacroEnv = { user: userName || '用户', char: character.name }
    const { chatMessages, prompt } = this.buildPromptInput(request, macroEnv)

    return {
      config,
      preset,
      baseUrl,
      headers,
      apiFormat,
      chatMessages,
      prompt,
      signal,
    }
  }

  protected buildPromptInput(request: EngineRequest, macroEnv: MacroEnv): NativePromptInput {
    return {
      chatMessages: buildOpenAIMessages(request.messages, request.character, macroEnv, request.worldEntries),
      prompt: buildCompletionPrompt(request.messages, request.character, macroEnv, request.worldEntries),
    }
  }

  private async generateChatCompletion(context: NativeRequestContext): Promise<EngineResponse> {
    const body = openAICompatibleBody(context.config, context.preset, context.chatMessages, false)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, '/chat/completions'), context.headers, body, context.signal)
    const data = await response.json() as {
      choices: Array<{ message?: { content?: string }; finish_reason?: string }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }

    return {
      content: data.choices[0]?.message?.content ?? '',
      finishReason: data.choices[0]?.finish_reason ?? 'stop',
      usage: parseUsage(data),
    }
  }

  private async generateAzureChatCompletion(context: NativeRequestContext): Promise<EngineResponse> {
    const body = azureChatBody(context.config, context.preset, context.chatMessages, false)
    const response = await this.fetchLLM(azureChatCompletionsUrl(context.baseUrl, context.config), context.headers, body, context.signal)
    const data = await response.json() as {
      choices: Array<{ message?: { content?: string }; finish_reason?: string }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }

    return {
      content: data.choices[0]?.message?.content ?? '',
      finishReason: data.choices[0]?.finish_reason ?? 'stop',
      usage: parseUsage(data),
    }
  }

  private async generateCompletion(context: NativeRequestContext): Promise<EngineResponse> {
    const body = completionBody(context.config, context.preset, context.prompt, false)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, '/completions'), context.headers, body, context.signal)
    const data = await response.json() as {
      choices: Array<{ text?: string; finish_reason?: string }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }

    return {
      content: data.choices[0]?.text ?? '',
      finishReason: data.choices[0]?.finish_reason ?? 'stop',
      usage: parseUsage(data),
    }
  }

  private async generateResponses(context: NativeRequestContext): Promise<EngineResponse> {
    const body = openAIResponsesBody(context.config, context.preset, context.chatMessages, false)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, '/responses'), context.headers, body, context.signal)
    const data = await response.json() as {
      output_text?: string
      output?: OpenAIResponseOutputItem[]
      status?: string
      incomplete_details?: { reason?: string }
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
    }

    return {
      content: responseOutputText(data),
      finishReason: data.incomplete_details?.reason ?? data.status ?? 'stop',
      usage: parseResponsesUsage(data),
    }
  }

  private async generateOllamaNative(context: NativeRequestContext): Promise<EngineResponse> {
    const body = ollamaNativeBody(context.config, context.preset, context.chatMessages, false)
    const response = await this.fetchLLM(ollamaNativeChatUrl(context.baseUrl), context.headers, body, context.signal)
    const data = await response.json() as {
      message?: { content?: string }
      done_reason?: string
      prompt_eval_count?: number
      eval_count?: number
    }

    return {
      content: data.message?.content ?? '',
      finishReason: data.done_reason ?? 'stop',
      usage: data.prompt_eval_count || data.eval_count ? {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      } : undefined,
    }
  }

  private async generateAnthropic(context: NativeRequestContext): Promise<EngineResponse> {
    const body = anthropicBody(context.config, context.preset, context.chatMessages, false)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, '/messages'), context.headers, body, context.signal)
    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>
      stop_reason?: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }

    const content = data.content?.map(block => block.text ?? '').join('') ?? ''
    return {
      content,
      finishReason: data.stop_reason ?? 'stop',
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens ?? 0,
        completionTokens: data.usage.output_tokens ?? 0,
        totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
      } : undefined,
    }
  }

  private async generateGemini(context: NativeRequestContext): Promise<EngineResponse> {
    const body = geminiBody(context.config, context.preset, context.chatMessages)
    const model = encodeURIComponent(geminiModelId(context.config.model))
    const response = await this.fetchLLM(joinUrl(context.baseUrl, `/models/${model}:generateContent`), context.headers, body, context.signal)
    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
    }
    const candidate = data.candidates?.[0]

    return {
      content: candidate ? geminiTextFromCandidate(candidate) : '',
      finishReason: candidate?.finishReason ?? 'stop',
      usage: parseUsage(data),
    }
  }

  private async *streamChatCompletion(context: NativeRequestContext): AsyncGenerator<string, void, unknown> {
    const body = openAICompatibleBody(context.config, context.preset, context.chatMessages, true)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, '/chat/completions'), context.headers, body, context.signal)
    yield* consumeSSE(response, (parsed) => asOpenAIStreamChunk(parsed).choices?.[0]?.delta?.content)
  }

  private async *streamAzureChatCompletion(context: NativeRequestContext): AsyncGenerator<string, void, unknown> {
    const body = azureChatBody(context.config, context.preset, context.chatMessages, true)
    const response = await this.fetchLLM(azureChatCompletionsUrl(context.baseUrl, context.config), context.headers, body, context.signal)
    yield* consumeSSE(response, (parsed) => asOpenAIStreamChunk(parsed).choices?.[0]?.delta?.content)
  }

  private async *streamCompletion(context: NativeRequestContext): AsyncGenerator<string, void, unknown> {
    const body = completionBody(context.config, context.preset, context.prompt, true)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, '/completions'), context.headers, body, context.signal)
    yield* consumeSSE(response, (parsed) => asOpenAIStreamChunk(parsed).choices?.[0]?.text)
  }

  private async *streamResponses(context: NativeRequestContext): AsyncGenerator<string, void, unknown> {
    const body = openAIResponsesBody(context.config, context.preset, context.chatMessages, true)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, '/responses'), context.headers, body, context.signal)
    yield* consumeSSE(response, (parsed) => {
      const chunk = asOpenAIResponsesStreamChunk(parsed)
      return chunk.type === 'response.output_text.delta' ? chunk.delta : undefined
    })
  }

  private async *streamAnthropic(context: NativeRequestContext): AsyncGenerator<string, void, unknown> {
    const body = anthropicBody(context.config, context.preset, context.chatMessages, true)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, '/messages'), context.headers, body, context.signal)
    yield* consumeSSE(response, (parsed) => {
      const chunk = asAnthropicStreamChunk(parsed)
      if (chunk.type === 'content_block_delta') return chunk.delta?.text
      if (chunk.type === 'message_delta') return undefined
      return undefined
    })
  }

  private async *streamGemini(context: NativeRequestContext): AsyncGenerator<string, void, unknown> {
    const body = geminiBody(context.config, context.preset, context.chatMessages)
    const model = encodeURIComponent(geminiModelId(context.config.model))
    const response = await this.fetchLLM(joinUrl(context.baseUrl, `/models/${model}:streamGenerateContent?alt=sse`), context.headers, body, context.signal)
    yield* consumeSSE(response, (parsed) => {
      const candidate = asGeminiStreamChunk(parsed).candidates?.[0]
      return candidate ? geminiTextFromCandidate(candidate) : undefined
    })
  }

  private async *streamOllamaNative(context: NativeRequestContext): AsyncGenerator<string, void, unknown> {
    const body = ollamaNativeBody(context.config, context.preset, context.chatMessages, true)
    const response = await this.fetchLLM(ollamaNativeChatUrl(context.baseUrl), context.headers, body, context.signal)
    yield* consumeNDJSON(response, (parsed) => asOllamaStreamChunk(parsed).message?.content)
  }

  private async fetchLLM(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
    debugLlm('request', { url })
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      })
    } catch (error) {
      if (error instanceof AppError) throw error
      errorLlm('connection failed', { url, error: String(error) })
      throw createError(ErrorCode.LLM_CONNECTION_ERROR, 'LLM 服务连接失败', { originalError: String(error), apiUrl: url })
    }

    if (!response.ok) {
      const errorText = await response.text()
      errorLlm('api error', { url, status: response.status, errorText: errorText.slice(0, 500) })
      let detail = errorText
      try {
        const parsed = JSON.parse(errorText)
        detail = parsed?.error?.message ?? parsed?.message ?? errorText
      } catch { /* not JSON */ }
      throw createError(ErrorCode.LLM_API_ERROR, `LLM API 请求失败 (${response.status}): ${detail}`, { status: response.status, errorText, apiUrl: url })
    }

    return response
  }

}
