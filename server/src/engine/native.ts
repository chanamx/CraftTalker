import type { Engine, EngineRequest, EngineResponse } from './types.js'
import type { LLMConfig } from '../services/llm.service.js'
import type { CharacterCard } from '../lib/png-parser.js'
import type { MatchedEntry } from '../lib/world-match.js'
import { createError, ErrorCode, AppError } from '../lib/errors.js'
import { resolveMacros, type MacroEnv } from '../lib/macros.js'

function buildWorldContent(entries: MatchedEntry[], position: 'before_char' | 'after_char', macroEnv: MacroEnv): string {
  const filtered = entries.filter(e => e.position === position)
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
    const before = buildWorldContent(worldEntries, 'before_char', macroEnv)
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
    const after = buildWorldContent(worldEntries, 'after_char', macroEnv)
    if (after) systemPrompt += `\n\n${after}`
  }

  if (character.mes_example) {
    systemPrompt += `\n\n对话风格参考:\n${r(character.mes_example)}`
  }

  result.push({ role: 'system', content: systemPrompt })
  for (const msg of messages) {
    result.push(msg)
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

  if (character.system_prompt) parts.push(r(character.system_prompt))

  if (worldEntries?.length) {
    const before = buildWorldContent(worldEntries, 'before_char', macroEnv)
    if (before) parts.push(before)
  }

  if (character.description) parts.push(`[角色描述]\n${r(character.description)}`)
  if (character.personality) parts.push(`[性格]\n${r(character.personality)}`)
  if (character.scenario) parts.push(`[场景]\n${r(character.scenario)}`)

  if (worldEntries?.length) {
    const after = buildWorldContent(worldEntries, 'after_char', macroEnv)
    if (after) parts.push(after)
  }

  if (character.mes_example) parts.push(`[对话示例]\n${r(character.mes_example)}`)

  for (const msg of messages) {
    if (msg.role === 'user') parts.push(`用户: ${msg.content}`)
    else if (msg.role === 'assistant') parts.push(`${character.name}: ${msg.content}`)
    else if (msg.role === 'system') parts.push(msg.content)
  }

  parts.push(`${character.name}:`)
  return parts.join('\n\n')
}

function normalizeApiUrl(url: string): string {
  return url.replace(/\/v1\/?$/, '')
}

export class NativeEngine implements Engine {
  readonly name = 'native'

  async generate(request: EngineRequest): Promise<EngineResponse> {
    const { config, preset, character, messages, userName, worldEntries } = request
    const baseUrl = normalizeApiUrl(config.apiUrl)
    const macroEnv: MacroEnv = { user: userName || '用户', char: character.name }

    if (config.type === 'openai' || config.type === 'custom') {
      return this.generateChatCompletion(baseUrl, config, preset, character, messages, macroEnv, worldEntries)
    }
    return this.generateCompletion(baseUrl, config, preset, character, messages, macroEnv, worldEntries)
  }

  async *generateStream(request: EngineRequest): AsyncGenerator<string, void, unknown> {
    const { config, preset, character, messages, signal, userName, worldEntries } = request
    const baseUrl = normalizeApiUrl(config.apiUrl)
    const macroEnv: MacroEnv = { user: userName || '用户', char: character.name }

    if (config.type === 'openai' || config.type === 'custom') {
      yield* this.streamChatCompletion(baseUrl, config, preset, character, messages, macroEnv, signal, worldEntries)
    } else {
      yield* this.streamCompletion(baseUrl, config, preset, character, messages, macroEnv, signal, worldEntries)
    }
  }

