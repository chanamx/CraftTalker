import { getHost } from './host.js'
export { callPopup, callGenericPopup, POPUP_RESULT, POPUP_TYPE, Popup } from './popup.js'

const host = getHost()

export const CLIENT_VERSION = host.CLIENT_VERSION
export const ARGUMENT_TYPE = host.ARGUMENT_TYPE
export const SlashCommand = host.SlashCommand
export const SlashCommandArgument = host.SlashCommandArgument
export const SlashCommandNamedArgument = host.SlashCommandNamedArgument
export const SlashCommandEnumValue = host.SlashCommandEnumValue
export const SlashCommandClosure = host.SlashCommandClosure
export const SlashCommandParser = host.SlashCommandParser
export const chat = host.chat
export const characters = host.characters
export const chat_metadata = host.chat_metadata
export const event_types = host.event_types
export const eventSource = host.eventSource
export const extension_prompts = host.extension_prompts
export const extension_settings = host.extension_settings
export const getContext = host.getContext
export const getRequestHeaders = host.getRequestHeaders
export const registerSlashCommand = host.registerSlashCommand
export const saveSettings = host.saveSettings
export const saveSettingsDebounced = host.saveSettingsDebounced
export const setExtensionPrompt = host.setExtensionPrompt
export const getExtensionPromptByName = host.getExtensionPromptByName
export const extension_prompt_roles = {
  SYSTEM: 0,
  USER: 1,
  ASSISTANT: 2,
}

export let this_chid = -1
export let name1 = 'You'
export let name2 = ''
export let online_status = 'no_connection'
export let main_api = 'crafttalker'
export let max_context = 0
export let user_avatar = 'user.png'
export let system_avatar = 'system.png'
export let default_avatar = 'img/ai4.png'
export let default_user_avatar = 'img/user-default.png'
export let is_send_press = false
export const MAX_INJECTION_DEPTH = 1000
export const nai_settings = {
  model_novel: '',
}

function refreshContextExports() {
  const context = host.getContext()
  this_chid = Number(context.this_chid ?? context.characterId ?? -1)
  name1 = String(context.name1 ?? 'You')
  name2 = String(context.name2 ?? '')
  online_status = String(context.onlineStatus ?? 'no_connection')
  max_context = Number(context.maxContext ?? 0)
}

refreshContextExports()
host.eventSource.on(host.event_types.CHAT_CHANGED, refreshContextExports)
host.eventSource.on(host.event_types.APP_READY, refreshContextExports)

export function substituteParams(value) {
  return host.replaceVariableMacros(value)
}

export function substituteParamsExtended(value) {
  return host.replaceVariableMacros(value)
}

export function messageFormatting(value) {
  return String(value ?? '')
}

export function reloadMarkdownProcessor() {}

export function getCurrentChatId() {
  return host.getContext().getCurrentChatId?.() ?? host.getContext().chatId ?? null
}

export function reloadCurrentChat() {}
export function saveChatConditional() {
  return Promise.resolve()
}
export function saveMetadata() {
  return host.saveMetadata()
}
export function saveMetadataDebounced() {
  return host.saveMetadataDebounced()
}
export function sendSystemMessage() {}
export function stopGeneration() {
  host.eventSource.emit(host.event_types.GENERATION_STOPPED)
}
export function activateSendButtons() {}
export function deactivateSendButtons() {}
export function updateChatMetadata() {}
export function updateMessageBlock() {}
export function appendMediaToMessage() {}
export function addCopyToCodeBlocks() {}
export function printMessages() {}
export function clearChat() {}
export function deleteLastMessage() {}
export function deleteMessage() {}
export function addOneMessage(message) {
  if (message && typeof message === 'object') host.chat.push(message)
  return message
}
export function getPastCharacterChats() {
  return Promise.resolve([])
}
export function showSwipeButtons() {}
export function saveCharacterDebounced() {}
export function getOneCharacter(id) {
  return host.characters[Number(id)] ?? null
}
export function selectCharacterById() {
  return Promise.resolve(false)
}
export function printCharacters() {}
export function unshallowCharacter(character) {
  return Promise.resolve(character)
}
export function deleteCharacter() {
  return Promise.resolve(false)
}
export function getCharacters() {
  return Promise.resolve(host.characters)
}
export function scrollChatToBottom() {}
export function setGenerationProgress() {}
export function baseChatReplace(value) {
  return value
}
export function getCharacterCardFields(character = {}) {
  return character
}
export function getBiasStrings() {
  return []
}
export function getExtensionPromptRoleByName(name) {
  return extension_prompt_roles[name] ?? extension_prompt_roles.SYSTEM
}
export function getMaxContextSize() {
  return Number(host.getContext().maxContext ?? 0)
}
export function cleanUpMessage(value) {
  return String(value ?? '')
}
export function isOdd(value) {
  return Number(value) % 2 !== 0
}
export function countOccurrences(value, search) {
  if (!search) return 0
  return String(value ?? '').split(String(search)).length - 1
}
export function setUserName(value) {
  name1 = String(value ?? 'You')
}
export function Generate() {
  return Promise.resolve()
}
export function processCommands(command) {
  return host.executeSlashCommands(String(command ?? ''))
}
export function getThumbnailUrl(type, file) {
  return file ? String(file) : ''
}
export function getUserAvatar(file = user_avatar) {
  return getThumbnailUrl('avatar', file)
}
export function getRequestHeadersForCompat() {
  return host.getRequestHeaders()
}

export const animation_duration = 0
export const system_messages = {}
export const system_message_types = {}
export const extension_prompt_types = {
  IN_PROMPT: 0,
  IN_CHAT: 1,
  BEFORE_PROMPT: 2,
  AFTER_PROMPT: 3,
}

export default host
