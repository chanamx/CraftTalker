import { getHost } from './host.js'
export { callPopup, callGenericPopup, POPUP_RESULT, POPUP_TYPE, Popup } from './popup.js'
import { user_avatar as persona_user_avatar } from './personas.js'
export { getUserAvatars, setUserAvatar, user_avatar } from './personas.js'
export {
  promptManager,
  setOpenAIMessageExamples,
  setOpenAIMessages,
  prepareOpenAIMessages,
  ChatCompletion,
  Message,
  MessageCollection,
  isImageInliningSupported,
  oai_settings,
  setupChatCompletionPromptManager,
  proxies,
  getChatCompletionModel,
  getStreamingReply,
  sendOpenAIRequest,
  tryParseStreamingError,
  openai_max_stop_strings,
  createGenerationParameters,
} from './openai.js'
export {
  parseRegexFromString,
  getWorldInfoPrompt,
  wi_anchor_position,
  world_info_include_names,
  saveWorldInfo,
  world_names,
  convertCharacterBook,
  createNewWorldInfo,
  deleteWorldInfo,
  getWorldInfoSettings,
  METADATA_KEY,
  selected_world_info,
  setWorldInfoButtonClass,
  world_info,
  loadWorldInfo,
  DEFAULT_DEPTH,
  DEFAULT_WEIGHT,
  newWorldInfoEntryTemplate,
  world_info_logic,
  world_info_position,
} from './world-info.js'
export {
  uuidv4,
  delay,
  Stopwatch,
  getBase64Async,
  isDataURL,
  ensureImageFormatSupported,
  getCharaFilename,
  getSanitizedFilename,
  getStringHash,
  getImageSizeFromDataURL,
  download,
  copyText,
  saveBase64AsFile,
  showFontAwesomePicker,
} from './utils.js'
export { v1CharData, RegexScriptData } from './char-data.js'
export { favsToHotswap, isMobile } from './RossAscends-mods.js'
export { isAdmin } from './user.js'
export { metadata_keys, NOTE_MODULE_NAME, shouldWIAddPrompt } from './authors-note.js'
export { getRegexedString, regex_placement } from './extensions/regex/engine.js'
export { persona_description_positions, power_user, flushEphemeralStoppingStrings, getCustomStoppingStrings } from './power-user.js'
export { getEventSourceStream } from './sse-stream.js'
export { executeSlashCommandsWithOptions } from './slash-commands.js'
export { getTokenCountAsync } from './tokenizers.js'
export { getPresetManager } from './preset-manager.js'
export { MacrosParser, getLastMessageId } from './macros.js'
export { commonEnumProviders, enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js'
export { enumTypes } from './slash-commands/SlashCommandEnumValue.js'

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
export const GenerateOptions = Object.freeze({})

export let this_chid = -1
export let name1 = 'You'
export let name2 = ''
export let online_status = 'no_connection'
export let main_api = 'crafttalker'
export let max_context = 0
export let system_avatar = 'system.png'
export let default_avatar = 'img/ai4.png'
export let default_user_avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
export let is_send_press = false
export const depth_prompt_depth_default = 4
export const depth_prompt_role_default = 'system'
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
  syncSendPressExport()
}

refreshContextExports()
for (const eventName of new Set([
  host.event_types.CHAT_CHANGED,
  host.event_types.CHAT_LOADED,
  host.event_types.APP_READY,
  host.event_types.PERSONA_CHANGED,
  host.event_types.CHARACTER_PAGE_LOADED,
  host.event_types.CHARACTER_EDITED,
].filter(Boolean))) {
  host.eventSource.on(eventName, refreshContextExports)
}
installGenerationStateHooks()
installContextRefreshHooks()

function readHostSendPressState() {
  const context = typeof host?.getContext === 'function' ? host.getContext() : {}
  if (typeof host?.isGenerating === 'function') return Boolean(host.isGenerating())
  const contextIsGenerating = context?.isGenerating
  if (typeof contextIsGenerating === 'function') return Boolean(contextIsGenerating())
  if (typeof context?.is_send_press === 'boolean') return context.is_send_press
  if (typeof host?.is_send_press === 'boolean') return host.is_send_press
  return is_send_press
}

function syncSendPressExport(value) {
  is_send_press = typeof value === 'boolean' ? value : readHostSendPressState()
}

function installGenerationStateHooks() {
  const startedEvents = [
    host.event_types?.GENERATION_STARTED,
    host.event_types?.JS_GENERATION_STARTED,
  ].filter(Boolean)
  const finishedEvents = [
    host.event_types?.GENERATION_ENDED,
    host.event_types?.JS_GENERATION_ENDED,
    host.event_types?.GENERATION_STOPPED,
  ].filter(Boolean)
  for (const eventName of new Set(startedEvents)) {
    host.eventSource?.on?.(eventName, () => syncSendPressExport(true))
  }
  for (const eventName of new Set(finishedEvents)) {
    host.eventSource?.on?.(eventName, () => syncSendPressExport(false))
  }
}

