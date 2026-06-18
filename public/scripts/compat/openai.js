export const chat_completion_sources = {
  OPENAI: 'openai',
  CLAUDE: 'claude',
  MAKERSUITE: 'makersuite',
  COHERE: 'cohere',
  DEEPSEEK: 'deepseek',
  CUSTOM: 'custom',
}

export const oai_settings = {
  chat_completion_source: chat_completion_sources.OPENAI,
  temp_openai: 1,
  top_p_openai: 1,
  openai_max_tokens: 4000,
  claude_use_sysprompt: false,
}
export const openai_settings = oai_settings
export const openai_setting_names = []

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
export async function sendOpenAIRequest() {
  throw new Error('OpenAI request passthrough is not implemented in the CraftTalker ST compatibility runtime')
}
export async function getStreamingReply() {
  return ''
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
