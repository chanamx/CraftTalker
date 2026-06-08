import type { GenerationPreset } from './preset.service.js'
import type { CharacterCard } from '../lib/png-parser.js'
import { createError, ErrorCode, AppError } from '../lib/errors.js'

/**
 * Chat Completion API 源类型
 */
export type ChatCompletionSource =
  | 'openai' | 'anthropic' | 'google' | 'azure_openai' | 'vertexai'
  | 'openrouter' | 'groq' | 'fireworks' | 'togetherai' | 'perplexity'
  | 'deepseek' | 'moonshot' | 'siliconflow' | 'minimax' | 'zhipu'
  | 'mistral' | 'cohere' | 'ai21' | 'xai' | 'pollinations'
  | 'kobold' | 'textgen' | 'ollama' | 'llamacpp' | 'vllm'
  | 'custom_openai_chat' | 'custom_openai_responses' | 'custom_claude' | 'custom_gemini'

/**
 * 自定义 API 格式
 */
export type CustomAPIFormat =
  | 'openai_chat'        // OpenAI Chat Completions: /chat/completions
  | 'openai_completion'  // OpenAI-compatible legacy Completions: /completions
  | 'openai_responses'   // OpenAI Responses: /responses
  | 'anthropic_messages' // Claude Messages: /messages
  | 'gemini_generate_content' // Gemini generateContent: /models/{model}:generateContent
  | 'claude_messages'    // Legacy alias accepted for saved configs
  | 'gemini_interactions' // Legacy alias accepted for saved configs

export interface LLMConfig {
  // 新增字段
  source?: ChatCompletionSource
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

  // 核心字段（保持兼容）
  apiUrl: string
  apiKey: string
  model: string
  type: 'openai' | 'kobold' | 'textgen' | 'novel' | 'custom'
}

export interface GenerateRequest {
  messages: Array<{ role: string; content: string }>
  character: CharacterCard
  preset: GenerationPreset
  config: LLMConfig
  stream?: boolean
}

export interface GenerateResponse {
  content: string
  finishReason: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

function buildPrompt(
  messages: Array<{ role: string; content: string }>,
  character: CharacterCard,
): string {
  const parts: string[] = []

  if (character.system_prompt) {
    parts.push(character.system_prompt)
  }

  if (character.description) {
    parts.push(`[角色描述]\n${character.description}`)
  }

  if (character.personality) {
    parts.push(`[性格]\n${character.personality}`)
  }

  if (character.scenario) {
    parts.push(`[场景]\n${character.scenario}`)
  }

  if (character.mes_example) {
    parts.push(`[对话示例]\n${character.mes_example}`)
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      parts.push(`用户: ${msg.content}`)
    } else if (msg.role === 'assistant') {
      parts.push(`${character.name}: ${msg.content}`)
    } else if (msg.role === 'system') {
      parts.push(msg.content)
    }
  }

  parts.push(`${character.name}:`)

  return parts.join('\n\n')
}

function buildOpenAIMessages(
  messages: Array<{ role: string; content: string }>,
  character: CharacterCard,
): Array<{ role: string; content: string }> {
  const result: Array<{ role: string; content: string }> = []

  let systemPrompt = ''
  if (character.system_prompt) {
    systemPrompt += character.system_prompt + '\n\n'
  }
  systemPrompt += `你是${character.name}。${character.description}\n`
  if (character.personality) {
    systemPrompt += `\n性格: ${character.personality}`
  }
  if (character.scenario) {
    systemPrompt += `\n场景: ${character.scenario}`
  }
  if (character.mes_example) {
    systemPrompt += `\n\n对话风格参考:\n${character.mes_example}`
  }

  result.push({ role: 'system', content: systemPrompt })

  for (const msg of messages) {
    result.push(msg)
  }

  return result
}

function normalizeApiUrl(url: string): string {
  return url.replace(/\/v1\/?$/, '')
}

async function handleLlmFetchError(error: unknown, baseUrl: string): Promise<never> {
  if (error instanceof AppError) throw error
  throw createError(
    ErrorCode.LLM_CONNECTION_ERROR,
    'LLM 服务连接失败',
    { originalError: String(error), apiUrl: baseUrl }
  )
}