function installContextRefreshHooks() {
  const documentEvents = ['pointerdown', 'click', 'focusin']
  if (globalThis.document?.addEventListener) {
    for (const eventName of documentEvents) {
      document.addEventListener(eventName, refreshContextExports, true)
    }
  }
  globalThis.window?.addEventListener?.('focus', refreshContextExports)
}

export function substituteParams(value) {
  return host.replaceVariableMacros(value)
}

export function substituteParamsExtended(value) {
  return host.replaceVariableMacros(value)
}

export function parseMesExamples(examplesStr, isInstruct = false) {
  let text = String(examplesStr ?? '').trim()
  if (!text || text === '<START>') return []
  if (!/^<START>/i.test(text)) text = `<START>\n${text}`

  const context = host.getContext?.() ?? {}
  const separator = String(context.example_separator ?? context.power_user?.context?.example_separator ?? '').trim()
  const blockHeading = isInstruct ? '<START>\n' : (separator ? `${host.replaceVariableMacros?.(separator) ?? separator}\n` : '')
  return text
    .split(/<START>/gi)
    .slice(1)
    .map(block => `${blockHeading}${block.trim()}\n`)
    .filter(block => block.trim())
}

export function messageFormatting(...args) {
  return host.messageFormatting(...args)
}

export function reloadMarkdownProcessor() {
  return host.reloadMarkdownProcessor()
}

export function getCurrentChatId() {
  return host.getContext().getCurrentChatId?.() ?? host.getContext().chatId ?? null
}

export function setCharacterId(value) {
  if (typeof value === 'bigint' || typeof value === 'number') {
    this_chid = Number(value)
    return
  }
  if (typeof value === 'string') {
    const numeric = Number(value)
    this_chid = Number.isInteger(numeric) ? numeric : -1
    return
  }
  if (value && typeof value === 'object') {
    const index = characters.indexOf(value)
    this_chid = index >= 0 ? index : -1
    return
  }
  this_chid = -1
}

export function setCharacterName(value) {
  name2 = String(value ?? '')
}

export async function select_selected_character(chid = this_chid) {
  setCharacterId(chid)
  const character = characters[Number(this_chid)]
  setCharacterName(character?.name ?? '')
  if (character && typeof host.updateContext === 'function') {
    host.updateContext({ activeCharacter: character })
  }
  await host.eventSource?.emit?.(host.event_types.CHARACTER_PAGE_LOADED, {
    id: this_chid,
    character,
  })
  return Boolean(character)
}

function callHostOrContextFunction(name, ...args) {
  const direct = host?.[name]
  if (typeof direct === 'function') return direct(...args)
  const context = typeof host?.getContext === 'function' ? host.getContext() : null
  const fromContext = context?.[name]
  if (typeof fromContext === 'function') return fromContext(...args)
  return undefined
}

export function reloadCurrentChat(...args) {
  return callHostOrContextFunction('reloadCurrentChat', ...args)
}
export function saveChatConditional() {
  return host.saveChatConditional()
}
export function saveMetadata() {
  return host.saveMetadata()
}
export function saveMetadataDebounced() {
  return host.saveMetadataDebounced()
}
export function sendSystemMessage(...args) {
  return callHostOrContextFunction('sendSystemMessage', ...args)
}
export function stopGeneration() {
  host.eventSource.emit(host.event_types.GENERATION_STOPPED)
}
export function activateSendButtons(...args) {
  is_send_press = false
  return callHostOrContextFunction('activateSendButtons', ...args)
}
export function deactivateSendButtons(...args) {
  is_send_press = true
  return callHostOrContextFunction('deactivateSendButtons', ...args)
}
export function isGenerating() {
  return Boolean(is_send_press || readHostSendPressState())
}
export function updateChatMetadata(...args) {
  return callHostOrContextFunction('updateChatMetadata', ...args)
}
export function updateMessageBlock(...args) {
  return host.updateMessageBlock(...args)
}
export function appendMediaToMessage(...args) {
  return host.appendMediaToMessage(...args)
}
export function addCopyToCodeBlocks(...args) {
  return host.addCopyToCodeBlocks(...args)
}
export function printMessages(...args) {
  return host.printMessages(...args)
}
export function clearChat(...args) {
  return host.clearChat(...args)
}
export function deleteLastMessage() {}
export function deleteMessage() {}
export function addOneMessage(...args) {
  return host.addOneMessage(...args)
}
export async function getPastCharacterChats(index = this_chid) {
  const character = host.characters?.[Number(index)]
  const characterName = String(character?.file_name ?? character?.name ?? '')
  if (!characterName) return []

  try {
    const response = await fetch(`/api/chats/${encodeURIComponent(characterName)}`, {
      method: 'GET',
      headers: host.getRequestHeaders?.({ omitContentType: true }) ?? {},
    })
    if (!response.ok) return []

    const chats = await response.json()
    if (!Array.isArray(chats)) return []
    return chats.map(chatInfo => {
      const fileId = String(chatInfo?.file_id ?? '').trim()
      const fileName = fileId ? `${fileId}.jsonl` : String(chatInfo?.file_name ?? '')
      return {
        ...chatInfo,
        file_name: fileName,
        display_name: chatInfo?.file_name,
        ch_name: characterName,
        character_name: characterName,
        avatar_url: String(character?.avatar ?? ''),
      }
    })
  } catch {
    return []
  }
}
export function showSwipeButtons(...args) {
  return callHostOrContextFunction('showSwipeButtons', ...args)
}
export function saveCharacterDebounced(...args) {
  return callHostOrContextFunction('saveCharacterDebounced', ...args)
}
export function getOneCharacter(id) {
  if (typeof host.getOneCharacter === 'function') {
    return host.getOneCharacter(id)
  }
  return resolveCompatCharacter(id)
}
export function selectCharacterById() {
  return Promise.resolve(false)
}
export function printCharacters(...args) {
  return callHostOrContextFunction('printCharacters', ...args)
}
export function unshallowCharacter(character) {
  if (typeof host.unshallowCharacter === 'function') {
    return host.unshallowCharacter(character)
  }
  return Promise.resolve(resolveCompatCharacter(character) ?? character)
}
export function deleteCharacter() {
  return Promise.resolve(false)
}
export function getCharacters() {
  if (typeof host.getCharacters === 'function') {
    return host.getCharacters()
  }
  return Promise.resolve(host.characters)
}
export function scrollChatToBottom(...args) {
  return callHostOrContextFunction('scrollChatToBottom', ...args)
}
export function setGenerationProgress(...args) {
  return callHostOrContextFunction('setGenerationProgress', ...args)
}
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
  const normalized = host.setUserName?.(value)
  name1 = String(normalized ?? value ?? '') || 'You'
}
export function Generate() {
  return Promise.resolve()
}
export function processCommands(command) {
  return host.executeSlashCommands(String(command ?? ''))
}
function getUserAvatarUrl(file = persona_user_avatar) {
  const value = String(file ?? '').trim()
  return value ? `/User%20Avatars/${encodeURIComponent(value)}` : ''
}

