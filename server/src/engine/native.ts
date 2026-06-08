import type { Engine, EngineRequest, EngineResponse } from './types.js'
import type { LLMConfig } from '../services/llm.service.js'
import type { CharacterCard } from '../lib/png-parser.js'
import type { MatchedEntry } from '../lib/world-match.js'
import {
  buildEndpointUrl,
  buildHeaders,
  getProviderConfig,
  type APIFormat,
} from '../config/api-providers.js'
import { createError, ErrorCode, AppError } from '../lib/errors.js'
import { resolveMacros, type MacroEnv } from '../lib/macros.js'

// Position constants matching ST's world_info_position enum.
const WI_POSITION = {
  BEFORE_CHAR: 0,
  AFTER_CHAR: 1,
  AN_TOP: 2,
  AN_BOTTOM: 3,
  AT_DEPTH: 4,
  EM_TOP: 5,
  EM_BOTTOM: 6,
} as const

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

function buildWorldContent(entries: MatchedEntry[], positions: number[], macroEnv: MacroEnv): string {
  const filtered = entries.filter(e => positions.includes(e.position))
  if (filtered.length === 0) return ''
  return filtered.map(e => resolveMacros(e.content, macroEnv)).join('\n')
}

function buildOpenAIMessages(
  messages: Array<{ role: string; content: string }>,
  character: CharacterCard,
  macroEnv: MacroEnv,
  worldEntries?: MatchedEntry[],
): Array<{ role: string; content: string }> {
  const result: Array<{ role: string; content: string }> = []
  const r = (text: string) => resolveMacros(text, macroEnv)

  let systemPrompt = ''
  if (character.system_prompt) {
    systemPrompt += r(character.system_prompt) + '\n\n'
  }

  if (worldEntries?.length) {
    const before = buildWorldContent(worldEntries, [WI_POSITION.BEFORE_CHAR, WI_POSITION.AN_TOP], macroEnv)
    if (before) systemPrompt += before + '\n\n'
  }

  systemPrompt += `你是${character.name}。${r(character.description)}\n`
  if (character.personality) {
    systemPrompt += `\n性格: ${r(character.personality)}`
  }
  if (character.scenario) {
    systemPrompt += `\n场景: ${r(character.scenario)}`
  }

  if (worldEntries?.length) {
    const after = buildWorldContent(worldEntries, [WI_POSITION.AFTER_CHAR, WI_POSITION.AN_BOTTOM], macroEnv)
    if (after) systemPrompt += `\n\n${after}`
  }

  if (character.mes_example) {
    let exampleBlock = ''
    const emTop = worldEntries?.length ? buildWorldContent(worldEntries, [WI_POSITION.EM_TOP], macroEnv) : ''
    if (emTop) exampleBlock += emTop + '\n'
    exampleBlock += r(character.mes_example)
    const emBottom = worldEntries?.length ? buildWorldContent(worldEntries, [WI_POSITION.EM_BOTTOM], macroEnv) : ''
    if (emBottom) exampleBlock += '\n' + emBottom
    systemPrompt += `\n\n对话风格参考:\n${exampleBlock}`
  }

  result.push({ role: 'system', content: systemPrompt })

  const atDepthEntries = worldEntries?.filter(e => e.position === WI_POSITION.AT_DEPTH) ?? []

  for (const msg of messages) {
    result.push(msg)
  }

  for (const entry of atDepthEntries) {
    const content = resolveMacros(entry.content, macroEnv)
    const insertIdx = Math.max(1, result.length - entry.depth)
    result.splice(insertIdx, 0, { role: 'system', content })
  }
  return result
}

