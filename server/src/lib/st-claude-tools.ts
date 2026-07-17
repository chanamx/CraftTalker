import { createError, ErrorCode } from './errors.js'

export interface StClaudeCompatMessage {
  role: string
  content: string
  content_blocks?: Array<Record<string, unknown>>
  tool_calls?: Array<Record<string, unknown>>
  tool_call_id?: string
}

export interface StClaudeToolOptions {
  tools: Array<Record<string, unknown>>
  toolChoice: string | Record<string, unknown>
}

export function buildStClaudeMessages(messages: StClaudeCompatMessage[]): Array<Record<string, unknown>> {
  const converted: Array<{ role: 'user' | 'assistant'; content: Array<Record<string, unknown>> }> = []

  for (const message of messages) {
    if (message.role === 'system') continue
    const role = message.role === 'assistant' ? 'assistant' : 'user'
    let content: Array<Record<string, unknown>>

    if (message.role === 'tool') {
      if (!message.tool_call_id) {
        throw createError(ErrorCode.VALIDATION_ERROR, 'ST Claude tool messages require a tool_call_id.')
      }
      content = [{
        type: 'tool_result',
        tool_use_id: message.tool_call_id,
        content: message.content,
      }]
    } else {
      const nativeBlocks = claudeContentBlocks(message.content_blocks, role)
      const toolUseBlocks = claudeToolUseBlocks(message.tool_calls)
      if (role === 'assistant' && toolUseBlocks.length) {
        content = nativeBlocks.filter(block => block.type !== 'tool_use').concat(toolUseBlocks)
      } else {
        content = nativeBlocks
      }
      if (!content.length && message.content) {
        content = [{ type: 'text', text: message.content }]
      }
    }

    if (!content.length) content = [{ type: 'text', text: '\u200b' }]
    const previous = converted.at(-1)
    if (previous?.role === role) {
      previous.content.push(...content)
    } else {
      converted.push({ role, content })
    }
  }

  const normalized = converted.map((message) => {
    const onlyBlock = message.content.length === 1 ? message.content[0] : undefined
    if (onlyBlock?.type === 'text' && typeof onlyBlock.text === 'string') {
      return { role: message.role, content: onlyBlock.text }
    }
    return message
  })
  return normalized.length ? normalized : [{ role: 'user', content: '\u200b' }]
}

export function applyStClaudeToolOptions(
  body: Record<string, unknown>,
  toolOptions: StClaudeToolOptions,
): Record<string, unknown> {
  return {
    ...body,
    tools: toolOptions.tools.map((tool) => {
      const fn = isPlainRecord(tool.function) ? tool.function : {}
      const parameters = isPlainRecord(fn.parameters)
        ? structuredClone(fn.parameters)
        : { type: 'object', properties: {} }
      return {
        name: stringValue(fn.name),
        ...(stringValue(fn.description) ? { description: stringValue(fn.description) } : {}),
        input_schema: parameters,
      }
    }),
    tool_choice: claudeToolChoice(toolOptions.toolChoice),
  }
}

function claudeToolUseBlocks(toolCalls?: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return (toolCalls ?? []).map((toolCall) => {
    const fn = isPlainRecord(toolCall.function) ? toolCall.function : {}
    const id = stringValue(toolCall.id)
    const name = stringValue(fn.name)
    if (!id || !name) {
      throw createError(ErrorCode.VALIDATION_ERROR, 'ST Claude tool calls require an id and function name.')
    }
    return {
      type: 'tool_use',
      id,
      name,
      input: parseArguments(fn.arguments),
    }
  })
}

function claudeContentBlocks(
  blocks: Array<Record<string, unknown>> | undefined,
  role: 'user' | 'assistant',
): Array<Record<string, unknown>> {
  if (!blocks) return []
  return blocks.flatMap((block): Array<Record<string, unknown>> => {
    const type = stringValue(block.type)
    if (type === 'text') {
      return [{ type: 'text', text: typeof block.text === 'string' ? block.text : '' }]
    }
    if (role === 'assistant' && type === 'tool_use') {
      const id = stringValue(block.id)
      const name = stringValue(block.name)
      if (!id || !name) {
        throw createError(ErrorCode.VALIDATION_ERROR, 'ST Claude tool_use blocks require an id and name.')
      }
      if (block.input !== undefined && !isPlainRecord(block.input)) {
        throw createError(ErrorCode.VALIDATION_ERROR, 'ST Claude tool_use input must be an object.')
      }
      return [{
        type: 'tool_use',
        id,
        name,
        input: isPlainRecord(block.input) ? structuredClone(block.input) : {},
      }]
    }
    if (role === 'assistant' && type === 'thinking' && typeof block.thinking === 'string') {
      return [{
        type: 'thinking',
        thinking: block.thinking,
        ...(typeof block.signature === 'string' ? { signature: block.signature } : {}),
      }]
    }
    if (role === 'assistant' && type === 'redacted_thinking' && typeof block.data === 'string') {
      return [{ type: 'redacted_thinking', data: block.data }]
    }
    if (role === 'user' && type === 'tool_result') {
      const toolUseId = stringValue(block.tool_use_id)
      if (!toolUseId) {
        throw createError(ErrorCode.VALIDATION_ERROR, 'ST Claude tool_result blocks require a tool_use_id.')
      }
      return [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: typeof block.content === 'string' ? block.content : structuredClone(block.content),
        ...(typeof block.is_error === 'boolean' ? { is_error: block.is_error } : {}),
      }]
    }
    if (role === 'user' && type === 'image' && isPlainRecord(block.source)) {
      return [{ type: 'image', source: structuredClone(block.source) }]
    }
    return []
  })
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (isPlainRecord(value)) return structuredClone(value)
  if (typeof value !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (isPlainRecord(parsed)) return parsed
  } catch {
    // Fall through to the compatibility error below.
  }
  throw createError(ErrorCode.VALIDATION_ERROR, 'ST Claude tool-call arguments must contain a JSON object.')
}

function claudeToolChoice(toolChoice: StClaudeToolOptions['toolChoice']): Record<string, unknown> {
  if (toolChoice === 'none') return { type: 'none' }
  if (toolChoice === 'required') return { type: 'any' }
  if (isPlainRecord(toolChoice) && isPlainRecord(toolChoice.function)) {
    return { type: 'tool', name: stringValue(toolChoice.function.name) }
  }
  return { type: 'auto' }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