  async testConnection(config: LLMConfig): Promise<boolean> {
    const baseUrl = normalizeApiUrl(config.apiUrl)
    const url = `${baseUrl}/v1/models`
    console.log('[LLM] test →', url)
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      })
      console.log('[LLM] test ←', response.status)
      return response.ok
    } catch (e) {
      console.error('[LLM] test failed:', String(e))
      return false
    }
  }

  private async generateChatCompletion(
    baseUrl: string, config: LLMConfig, preset: any,
    character: CharacterCard, messages: Array<{ role: string; content: string }>,
    macroEnv: MacroEnv, worldEntries?: MatchedEntry[],
  ): Promise<EngineResponse> {
    const openaiMessages = buildOpenAIMessages(messages, character, macroEnv, worldEntries)
    const body = {
      model: config.model,
      messages: openaiMessages,
      temperature: preset.temperature,
      top_p: preset.top_p,
      max_tokens: preset.max_tokens,
      frequency_penalty: preset.frequency_penalty,
      presence_penalty: preset.presence_penalty,
      stream: false,
    }

    const response = await this.fetchLLM(`${baseUrl}/v1/chat/completions`, config.apiKey, body)
    const data = await response.json() as {
      choices: Array<{ message: { content: string }; finish_reason: string }>
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }

    return {
      content: data.choices[0]?.message?.content ?? '',
      finishReason: data.choices[0]?.finish_reason ?? 'stop',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    }
  }

  private async generateCompletion(
    baseUrl: string, config: LLMConfig, preset: any,
    character: CharacterCard, messages: Array<{ role: string; content: string }>,
    macroEnv: MacroEnv, worldEntries?: MatchedEntry[],
  ): Promise<EngineResponse> {
    const prompt = buildCompletionPrompt(messages, character, macroEnv, worldEntries)
    const body = {
      model: config.model,
      prompt,
      temperature: preset.temperature,
      top_p: preset.top_p,
      max_tokens: preset.max_tokens,
      repetition_penalty: preset.repetition_penalty,
      stream: false,
    }

    const response = await this.fetchLLM(`${baseUrl}/v1/completions`, config.apiKey, body)
    const data = await response.json() as {
      choices: Array<{ text: string; finish_reason: string }>
    }

    return {
      content: data.choices[0]?.text ?? '',
      finishReason: data.choices[0]?.finish_reason ?? 'stop',
    }
  }

  private async *streamChatCompletion(
    baseUrl: string, config: LLMConfig, preset: any,
    character: CharacterCard, messages: Array<{ role: string; content: string }>,
    macroEnv: MacroEnv,
    signal?: AbortSignal, worldEntries?: MatchedEntry[],
  ): AsyncGenerator<string, void, unknown> {
    const openaiMessages = buildOpenAIMessages(messages, character, macroEnv, worldEntries)
    const body = {
      model: config.model,
      messages: openaiMessages,
      temperature: preset.temperature,
      top_p: preset.top_p,
      max_tokens: preset.max_tokens,
      frequency_penalty: preset.frequency_penalty,
      presence_penalty: preset.presence_penalty,
      stream: true,
    }

    const response = await this.fetchLLM(`${baseUrl}/v1/chat/completions`, config.apiKey, body, signal)
    yield* this.consumeSSE(response, (parsed) => parsed.choices?.[0]?.delta?.content)
  }

  private async *streamCompletion(
    baseUrl: string, config: LLMConfig, preset: any,
    character: CharacterCard, messages: Array<{ role: string; content: string }>,
    macroEnv: MacroEnv,
    signal?: AbortSignal, worldEntries?: MatchedEntry[],
  ): AsyncGenerator<string, void, unknown> {
    const prompt = buildCompletionPrompt(messages, character, macroEnv, worldEntries)
    const body = {
      model: config.model,
      prompt,
      temperature: preset.temperature,
      top_p: preset.top_p,
      max_tokens: preset.max_tokens,
      repetition_penalty: preset.repetition_penalty,
      stream: true,
    }

    const response = await this.fetchLLM(`${baseUrl}/v1/completions`, config.apiKey, body, signal)
    yield* this.consumeSSE(response, (parsed) => parsed.choices?.[0]?.text)
  }

  private async fetchLLM(url: string, apiKey: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    console.log('[LLM] →', url, JSON.stringify(body))
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
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
      console.error('[LLM] API error:', url, response.status, errorText)
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