function buildCompletionPrompt(
  messages: Array<{ role: string; content: string }>,
  character: CharacterCard,
  macroEnv: MacroEnv,
  worldEntries?: MatchedEntry[],
): string {
  const parts: string[] = []
  const r = (text: string) => resolveMacros(text, macroEnv)
  const mutableMessages = [...messages]

  if (character.system_prompt) parts.push(r(character.system_prompt))

  if (worldEntries?.length) {
    const before = buildWorldContent(worldEntries, [WI_POSITION.BEFORE_CHAR, WI_POSITION.AN_TOP], macroEnv)
    if (before) parts.push(before)
  }

  if (character.description) parts.push(`[角色描述]\n${r(character.description)}`)
  if (character.personality) parts.push(`[性格]\n${r(character.personality)}`)
  if (character.scenario) parts.push(`[场景]\n${r(character.scenario)}`)

  if (worldEntries?.length) {
    const after = buildWorldContent(worldEntries, [WI_POSITION.AFTER_CHAR, WI_POSITION.AN_BOTTOM], macroEnv)
    if (after) parts.push(after)
  }

  if (character.mes_example) {
    let exampleBlock = ''
    const emTop = worldEntries?.length ? buildWorldContent(worldEntries, [WI_POSITION.EM_TOP], macroEnv) : ''
    if (emTop) exampleBlock += emTop + '\n'
    exampleBlock += r(character.mes_example)
    const emBottom = worldEntries?.length ? buildWorldContent(worldEntries, [WI_POSITION.EM_BOTTOM], macroEnv) : ''
    if (emBottom) exampleBlock += '\n' + emBottom
    parts.push(`[对话示例]\n${exampleBlock}`)
  }

  if (worldEntries?.length) {
    const atDepthEntries = worldEntries.filter(e => e.position === WI_POSITION.AT_DEPTH)
    for (const entry of atDepthEntries) {
      const insertIdx = Math.max(0, mutableMessages.length - entry.depth)
      const content = resolveMacros(entry.content, macroEnv)
      mutableMessages.splice(insertIdx, 0, { role: 'system', content })
    }
  }

  for (const msg of mutableMessages) {
    if (msg.role === 'user') parts.push(`用户: ${msg.content}`)
    else if (msg.role === 'assistant') parts.push(`${character.name}: ${msg.content}`)
    else if (msg.role === 'system') parts.push(msg.content)
  }

  parts.push(`${character.name}:`)
  return parts.join('\n\n')
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function joinUrl(baseUrl: string, path: string): string {
  return `${trimTrailingSlashes(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`
}

function canonicalApiFormat(format: string | undefined): APIFormat | undefined {
  switch (format) {
    case 'claude_messages':
      return 'anthropic_messages'
    case 'gemini_interactions':
      return 'gemini_generate_content'
    case 'openai_chat':
    case 'openai_completion':
    case 'openai_responses':
    case 'anthropic_messages':
    case 'gemini_generate_content':
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

function providerFromConfig(config: LLMConfig): string {
  if (config.source) {
    if (config.source === 'google') return 'gemini'
    if (config.source === 'custom_claude') return 'anthropic'
    if (config.source === 'custom_gemini') return 'gemini'
    if (config.source === 'custom_openai_responses') return 'openai'
    return config.source
  }
  return legacyProviderFromType(config.type)
}

function apiFormatFromConfig(config: LLMConfig): APIFormat {
  const customFormat = canonicalApiFormat(config.customApiFormat)
  if (customFormat) return customFormat

  if (config.source === 'custom_claude') return 'anthropic_messages'
  if (config.source === 'custom_gemini') return 'gemini_generate_content'
  if (config.source === 'custom_openai_responses') return 'openai_responses'
  if (config.type !== 'openai' && config.type !== 'custom') return 'openai_completion'

  const provider = providerFromConfig(config)
  return getProviderConfig(provider)?.apiFormat ?? (OPENAI_COMPAT_SOURCES.has(provider) ? 'openai_chat' : 'openai_chat')
}

function baseUrlFromConfig(config: LLMConfig, provider: string): string {
  if (config.useReverseProxy && config.reverseProxyUrl) return trimTrailingSlashes(config.reverseProxyUrl)
  if (config.source?.startsWith('custom_')) return trimTrailingSlashes(config.apiUrl)

  const providerConfig = getProviderConfig(provider)
  if (!providerConfig) return trimTrailingSlashes(config.apiUrl)

  return trimTrailingSlashes(buildEndpointUrl(
    provider,
    config.apiUrl,
    config.reverseProxyName,
  ))
}

function headersFromConfig(config: LLMConfig, provider: string): Record<string, string> {
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

function openAICompatibleBody(
  config: LLMConfig,
  preset: any,
  messages: Array<{ role: string; content: string }>,
  stream: boolean,
): Record<string, unknown> {
  return applyBodyCustomizations(config, {
    model: config.model,
    messages,
    temperature: preset.temperature,
    top_p: preset.top_p,
    max_tokens: preset.max_tokens,
    frequency_penalty: preset.frequency_penalty,
    presence_penalty: preset.presence_penalty,
    stream,
  })
}

function completionBody(
  config: LLMConfig,
  preset: any,
  prompt: string,
  stream: boolean,
): Record<string, unknown> {
  return applyBodyCustomizations(config, {
    model: config.model,
    prompt,
    temperature: preset.temperature,
    top_p: preset.top_p,
    max_tokens: preset.max_tokens,
    repetition_penalty: preset.repetition_penalty,
    stream,
  })
}

function anthropicBody(
  config: LLMConfig,
  preset: any,
  messages: Array<{ role: string; content: string }>,
  stream: boolean,
): Record<string, unknown> {
  const system = messages
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n\n')
  const chatMessages = messages
    .filter(message => message.role !== 'system')
    .map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }))

  return applyBodyCustomizations(config, {
    model: config.model,
    ...(system ? { system } : {}),
    messages: chatMessages,
    temperature: preset.temperature,
    top_p: preset.top_p,
    max_tokens: preset.max_tokens,
    stream,
  })
}

function geminiBody(
  config: LLMConfig,
  preset: any,
  messages: Array<{ role: string; content: string }>,
): Record<string, unknown> {
  const systemInstruction = messages
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n\n')

  const contents = messages
    .filter(message => message.role !== 'system')
    .map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))

  return applyBodyCustomizations(config, {
    contents,
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    generationConfig: {
      temperature: preset.temperature,
      topP: preset.top_p,
      maxOutputTokens: preset.max_tokens,
    },
  })
}

