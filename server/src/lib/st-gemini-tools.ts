import { createError, ErrorCode } from './errors.js'

export interface StGeminiCompatMessage {
  role: string
  content: string
  name?: string
  tool_calls?: Array<Record<string, unknown>>
  tool_call_id?: string
  signature?: string
}

export interface StGeminiToolOptions {
  tools: Array<Record<string, unknown>>
  toolChoice: string | Record<string, unknown>
}

export function buildStGeminiContents(messages: StGeminiCompatMessage[]): Array<Record<string, unknown>> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = []
  const toolNames = new Map<string, string>()

  for (const message of messages) {
    if (message.role === 'system') continue
    const role = message.role === 'assistant' ? 'model' : 'user'
    const parts: Array<Record<string, unknown>> = []

    if (message.role === 'tool') {
      const name = message.name || toolNames.get(message.tool_call_id ?? '')
      if (!name) {
        throw createError(ErrorCode.VALIDATION_ERROR, 'ST Gemini tool messages require a resolvable function name.')
      }
      parts.push({
        functionResponse: {
          name,
          response: { name, content: message.content },
        },
      })
    } else {
      if (message.content) {
        parts.push({
          text: message.content,
          ...(message.signature ? { thoughtSignature: message.signature } : {}),
        })
      }
      for (const toolCall of message.tool_calls ?? []) {
        const fn = isPlainRecord(toolCall.function) ? toolCall.function : {}
        const id = stringValue(toolCall.id)
        const name = stringValue(fn.name)
        if (id && name) toolNames.set(id, name)
        const signature = toolCallSignature(toolCall)
        parts.push({
          functionCall: {
            name,
            args: geminiToolArguments(fn.arguments),
          },
          ...(signature ? { thoughtSignature: signature } : {}),
        })
      }
    }

    if (!parts.length) continue
    const previous = contents.at(-1)
    if (previous?.role === role) {
      previous.parts.push(...parts)
    } else {
      contents.push({ role, parts })
    }
  }

  return contents
}

export function applyStGeminiToolOptions(
  body: Record<string, unknown>,
  toolOptions: StGeminiToolOptions,
): Record<string, unknown> {
  const functionDeclarations = toolOptions.tools.map((tool) => {
    const fn = isPlainRecord(tool.function) ? tool.function : {}
    const parameters = isPlainRecord(fn.parameters) ? structuredClone(fn.parameters) : undefined
    if (parameters) delete parameters.$schema
    return {
      name: stringValue(fn.name),
      ...(stringValue(fn.description) ? { description: stringValue(fn.description) } : {}),
      ...(parameters && Object.keys(parameters).length ? { parameters } : {}),
    }
  })

  return {
    ...body,
    tools: [{ functionDeclarations }],
    toolConfig: { functionCallingConfig: geminiFunctionCallingConfig(toolOptions.toolChoice) },
  }
}

function geminiToolArguments(value: unknown): Record<string, unknown> {
  if (isPlainRecord(value)) return structuredClone(value)
  if (typeof value !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (isPlainRecord(parsed)) return parsed
  } catch {
    // Fall through to the compatibility error below.
  }
  throw createError(ErrorCode.VALIDATION_ERROR, 'ST Gemini tool-call arguments must contain a JSON object.')
}

function geminiFunctionCallingConfig(toolChoice: StGeminiToolOptions['toolChoice']): Record<string, unknown> {
  if (toolChoice === 'none') return { mode: 'NONE' }
  if (toolChoice === 'required') return { mode: 'ANY' }
  if (isPlainRecord(toolChoice) && isPlainRecord(toolChoice.function)) {
    return { mode: 'ANY', allowedFunctionNames: [stringValue(toolChoice.function.name)] }
  }
  return { mode: 'AUTO' }
}

function toolCallSignature(toolCall: Record<string, unknown>): string {
  if (typeof toolCall.thoughtSignature === 'string') return toolCall.thoughtSignature
  if (typeof toolCall.thought_signature === 'string') return toolCall.thought_signature
  return typeof toolCall.signature === 'string' ? toolCall.signature : ''
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
