import { getHost } from './host.js'

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
    if (data.stream) {
      return async function* emptyStream() {
        yield { text: '', swipes: [], state: {} }
      }
    }
    if (!extractData) return cleanPayload(data)
    return { content: '', reasoning: '', data: cleanPayload(data), signal }
  }
}

export class TextCompletionService extends ChatCompletionService {
  static TYPE = 'textgenerationwebui'
}

export function extractMessageFromData(data) {
  return data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.content ?? ''
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
  return '/api/engine/generate'
}

export function getRequestHeaders() {
  return getHost().getRequestHeaders()
}

export default {
  ChatCompletionService,
  TextCompletionService,
  extractMessageFromData,
  extractJsonFromData,
  getGenerateUrl,
  getRequestHeaders,
}