function applyBodyCustomizations(config: LLMConfig, body: Record<string, unknown>): Record<string, unknown> {
  const next = {
    ...body,
    ...(config.customBodyFields ?? {}),
  }
  for (const field of config.excludeBodyFields ?? []) {
    delete next[field]
  }
  return next
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

function geminiTextFromCandidate(candidate: { content?: { parts?: Array<{ text?: string }> }; finishReason?: string }): string {
  return candidate.content?.parts?.map(part => part.text ?? '').join('') ?? ''
}

export class NativeEngine implements Engine {
  readonly name = 'native'

  async generate(request: EngineRequest): Promise<EngineResponse> {
    const context = this.buildRequestContext(request)

    switch (context.apiFormat) {
      case 'anthropic_messages':
        return this.generateAnthropic(context)
      case 'gemini_generate_content':
        return this.generateGemini(context)
      case 'openai_completion':
        return this.generateCompletion(context)
      case 'openai_responses':
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
      case 'openai_completion':
        yield* this.streamCompletion(context)
        break
      case 'openai_responses':
      case 'openai_chat':
      default:
        yield* this.streamChatCompletion(context)
    }
  }

  async testConnection(config: LLMConfig): Promise<boolean> {
    const provider = providerFromConfig(config)
    const baseUrl = baseUrlFromConfig(config, provider)
    const headers = headersFromConfig(config, provider)
    const url = joinUrl(baseUrl, '/models')

    console.log('[LLM] test ->', url)
    try {
      const response = await fetch(url, { headers })
      console.log('[LLM] test <-', response.status)
      return response.ok
    } catch (e) {
      console.error('[LLM] test failed:', String(e))
      return false
    }
  }

  private buildRequestContext(request: EngineRequest) {
    const { config, preset, character, messages, userName, worldEntries, signal } = request
    const provider = providerFromConfig(config)
    const apiFormat = apiFormatFromConfig(config)
    const baseUrl = baseUrlFromConfig(config, provider)
    const headers = headersFromConfig(config, provider)
    const macroEnv: MacroEnv = { user: userName || '用户', char: character.name }
    const chatMessages = buildOpenAIMessages(messages, character, macroEnv, worldEntries)
    const prompt = buildCompletionPrompt(messages, character, macroEnv, worldEntries)

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

  private async generateChatCompletion(context: ReturnType<NativeEngine['buildRequestContext']>): Promise<EngineResponse> {
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

  private async generateCompletion(context: ReturnType<NativeEngine['buildRequestContext']>): Promise<EngineResponse> {
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

  private async generateAnthropic(context: ReturnType<NativeEngine['buildRequestContext']>): Promise<EngineResponse> {
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

  private async generateGemini(context: ReturnType<NativeEngine['buildRequestContext']>): Promise<EngineResponse> {
    const body = geminiBody(context.config, context.preset, context.chatMessages)
    const model = encodeURIComponent(context.config.model)
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

  private async *streamChatCompletion(context: ReturnType<NativeEngine['buildRequestContext']>): AsyncGenerator<string, void, unknown> {
    const body = openAICompatibleBody(context.config, context.preset, context.chatMessages, true)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, '/chat/completions'), context.headers, body, context.signal)
    yield* this.consumeSSE(response, (parsed) => parsed.choices?.[0]?.delta?.content)
  }

  private async *streamCompletion(context: ReturnType<NativeEngine['buildRequestContext']>): AsyncGenerator<string, void, unknown> {
    const body = completionBody(context.config, context.preset, context.prompt, true)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, '/completions'), context.headers, body, context.signal)
    yield* this.consumeSSE(response, (parsed) => parsed.choices?.[0]?.text)
  }

  private async *streamAnthropic(context: ReturnType<NativeEngine['buildRequestContext']>): AsyncGenerator<string, void, unknown> {
    const body = anthropicBody(context.config, context.preset, context.chatMessages, true)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, '/messages'), context.headers, body, context.signal)
    yield* this.consumeSSE(response, (parsed) => {
      if (parsed.type === 'content_block_delta') return parsed.delta?.text
      if (parsed.type === 'message_delta') return undefined
      return undefined
    })
  }

  private async *streamGemini(context: ReturnType<NativeEngine['buildRequestContext']>): AsyncGenerator<string, void, unknown> {
    const body = geminiBody(context.config, context.preset, context.chatMessages)
    const model = encodeURIComponent(context.config.model)
    const response = await this.fetchLLM(joinUrl(context.baseUrl, `/models/${model}:streamGenerateContent?alt=sse`), context.headers, body, context.signal)
    yield* this.consumeSSE(response, (parsed) => {
      const candidate = parsed.candidates?.[0]
      return candidate ? geminiTextFromCandidate(candidate) : undefined
    })
  }

  private async fetchLLM(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
    console.log('[LLM] ->', url)
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
      console.error('[LLM] Connection failed:', url, String(error))
      throw createError(ErrorCode.LLM_CONNECTION_ERROR, 'LLM 服务连接失败', { originalError: String(error), apiUrl: url })
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[LLM] API error:', url, response.status, errorText.slice(0, 500))
      let detail = errorText
      try {
        const parsed = JSON.parse(errorText)
        detail = parsed?.error?.message ?? parsed?.message ?? errorText
      } catch { /* not JSON */ }
      throw createError(ErrorCode.LLM_API_ERROR, `LLM API 请求失败 (${response.status}): ${detail}`, { status: response.status, errorText, apiUrl: url })
    }

    return response
  }

  private async *consumeSSE(response: Response, extract: (data: any) => string | undefined): AsyncGenerator<string, void, unknown> {
    const reader = response.body?.getReader()
    if (!reader) throw createError(ErrorCode.LLM_CONNECTION_ERROR, 'LLM 响应无内容', {})

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') return

        try {
          const parsed = JSON.parse(data)
          const content = extract(parsed)
          if (content) yield content
        } catch {
          continue
        }
      }
    }
  }
}
