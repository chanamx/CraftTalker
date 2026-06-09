import type { LLMConfig } from '../lib/llm-config.js'
import type { GenerationPreset } from '../services/preset.service.js'

type Message = Array<{ role: string; content: string }>

export function openAICompatibleBody(
  config: LLMConfig,
  preset: GenerationPreset,
  messages: Message,
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

export function azureChatBody(
  config: LLMConfig,
  preset: GenerationPreset,
  messages: Message,
  stream: boolean,
): Record<string, unknown> {
  return applyBodyCustomizations(config, {
    messages,
    temperature: preset.temperature,
    top_p: preset.top_p,
    max_tokens: preset.max_tokens,
    frequency_penalty: preset.frequency_penalty,
    presence_penalty: preset.presence_penalty,
    stream,
  })
}

export function completionBody(
  config: LLMConfig,
  preset: GenerationPreset,
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

export function ollamaNativeBody(
  config: LLMConfig,
  preset: GenerationPreset,
  messages: Message,
  stream: boolean,
): Record<string, unknown> {
  return applyBodyCustomizations(config, compactObject({
    model: config.model,
    messages,
    stream,
    options: compactObject({
      temperature: preset.temperature,
      top_p: preset.top_p,
      num_predict: preset.max_tokens,
      repeat_penalty: preset.repetition_penalty,
    }),
  }))
}

export function anthropicBody(
  config: LLMConfig,
  preset: GenerationPreset,
  messages: Message,
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

export function geminiBody(
  config: LLMConfig,
  preset: GenerationPreset,
  messages: Message,
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

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
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
