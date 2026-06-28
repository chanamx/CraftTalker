import { getGroupNames } from './group-chats.js'
import { getCustomStoppingStrings } from './power-user.js'

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

export const openai_max_stop_strings = 4

export const oai_settings = {
  chat_completion_source: chat_completion_sources.OPENAI,
  model: '',
  openai_model: '',
  preset_settings_openai: 'CraftTalker Default',
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
  prompts: [],
  prompt_order: [],
  openai_max_context: 0,
  max_context_unlocked: false,
  send_if_empty: '',
  inline_image_quality: 'low',
  azure_base_url: '',
  azure_deployment_name: '',
  azure_api_version: '2024-10-21',
}
export const openai_settings = []
export const openai_setting_names = {}

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

export function setOpenAIMessageExamples(messages = []) {
  return Array.isArray(messages) ? messages : []
}
export function setOpenAIMessages(messages = []) {
  return messages
}
export function prepareOpenAIMessages(messages = []) {
  return messages
}
export function parseExampleIntoIndividual(messageExampleString, appendNamesForGroup = true) {
  const host = globalThis.CraftTalker?.stHost ?? globalThis.SillyTavern
  const context = typeof host?.getContext === 'function' ? host.getContext() : {}
  const userName = String(context?.name1 ?? 'You')
  const characterName = String(context?.name2 ?? '')
  const groupNames = Array.isArray(context?.groups)
    ? context.groups.map(group => String(group?.name ?? '')).filter(Boolean)
    : []
  const speakerNames = [characterName, ...groupNames].filter(Boolean)
  const messages = []
  let current = null

  for (const rawLine of String(messageExampleString ?? '').split(/\r?\n/).slice(1)) {
    const line = String(rawLine)
    const userPrefix = `${userName}:`
    const assistantName = speakerNames.find(name => line.startsWith(`${name}:`))
    if (line.startsWith(userPrefix)) {
      if (current) messages.push(current)
      current = { role: 'system', name: 'example_user', speaker: userName, lines: [line.slice(userPrefix.length).trimStart()] }
      continue
    }
    if (assistantName) {
      if (current) messages.push(current)
      current = { role: 'system', name: 'example_assistant', speaker: assistantName, lines: [line.slice(assistantName.length + 1).trimStart()] }
      continue
    }
    if (current) current.lines.push(line)
  }
  if (current) messages.push(current)

  return messages.map(message => {
    const content = message.lines.join('\n').trim()
    const shouldPrefix = appendNamesForGroup && context?.groupId != null && ['example_user', 'example_assistant'].includes(message.name)
    return {
      role: message.role,
      name: message.name,
      content: shouldPrefix ? `${message.speaker}: ${content}` : content,
    }
  }).filter(message => message.content)
}
export function isImageInliningSupported() {
  return false
}
export function setupChatCompletionPromptManager() {
  return promptManager
}
export function getChatCompletionModel(settings = oai_settings) {
  return String(settings?.model || settings?.openai_model || '')
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

function createRequestPayload(type, messages, options = {}, settings = oai_settings, model = getChatCompletionModel(settings)) {
  const stream = Boolean(settings.stream_openai && type !== 'quiet') || type === 'stream'
  const canMultiSwipe = Number(settings.n) > 1 && !['quiet', 'impersonate', 'continue'].includes(type)
  const context = getCompatContext()
  const stop = Array.isArray(options.stop)
    ? options.stop
    : getCustomStoppingStrings(openai_max_stop_strings)
  const payload = {
    type,
    chat_completion_source: settings.chat_completion_source,
    model,
    messages: Array.isArray(messages) ? messages : [],
    stream,
    temperature: settings.temp_openai,
    top_p: settings.top_p_openai,
    top_k: settings.top_k_openai,
    min_p: settings.min_p_openai,
    repetition_penalty: settings.repetition_penalty_openai,
    presence_penalty: settings.pres_pen_openai,
    frequency_penalty: settings.freq_pen_openai,
    max_tokens: settings.openai_max_tokens,
    n: canMultiSwipe ? Number(settings.n) : undefined,
    stop: stop.length ? stop : undefined,
    user_name: context.name1,
    char_name: context.name2,
    group_names: getGroupNames(),
    use_sysprompt: Boolean(settings.use_sysprompt || settings.claude_use_sysprompt),
    custom_prompt_post_processing: settings.custom_prompt_post_processing || undefined,
    reverse_proxy: settings.reverse_proxy || settings.custom_url || undefined,
    proxy_password: settings.proxy_password || undefined,
    custom_url: settings.custom_url || undefined,
    custom_include_body: settings.custom_include_body || undefined,
    custom_exclude_body: settings.custom_exclude_body || undefined,
    custom_include_headers: settings.custom_include_headers || undefined,
    azure_base_url: settings.azure_base_url || undefined,
    azure_deployment_name: settings.azure_deployment_name || undefined,
    azure_api_version: settings.azure_api_version || undefined,
    ...(options?.jsonSchema || options?.json_schema ? { json_schema: options.jsonSchema ?? options.json_schema } : {}),
    ...(Array.isArray(options?.tools) && options.tools.length ? { tools: options.tools, tool_choice: options.tool_choice ?? 'auto' } : {}),
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === '') delete payload[key]
  })
  return { payload, stream, canMultiSwipe }
}

function getCompatContext() {
  const host = globalThis.CraftTalker?.stHost ?? globalThis.SillyTavern
  try {
    const context = typeof host?.getContext === 'function' ? host.getContext() : {}
    return {
      name1: String(context?.name1 ?? 'You'),
      name2: String(context?.name2 ?? ''),
    }
  } catch {
    return { name1: 'You', name2: '' }
  }
}

export async function createGenerationParameters(settings = oai_settings, model = getChatCompletionModel(settings), type = 'normal', messages = [], options = {}) {
  if (!Array.isArray(messages)) {
    throw new Error('messages must be an array')
  }

  const filteredMessages = messages.filter(message => message && typeof message === 'object')
  const { payload, stream, canMultiSwipe } = createRequestPayload(type, filteredMessages, options, settings, model)
  return { generate_data: payload, stream, canMultiSwipe }
}

export async function sendOpenAIRequest(type = 'normal', messages = [], signal = null, options = {}) {
  const { payload } = createRequestPayload(type, messages, options)

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
  parseExampleIntoIndividual,
  isImageInliningSupported,
  setupChatCompletionPromptManager,
  sendOpenAIRequest,
  tryParseStreamingError,
  getStreamingReply,
  getChatCompletionModel,
  openai_max_stop_strings,
  createGenerationParameters,
}
