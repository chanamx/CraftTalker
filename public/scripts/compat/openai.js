export const chat_completion_sources = {
  OPENAI: 'openai',
  CLAUDE: 'claude',
  OPENROUTER: 'openrouter',
  AI21: 'ai21',
  MAKERSUITE: 'makersuite',
  GOOGLE: 'makersuite',
  VERTEXAI: 'vertexai',
  MISTRALAI: 'mistralai',
  COHERE: 'cohere',
  PERPLEXITY: 'perplexity',
  GROQ: 'groq',
  CHUTES: 'chutes',
  ELECTRONHUB: 'electronhub',
  NANOGPT: 'nanogpt',
  DEEPSEEK: 'deepseek',
  AIMLAPI: 'aimlapi',
  XAI: 'xai',
  POLLINATIONS: 'pollinations',
  MOONSHOT: 'moonshot',
  FIREWORKS: 'fireworks',
  COMETAPI: 'cometapi',
  AZURE_OPENAI: 'azure_openai',
  ZAI: 'zai',
  SILICONFLOW: 'siliconflow',
  CUSTOM: 'custom',
}

export const oai_settings = {
  chat_completion_source: chat_completion_sources.OPENAI,
  model: '',
  openai_model: '',
  temp_openai: 1,
  top_p_openai: 1,
  top_k_openai: 0,
  min_p_openai: 0,
  repetition_penalty_openai: 1,
  pres_pen_openai: 0,
  freq_pen_openai: 0,
  openai_max_tokens: 4000,
  stream_openai: false,
  n: 1,
  claude_use_sysprompt: false,
  use_sysprompt: false,
  reverse_proxy: '',
  proxy_password: '',
  custom_url: '',
  custom_include_body: '',
  custom_exclude_body: '',
  custom_include_headers: '',
  azure_base_url: '',
  azure_deployment_name: '',
  azure_api_version: '2024-10-21',
}
export const openai_settings = oai_settings
export const openai_setting_names = []

globalThis.oai_settings = oai_settings
globalThis.openai_settings = oai_settings

export const proxies = []

export const promptManager = {
  serviceSettings: oai_settings,
  getPromptCollection: () => [],
  preparePrompt: value => value,
}

export class Message {
  constructor(role = 'user', content = '', name = undefined) {
    this.role = role
    this.content = content
    if (name) this.name = name
  }
}

export class MessageCollection extends Array {
  add(message) {
    this.push(message)
    return message
  }
}

export class ChatCompletion {
  constructor(messages = []) {
    this.messages = messages
  }
}

export function setOpenAIMessageExamples() {}
export function setOpenAIMessages(messages = []) {
  return messages
}
export function prepareOpenAIMessages(messages = []) {
  return messages
}
export function isImageInliningSupported() {
  return false
}
export function setupChatCompletionPromptManager() {
  return promptManager
}
export function getChatCompletionModel() {
  return String(oai_settings.model || oai_settings.openai_model || '')
}
export function tryParseStreamingError(_response, text) {
  try {
    const parsed = JSON.parse(text)
    if (parsed?.error) throw new Error(String(parsed.error.message ?? parsed.error))
  } catch (error) {
    if (error instanceof SyntaxError) return
    throw error
  }
}

function createRequestPayload(type, messages, options = {}) {
  const payload = {
    type,
    chat_completion_source: oai_settings.chat_completion_source,
    model: getChatCompletionModel(),
    messages: Array.isArray(messages) ? messages : [],
    stream: Boolean(oai_settings.stream_openai && type !== 'quiet') || type === 'stream',
    temperature: oai_settings.temp_openai,
    top_p: oai_settings.top_p_openai,
    top_k: oai_settings.top_k_openai,
    min_p: oai_settings.min_p_openai,
    repetition_penalty: oai_settings.repetition_penalty_openai,
    presence_penalty: oai_settings.pres_pen_openai,
    frequency_penalty: oai_settings.freq_pen_openai,
    max_tokens: oai_settings.openai_max_tokens,
    n: Number(oai_settings.n) > 1 && !['quiet', 'impersonate', 'continue'].includes(type) ? Number(oai_settings.n) : undefined,
    use_sysprompt: Boolean(oai_settings.use_sysprompt || oai_settings.claude_use_sysprompt),
    reverse_proxy: oai_settings.reverse_proxy || oai_settings.custom_url || undefined,
    proxy_password: oai_settings.proxy_password || undefined,
    custom_url: oai_settings.custom_url || undefined,
    custom_include_body: oai_settings.custom_include_body || undefined,
    custom_exclude_body: oai_settings.custom_exclude_body || undefined,
    custom_include_headers: oai_settings.custom_include_headers || undefined,
    azure_base_url: oai_settings.azure_base_url || undefined,
    azure_deployment_name: oai_settings.azure_deployment_name || undefined,
    azure_api_version: oai_settings.azure_api_version || undefined,
    ...(options?.jsonSchema ? { json_schema: options.jsonSchema } : {}),
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === '') delete payload[key]
  })
  return payload
}

export async function sendOpenAIRequest(type = 'normal', messages = [], signal = null, options = {}) {
  const payload = createRequestPayload(type, messages, options)

  const response = await fetch('/api/backends/chat-completions/generate', {
    method: 'POST',
    headers: globalThis.CraftTalker?.stHost?.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' },
    cache: 'no-cache',
    body: JSON.stringify(payload),
    signal: signal ?? undefined,
  })

  if (payload.stream) {
    if (!response.ok) {
      const text = await response.text()
      tryParseStreamingError(response, text)
      throw new Error(`Got response status ${response.status}`)
    }
    const { streamChatCompletionResponse } = await import('./custom-request.js')
    return streamChatCompletionResponse(response, payload.chat_completion_source)
  }

  const json = await response.json()
  if (!response.ok || json?.error) {
    throw new Error(String(json?.error?.message || json?.error || 'Response not OK'))
  }
  return json
}
export function getStreamingReply(data, state = {}) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null
  const delta = choice?.delta ?? {}
  const text = delta.content ?? choice?.message?.content ?? choice?.text ?? data?.content ?? ''
  const reasoning = delta.reasoning ?? choice?.reasoning ?? data?.reasoning ?? ''
  if (reasoning && state && typeof state === 'object') {
    state.reasoning = `${state.reasoning ?? ''}${reasoning}`
  }
  return String(text ?? '')
}

export default {
  chat_completion_sources,
  oai_settings,
  promptManager,
  proxies,
  Message,
  MessageCollection,
  ChatCompletion,
  setOpenAIMessageExamples,
  setOpenAIMessages,
  prepareOpenAIMessages,
  isImageInliningSupported,
  setupChatCompletionPromptManager,
  sendOpenAIRequest,
  tryParseStreamingError,
  getStreamingReply,
  getChatCompletionModel,
}