export function getThumbnailUrl(type, file) {
  if (type === 'persona') return getUserAvatarUrl(file)
  if (type === 'avatar') {
    const value = getAvatarThumbnailFile(file)
    return value ? `/thumbnail?type=avatar&file=${encodeURIComponent(value)}` : ''
  }
  return file ? String(file) : ''
}

function getAvatarThumbnailFile(file) {
  const value = String(file ?? '').trim()
  if (!value) return ''

  const url = toUrl(value)
  if (url) {
    const queryFile = url.searchParams.get('file')
    if (queryFile) return queryFile

    const apiMatch = url.pathname.match(/^\/api\/characters\/([^/]+)\/avatar$/)
    if (apiMatch?.[1]) return `${safeDecode(apiMatch[1])}.png`

    const legacyMatch = url.pathname.match(/^\/characters\/([^/]+)$/)
    if (legacyMatch?.[1]) return safeDecode(legacyMatch[1])

    const pathBase = url.pathname.split('/').filter(Boolean).pop()
    if (pathBase) return safeDecode(pathBase)
  }

  return value.split(/[\\/]/).pop()?.split('?')[0]?.split('#')[0] ?? value
}

function toUrl(value) {
  try {
    return new URL(value, globalThis.location?.origin ?? 'http://localhost')
  } catch {
    return null
  }
}

function resolveCompatCharacter(id) {
  if (id === undefined || id === null || id === 'current') {
    const current = Number(host.getContext?.().this_chid ?? host.getContext?.().characterId ?? -1)
    return host.characters?.[current] ?? null
  }

  const numeric = Number(id)
  if (Number.isInteger(numeric) && numeric >= 0) {
    return host.characters?.[numeric] ?? null
  }

  const target = normalizeCharacterLookup(id)
  if (!target) return null
  return host.characters?.find(character => {
    const name = String(character?.name ?? '').toLowerCase()
    const fileName = String(character?.file_name ?? '').toLowerCase()
    const avatar = String(character?.avatar ?? '').toLowerCase()
    return target === name || target === fileName || target === avatar || target === `${fileName}.png`.toLowerCase()
  }) ?? null
}

function normalizeCharacterLookup(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const avatar = getAvatarThumbnailFile(text)
  return String(avatar || text).replace(/\.(?:png|jpe?g|webp|gif)$/i, '').toLowerCase()
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
export function getUserAvatar(file = persona_user_avatar) {
  return getUserAvatarUrl(file)
}
export function getRequestHeadersForCompat() {
  return host.getRequestHeaders()
}

export const animation_duration = 0
export const system_messages = {}
export const system_message_types = {}
export const extension_prompt_types = {
  NONE: -1,
  IN_PROMPT: 0,
  IN_CHAT: 1,
  BEFORE_PROMPT: 2,
  AFTER_PROMPT: 3,
}

export default host