export async function generateText(request: GenerateRequest): Promise<GenerateResponse> {
  const { config, preset, character, messages } = request
  const baseUrl = normalizeApiUrl(config.apiUrl)

  if (config.type === 'openai' || config.type === 'custom') {
    const openaiMessages = buildOpenAIMessages(messages, character)

    const body: Record<string, unknown> = {
      model: config.model,
      messages: openaiMessages,
      temperature: preset.temperature,
      top_p: preset.top_p,
      max_tokens: preset.max_tokens,
      frequency_penalty: preset.frequency_penalty,
      presence_penalty: preset.presence_penalty,
      stream: false,
    }

    let response: Response
    try {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      })
    } catch (error) {
      await handleLlmFetchError(error, baseUrl)
    }

    if (!response!.ok) {
      const errorText = await response!.text()
      throw createError(
        ErrorCode.LLM_API_ERROR,
        'LLM API 请求失败',
        { status: response!.status, errorText, apiUrl: baseUrl }
      )
    }

    const data = await response!.json() as {
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

  const prompt = buildPrompt(messages, character)

  const body: Record<string, unknown> = {
    prompt,
    temperature: preset.temperature,
    top_p: preset.top_p,
    top_k: preset.top_k,
    max_tokens: preset.max_tokens,
    repetition_penalty: preset.repetition_penalty,
    stop: ['\n用户:', '\nUser:', ''],
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}/v1/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    await handleLlmFetchError(error, baseUrl)
  }

  if (!response!.ok) {
    const errorText = await response!.text()
    throw createError(
      ErrorCode.LLM_API_ERROR,
      'LLM API 请求失败',
      { status: response!.status, errorText, apiUrl: baseUrl }
    )
  }

  const data = await response!.json() as {
    choices: Array<{ text: string; finish_reason: string }>
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  }

  return {
    content: data.choices[0]?.text ?? '',
    finishReason: data.choices[0]?.finish_reason ?? 'stop',
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    } : undefined,
  }
}

export async function* generateTextStream(request: GenerateRequest): AsyncGenerator<string> {
  const { config, preset, character, messages } = request
  const baseUrl = normalizeApiUrl(config.apiUrl)

  if (config.type === 'openai' || config.type === 'custom') {
    const openaiMessages = buildOpenAIMessages(messages, character)

    const body: Record<string, unknown> = {
      model: config.model,
      messages: openaiMessages,
      temperature: preset.temperature,
      top_p: preset.top_p,
      max_tokens: preset.max_tokens,
      frequency_penalty: preset.frequency_penalty,
      presence_penalty: preset.presence_penalty,
      stream: true,
    }

    let response: Response
    try {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      })
    } catch (error) {
      if (error instanceof AppError) throw error
      throw createError(
        ErrorCode.LLM_CONNECTION_ERROR,
        'LLM 服务连接失败',
        { originalError: String(error), apiUrl: baseUrl }
      )
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw createError(
        ErrorCode.LLM_API_ERROR,
        'LLM API 请求失败',
        { status: response.status, errorText, apiUrl: baseUrl }
      )
    }

    const reader = response.body?.getReader()
    if (!reader) throw createError(ErrorCode.LLM_CONNECTION_ERROR, 'LLM 响应无内容', { apiUrl: baseUrl })

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
          const parsed = JSON.parse(data) as {
            choices: Array<{ delta: { content?: string }; finish_reason: string | null }>
          }
          const content = parsed.choices[0]?.delta?.content
          if (content) yield content
        } catch {
          console.error('SSE parse error (OpenAI):', data)
          continue
        }
      }
    }
    return
  }

  const prompt = buildPrompt(messages, character)

  const body: Record<string, unknown> = {
    prompt,
    temperature: preset.temperature,
    top_p: preset.top_p,
    top_k: preset.top_k,
    max_tokens: preset.max_tokens,
    repetition_penalty: preset.repetition_penalty,
    stop: ['\n用户:', '\nUser:', ''],
    stream: true,
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}/v1/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    throw createError(
      ErrorCode.LLM_CONNECTION_ERROR,
      'LLM 服务连接失败',
      { originalError: String(error), apiUrl: baseUrl }
    )
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw createError(
      ErrorCode.LLM_API_ERROR,
      'LLM API 请求失败',
      { status: response.status, errorText, apiUrl: baseUrl }
    )
  }

  const reader = response.body?.getReader()
  if (!reader) throw createError(ErrorCode.LLM_CONNECTION_ERROR, 'LLM 响应无内容', { apiUrl: baseUrl })

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
        const parsed = JSON.parse(data) as {
          choices: Array<{ text?: string; finish_reason: string | null }>
        }
        const content = parsed.choices[0]?.text
        if (content) yield content
      } catch {
        console.error('SSE parse error (Completions):', data)
        continue
      }
    }
  }
}
