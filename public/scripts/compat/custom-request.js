import { getHost } from './host.js'
import EventSourceStream from './sse-stream.js'
import { getStreamingReply, tryParseStreamingError } from './openai.js'

function cleanPayload(payload = {}) {
  const data = { ...payload }
  Object.keys(data).forEach((key) => {
    if (data[key] === undefined) delete data[key]
  })
  return data
}

export class ChatCompletionService {
  static TYPE = 'openai'

  static createRequestData(payload = {}) {
    return cleanPayload(payload)
  }

  static async sendRequest(data = {}, extractData = true, signal = null) {
    const payload = cleanPayload(data)
    const response = await fetch('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: getRequestHeaders(),
      cache: 'no-cache',
      body: JSON.stringify(payload),
      signal: signal ?? new AbortController().signal,
    })

    if (payload.stream) {
      if (!response.ok) {
        const text = await response.text()
        tryParseStreamingError(response, text)
        throw new Error(`Got response status ${response.status}`)
      }
      return streamChatCompletionResponse(response, payload.chat_completion_source)
    }

    const json = await response.json()
    if (!response.ok || json?.error) {
      throw new Error(String(json?.error?.message || json?.error || 'Response not OK'))
    }
    if (!extractData) return json
    return {
      content: extractMessageFromData(json),
      reasoning: extractReasoningFromData(json),
      data: json,
    }
  }
}

export class TextCompletionService extends ChatCompletionService {
  static TYPE = 'textgenerationwebui'
}

export function extractMessageFromData(data) {
  return data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.content ?? ''
}

export function extractReasoningFromData(data) {
  return data?.choices?.[0]?.message?.reasoning
    ?? data?.choices?.[0]?.reasoning
    ?? data?.reasoning
    ?? ''
}

export function extractJsonFromData(data) {
  const text = extractMessageFromData(data)
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function getGenerateUrl() {
  return '/api/backends/chat-completions/generate'
}

export function getRequestHeaders() {
  return getHost().getRequestHeaders()
}

export function streamChatCompletionResponse(response, chatCompletionSource) {
  const eventStream = new EventSourceStream()
  response.body?.pipeThrough(eventStream)
  const reader = eventStream.readable.getReader()

  return async function* streamData() {
    let text = ''
    const swipes = []
    const state = { reasoning: '', images: [], signature: '', toolSignatures: {} }

    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      const rawData = value?.data
      if (rawData === '[DONE]') return
      tryParseStreamingError(response, rawData)
      const parsed = JSON.parse(rawData)
      const reply = getStreamingReply(parsed, state, { chatCompletionSource, overrideShowThoughts: true })

      const choice = Array.isArray(parsed?.choices) ? parsed.choices[0] : null
      if (choice?.index > 0) {
        const swipeIndex = choice.index - 1
        swipes[swipeIndex] = `${swipes[swipeIndex] ?? ''}${reply}`
      } else {
        text += reply
      }

      yield { text, swipes, state }
    }
  }
}

export default {
  ChatCompletionService,
  TextCompletionService,
  extractMessageFromData,
  extractReasoningFromData,
  extractJsonFromData,
  getGenerateUrl,
  getRequestHeaders,
  streamChatCompletionResponse,
}
