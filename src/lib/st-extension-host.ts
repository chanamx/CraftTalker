import { api, type CharacterDetail, type CharacterIndex, type ChatLine, type ExtensionDiscovery, type ExtensionManifest, type ExtensionSettings, type StWorldInfoSettings, type WorldBook } from '@/lib/api'
import { ensureStCompatDomAnchors, syncStCompatDomState, syncStCompatWorldSelects } from '@/lib/st-compat-dom'
import type { Character, ChatMessage } from '@/types'
import * as Popper from '@popperjs/core'
import hljs from 'highlight.js/lib/common'
import jquery from 'jquery'
import lodash from 'lodash'
import DOMPurify, { type Config as DomPurifyConfig } from 'dompurify'
import showdown from 'showdown'
import toastr from 'toastr'

type Listener = (...args: unknown[]) => unknown | Promise<unknown>
type SlashCommandCallback = (namedArgs: Record<string, unknown>, unnamedArgs: string) => unknown | Promise<unknown>
type VariableScope = Record<string, unknown>
type VariableScopeName = 'global' | 'chat' | 'local' | 'character' | 'preset' | 'message' | 'script' | 'extension'
type VariableScopeFacade = VariableScope & {
  get: (path: unknown) => unknown
  set: (path: unknown, value: unknown) => unknown
  delete: (path: unknown) => void
  replace: (variables: Record<string, unknown>) => void
  assign: (variables: Record<string, unknown>) => void
  all: () => VariableScope
}
type SortableAction = 'destroy' | 'disable' | 'enable' | 'instance' | 'option' | 'refresh' | 'toArray'
type SortableOptions = Record<string, unknown>
type StWorldInfoRuntimeSettings = Pick<
  StWorldInfoSettings,
  | 'world_info_include_names'
  | 'world_info_case_sensitive'
  | 'world_info_match_whole_words'
  | 'world_info_use_group_scoring'
  | 'world_info_max_recursion_steps'
  | 'world_info_depth'
  | 'world_info_min_activations'
  | 'world_info_min_activations_depth_max'
  | 'world_info_budget'
  | 'world_info_budget_cap'
  | 'world_info_recursive'
  | 'world_info_overflow_alert'
  | 'world_info_character_strategy'
>
type MacroLikeContext = {
  message_id?: number | 'latest'
  role?: string
}
type MacroLikeReplacement = (context: MacroLikeContext, substring: string, ...args: string[]) => unknown
type StMarkdownProcessor = {
  makeHtml: (markdown: unknown) => string
}
type XbStreamingStatus = {
  isStreaming: boolean
  text: string
  error: string | null
}
type StGenerationRole = 'system' | 'assistant' | 'user'
type StGenerationMessage = {
  role: StGenerationRole
  content: string
}
type TavernHelperGenerationConfig = Record<string, unknown> & {
  custom_api?: Record<string, unknown>
  generation_id?: string
  injects?: unknown[]
  max_chat_history?: unknown
  ordered_prompts?: unknown[]
  overrides?: Record<string, unknown>
  should_stream?: boolean
  user_input?: string
}
type TavernHelperGenerationRequest = {
  generationId: string
  payload: Record<string, unknown>
  stream: boolean
}
type TavernHelperGenerationEntry = {
  controller: AbortController
}
type CompatChatMessage = ChatLine & {
  variables?: unknown
  variables_initialized?: unknown
  _lineIndex?: number
  _hadVariables?: boolean
  _hadVariablesInitialized?: boolean
}
type CompatCharacter = Character & Record<string, unknown>
export type CompatDiagnosticStatus = 'supported' | 'partial' | 'stub' | 'blocked'
export type CompatDiagnosticEntry = {
  id: string
  status: CompatDiagnosticStatus
  count: number
  lastCalledAt: string
  note: string
}
type JQueryStaticWithPlugins = typeof jquery & {
  fn?: JQueryStatic['fn'] & {
    sortable?: unknown
  }
}

interface StHostContextState {
  activeCharacter: Character | null
  activeChatId: string | null
  characters: Character[]
  messages: ChatMessage[]
  chatLines: ChatLine[]
}

interface ExtensionPrompt {
  value: string
  position?: unknown
  depth?: unknown
  scan?: unknown
  role?: unknown
}

interface StHostApi {
  CLIENT_VERSION: string
  ARGUMENT_TYPE: typeof ARGUMENT_TYPE
  SlashCommand: typeof SlashCommand
  SlashCommandArgument: typeof SlashCommandArgument
  SlashCommandNamedArgument: typeof SlashCommandNamedArgument
  SlashCommandEnumValue: typeof SlashCommandEnumValue
  SlashCommandClosure: typeof SlashCommandClosure
  SlashCommandParser: typeof SlashCommandParser
  chat: CompatChatMessage[]
  characters: Array<Record<string, unknown>>
  event_types: typeof event_types
  eventSource: StEventEmitter
  extension_settings: ExtensionSettings
  extensionNames: string[]
  extensionTypes: Record<string, string>
  extension_prompts: Record<string, ExtensionPrompt>
  chat_metadata: Record<string, unknown>
  world_info: Record<string, unknown>
  world_info_settings: StWorldInfoRuntimeSettings
  world_names: string[]
  selected_world_info: string[]
  variables: {
    global: VariableScope
    local: VariableScope
    getGlobalVariable: typeof getGlobalVariable
    setGlobalVariable: typeof setGlobalVariable
    getLocalVariable: typeof getLocalVariable
    setLocalVariable: typeof setLocalVariable
  }
  getContext: typeof getContext
  getExtensionManifest: typeof getExtensionManifest
  getRequestHeaders: typeof getRequestHeaders
  loadWorldInfo: typeof loadWorldInfo
  updateWorldInfoList: typeof updateWorldInfoList
  initialize: typeof initializeStExtensionHost
  ModuleWorkerWrapper: typeof SimpleMutex
  registerMacro: typeof registerMacro
  unregisterMacro: typeof unregisterMacro
  registerMacroLike: typeof registerMacroLike
  unregisterMacroLike: typeof unregisterMacroLike
  replaceVariableMacros: typeof replaceVariableMacros
  messageFormatting: typeof messageFormatting
  reloadMarkdownProcessor: typeof reloadMarkdownProcessor
  registerSlashCommand: typeof registerSlashCommand
  STscript: typeof STscript
  executeSlashCommands: typeof executeSlashCommands
  executeSlashCommandsWithOptions: typeof executeSlashCommandsWithOptions
  renderExtensionTemplate: typeof renderExtensionTemplate
  renderExtensionTemplateAsync: typeof renderExtensionTemplateAsync
  getCharacter: typeof getCharacter
  getCharacters: typeof getCharacters
  getOneCharacter: typeof getOneCharacter
  unshallowCharacter: typeof unshallowCharacter
  writeExtensionField: typeof writeExtensionField
  writeExtensionFieldBulk: typeof writeExtensionFieldBulk
  updateMessageBlock: typeof updateMessageBlock
  printMessages: typeof printMessages
  clearChat: typeof clearChat
  addOneMessage: typeof addOneMessage
  appendMediaToMessage: typeof appendMediaToMessage
  addCopyToCodeBlocks: typeof addCopyToCodeBlocks
  saveChatConditional: typeof saveChatConditional
  saveChatConditionalDebounced: typeof saveChatConditionalDebounced
  saveMetadata: typeof saveMetadata
  saveMetadataDebounced: typeof saveMetadataDebounced
  saveSettings: typeof saveSettings
  saveSettingsDebounced: typeof saveSettingsDebounced
  setExtensionPrompt: typeof setExtensionPrompt
  getExtensionPromptByName: typeof getExtensionPromptByName
  getGlobalVariable: typeof getGlobalVariable
  setGlobalVariable: typeof setGlobalVariable
  getLocalVariable: typeof getLocalVariable
  setLocalVariable: typeof setLocalVariable
  getVariables: typeof getVariables
  replaceVariables: typeof replaceVariables
  updateVariablesWith: typeof updateVariablesWith
  insertVariables: typeof insertVariables
  insertOrAssignVariables: typeof insertOrAssignVariables
  deleteVariable: typeof deleteVariable
  TavernHelper: Record<string, unknown>
  builtin: Record<string, unknown>
  xiaobaixStreamingGeneration: ReturnType<typeof createXiaobaixStreamingGeneration>
  updateTemplateVariables: typeof updateTemplateVariables
  updateContext: typeof updateStExtensionContext
  recordCompatDiagnostic: typeof recordCompatDiagnostic
  getDiagnostics: typeof getDiagnostics
  resetDiagnostics: typeof resetDiagnostics
}

declare global {
  interface Window {
    CraftTalker?: {
      stHost?: StHostApi
      [key: string]: unknown
    }
    SillyTavern?: StHostApi
    extension_settings?: ExtensionSettings
    eventSource?: StEventEmitter
    chat_metadata?: Record<string, unknown>
    $?: typeof jquery
    jQuery?: typeof jquery
    _?: typeof lodash
    hljs?: typeof hljs
    toastr?: typeof toastr
    showdown?: typeof showdown
    Popper?: typeof Popper
    getContext?: typeof getContext
    saveSettingsDebounced?: typeof saveSettingsDebounced
    saveChatConditional?: typeof saveChatConditional
    saveChatConditionalDebounced?: typeof saveChatConditionalDebounced
    getCharacters?: typeof getCharacters
    getOneCharacter?: typeof getOneCharacter
    unshallowCharacter?: typeof unshallowCharacter
    executeSlashCommands?: typeof executeSlashCommands
    executeSlashCommandsWithOptions?: typeof executeSlashCommandsWithOptions
    messageFormatting?: typeof messageFormatting
    reloadMarkdownProcessor?: typeof reloadMarkdownProcessor
    updateMessageBlock?: typeof updateMessageBlock
    printMessages?: typeof printMessages
    clearChat?: typeof clearChat
    addOneMessage?: typeof addOneMessage
    STscript?: typeof STscript
    TavernHelper?: Record<string, unknown>
    builtin?: Record<string, unknown>
    oai_settings?: Record<string, unknown>
    openai_settings?: Record<string, unknown>
    registerMacroLike?: typeof registerMacroLike
    unregisterMacroLike?: typeof unregisterMacroLike
    xiaobaixStreamingGeneration?: ReturnType<typeof createXiaobaixStreamingGeneration>
    updateTemplateVariables?: typeof updateTemplateVariables
    YAML?: {
      parse: (value: unknown) => unknown
      stringify: (value: unknown) => string
      parseDocument?: (value: unknown) => unknown
    }
    z?: Record<string, unknown>
  }
}

export const CLIENT_VERSION = 'CraftTalker:0.1.0'

export const event_types = {
  APP_INITIALIZED: 'app_initialized',
  APP_READY: 'app_ready',
  EXTRAS_CONNECTED: 'extras_connected',
  MESSAGE_SWIPED: 'message_swiped',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_FILE_EMBEDDED: 'message_file_embedded',
  MESSAGE_REASONING_EDITED: 'message_reasoning_edited',
  MESSAGE_REASONING_DELETED: 'message_reasoning_deleted',
  MESSAGE_SWIPE_DELETED: 'message_swipe_deleted',
  MORE_MESSAGES_LOADED: 'more_messages_loaded',
  IMPERSONATE_READY: 'impersonate_ready',
  CHAT_CHANGED: 'chat_id_changed',
  CHAT_LOADED: 'chatLoaded',
  GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',
  GENERATION_STARTED: 'generation_started',
  GENERATION_STOPPED: 'generation_stopped',
  GENERATION_ENDED: 'generation_ended',
  SD_PROMPT_PROCESSING: 'sd_prompt_processing',
  EXTENSIONS_FIRST_LOAD: 'extensions_first_load',
  EXTENSION_SETTINGS_LOADED: 'extension_settings_loaded',
  SETTINGS_LOADED: 'settings_loaded',
  SETTINGS_UPDATED: 'settings_updated',
  SETTINGS_LOADED_BEFORE: 'settings_loaded_before',
  SETTINGS_LOADED_AFTER: 'settings_loaded_after',
  GROUP_UPDATED: 'group_updated',
  MOVABLE_PANELS_RESET: 'movable_panels_reset',
  CHATCOMPLETION_SOURCE_CHANGED: 'chatcompletion_source_changed',
  CHATCOMPLETION_MODEL_CHANGED: 'chatcompletion_model_changed',
  OAI_PRESET_CHANGED_BEFORE: 'oai_preset_changed_before',
  OAI_PRESET_CHANGED_AFTER: 'oai_preset_changed_after',
  OAI_PRESET_EXPORT_READY: 'oai_preset_export_ready',
  OAI_PRESET_IMPORT_READY: 'oai_preset_import_ready',
  WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated',
  WORLDINFO_UPDATED: 'worldinfo_updated',
  CHARACTER_EDITOR_OPENED: 'character_editor_opened',
  CHARACTER_EDITED: 'character_edited',
  CHARACTER_PAGE_LOADED: 'character_page_loaded',
  CHARACTER_GROUP_OVERLAY_STATE_CHANGE_BEFORE: 'character_group_overlay_state_change_before',
  CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER: 'character_group_overlay_state_change_after',
  USER_MESSAGE_RENDERED: 'user_message_rendered',
  CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
  FORCE_SET_BACKGROUND: 'force_set_background',
  CHAT_DELETED: 'chat_deleted',
  CHAT_CREATED: 'chat_created',
  CHAT_RENAMED: 'chat_renamed',
  GROUP_CHAT_DELETED: 'group_chat_deleted',
  GROUP_CHAT_CREATED: 'group_chat_created',
  GENERATE_BEFORE_COMBINE_PROMPTS: 'generate_before_combine_prompts',
  GENERATE_AFTER_COMBINE_PROMPTS: 'generate_after_combine_prompts',
  GENERATE_AFTER_DATA: 'generate_after_data',
  GROUP_MEMBER_DRAFTED: 'group_member_drafted',
  GROUP_WRAPPER_STARTED: 'group_wrapper_started',
  GROUP_WRAPPER_FINISHED: 'group_wrapper_finished',
  WORLD_INFO_ACTIVATED: 'world_info_activated',
  TEXT_COMPLETION_SETTINGS_READY: 'text_completion_settings_ready',
  CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',
  CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready',
  CHARACTER_FIRST_MESSAGE_SELECTED: 'character_first_message_selected',
  CHARACTER_DELETED: 'characterDeleted',
  CHARACTER_DUPLICATED: 'character_duplicated',
  CHARACTER_RENAMED: 'character_renamed',
  CHARACTER_RENAMED_IN_PAST_CHAT: 'character_renamed_in_past_chat',
  SMOOTH_STREAM_TOKEN_RECEIVED: 'stream_token_received',
  STREAM_TOKEN_RECEIVED: 'stream_token_received',
  STREAM_TOKEN_RECEIVED_FULLY: 'js_stream_token_received_fully',
  STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'js_stream_token_received_incrementally',
  GENERATION_BEFORE_END: 'js_generation_before_end',
  JS_GENERATION_STARTED: 'js_generation_started',
  JS_GENERATION_ENDED: 'js_generation_ended',
  STREAM_REASONING_DONE: 'stream_reasoning_done',
  FILE_ATTACHMENT_DELETED: 'file_attachment_deleted',
  WORLDINFO_FORCE_ACTIVATE: 'worldinfo_force_activate',
  OPEN_CHARACTER_LIBRARY: 'open_character_library',
  ONLINE_STATUS_CHANGED: 'online_status_changed',
  IMAGE_SWIPED: 'image_swiped',
  CONNECTION_PROFILE_LOADED: 'connection_profile_loaded',
  CONNECTION_PROFILE_CREATED: 'connection_profile_created',
  CONNECTION_PROFILE_DELETED: 'connection_profile_deleted',
  CONNECTION_PROFILE_UPDATED: 'connection_profile_updated',
  TOOL_CALLS_PERFORMED: 'tool_calls_performed',
  TOOL_CALLS_RENDERED: 'tool_calls_rendered',
  CHARACTER_MANAGEMENT_DROPDOWN: 'charManagementDropdown',
  SECRET_WRITTEN: 'secret_written',
  SECRET_DELETED: 'secret_deleted',
  SECRET_ROTATED: 'secret_rotated',
  SECRET_EDITED: 'secret_edited',
  PRESET_CHANGED: 'preset_changed',
  PRESET_DELETED: 'preset_deleted',
  PRESET_RENAMED: 'preset_renamed',
  PRESET_RENAMED_BEFORE: 'preset_renamed_before',
  MAIN_API_CHANGED: 'main_api_changed',
  WORLDINFO_ENTRIES_LOADED: 'worldinfo_entries_loaded',
  WORLDINFO_SCAN_DONE: 'worldinfo_scan_done',
  MEDIA_ATTACHMENT_DELETED: 'media_attachment_deleted',
  PERSONA_CHANGED: 'persona_changed',
  PERSONA_CREATED: 'persona_created',
  PERSONA_UPDATED: 'persona_updated',
  PERSONA_RENAMED: 'persona_renamed',
  PERSONA_DELETED: 'persona_deleted',
  TTS_JOB_STARTED: 'tts_job_started',
  TTS_AUDIO_READY: 'tts_audio_ready',
  TTS_JOB_COMPLETE: 'tts_job_complete',
  ITEMIZED_PROMPTS_LOADED: 'itemized_prompts_loaded',
  ITEMIZED_PROMPTS_SAVED: 'itemized_prompts_saved',
  ITEMIZED_PROMPTS_DELETED: 'itemized_prompts_deleted',
} as const

export class StEventEmitter {
  private readonly events = new Map<string, Listener[]>()
  private readonly autoFireLastArgs = new Map<string, unknown[]>()
  private readonly autoFireAfterEmit = new Set<string>()

  constructor(autoFireAfterEmit: string[] = []) {
    for (const event of autoFireAfterEmit) {
      this.autoFireAfterEmit.add(event)
    }
  }

  on(event: string | undefined, listener: Listener): void {
    if (!event) {
      console.trace('[ST Compat] Cannot listen to an undefined event')
      return
    }
    const listeners = this.events.get(event) ?? []
    listeners.push(listener)
    this.events.set(event, listeners)

    if (this.autoFireAfterEmit.has(event) && this.autoFireLastArgs.has(event)) {
      void Promise.resolve(listener(...(this.autoFireLastArgs.get(event) ?? []))).catch(console.error)
    }
  }

  once(event: string | undefined, listener: Listener): void {
    const wrapper: Listener = async (...args) => {
      this.removeListener(event, wrapper)
      await listener(...args)
    }
    this.on(event, wrapper)
  }

  makeFirst(event: string | undefined, listener: Listener): void {
    if (!event) return
    const listeners = this.events.get(event) ?? []
    const existingIndex = listeners.indexOf(listener)
    if (existingIndex >= 0) listeners.splice(existingIndex, 1)
    listeners.unshift(listener)
    this.events.set(event, listeners)

    if (this.autoFireAfterEmit.has(event) && this.autoFireLastArgs.has(event)) {
      void Promise.resolve(listener(...(this.autoFireLastArgs.get(event) ?? []))).catch(console.error)
    }
  }

  makeLast(event: string | undefined, listener: Listener): void {
    if (!event) return
    const listeners = this.events.get(event) ?? []
    const existingIndex = listeners.indexOf(listener)
    if (existingIndex >= 0) listeners.splice(existingIndex, 1)
    listeners.push(listener)
    this.events.set(event, listeners)

    if (this.autoFireAfterEmit.has(event) && this.autoFireLastArgs.has(event)) {
      void Promise.resolve(listener(...(this.autoFireLastArgs.get(event) ?? []))).catch(console.error)
    }
  }

  removeListener(event: string | undefined, listener: Listener): void {
    if (!event) return
    const listeners = this.events.get(event)
    if (!listeners) return
    const index = listeners.indexOf(listener)
    if (index >= 0) listeners.splice(index, 1)
  }

  off(event: string | undefined, listener: Listener): void {
    this.removeListener(event, listener)
  }

  async emit(event: string, ...args: unknown[]): Promise<void> {
    const listeners = [...(this.events.get(event) ?? [])]
    for (const listener of listeners) {
      try {
        await listener(...args)
      } catch (error) {
        console.error('[ST Compat] Event listener failed', event, error)
      }
    }

    if (this.autoFireAfterEmit.has(event)) {
      this.autoFireLastArgs.set(event, args)
    }
  }

  emitAndWait(event: string, ...args: unknown[]): void {
    const listeners = [...(this.events.get(event) ?? [])]
    for (const listener of listeners) {
      try {
        void listener(...args)
      } catch (error) {
        console.error('[ST Compat] Event listener failed', event, error)
      }
    }

    if (this.autoFireAfterEmit.has(event)) {
      this.autoFireLastArgs.set(event, args)
    }
  }
}

export const eventSource = new StEventEmitter([
  event_types.APP_READY,
  event_types.APP_INITIALIZED,
])

const global_variables: VariableScope = {}
const chat_variables: VariableScope = {}
const chat_extensions: VariableScope = {}
const global_variable_facade = createVariableScopeFacade({ type: 'global' })
const chat_variable_facade = createVariableScopeFacade({ type: 'chat' })

export const extension_settings: ExtensionSettings = createDefaultExtensionSettings()
export const extensionNames: string[] = []
export const extensionTypes: Record<string, string> = {}

const manifests: Record<string, ExtensionManifest> = {}
const activeExtensions = new Set<string>()
const extensionLoadErrors = new Set<string>()
const extension_prompts: Record<string, ExtensionPrompt> = {}
const extensionTemplateCache = new Map<string, string>()
const macroRegistry = new Map<string, unknown>()
const macroLikeRegistry: Array<{ regex: RegExp, replace: MacroLikeReplacement }> = []
const diagnostics = new Map<string, CompatDiagnosticEntry>()
const tavernHelperGenerations = new Map<string, TavernHelperGenerationEntry>()
const chat: CompatChatMessage[] = []
const characters: Array<Record<string, unknown>> = []
const chat_metadata: Record<string, unknown> = { variables: chat_variables, extensions: chat_extensions }
const world_names: string[] = []
const selected_world_info: string[] = []
const world_info: Record<string, unknown> = { globalSelect: selected_world_info, charLore: [], entries: {} }
const world_info_settings: StWorldInfoRuntimeSettings = createDefaultWorldInfoSettings()
const character_variables: VariableScope = {}
const preset_variables: VariableScope = {}
const script_variables: VariableScope = {}
const templateVariables: VariableScope = {}

let saveSettingsTimer: number | null = null
let saveMetadataTimer: number | null = null
let saveChatTimer: number | null = null
let initializePromise: Promise<void> | null = null
let currentCharacterIndex = -1
let contextState: StHostContextState = {
  activeCharacter: null,
  activeChatId: null,
  characters: [],
  messages: [],
  chatLines: [],
}

export const ARGUMENT_TYPE = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  VARIABLE_NAME: 'variable_name',
  CLOSURE: 'closure',
  DICTIONARY: 'dictionary',
  LIST: 'list',
} as const

export class SlashCommandEnumValue {
  value = ''
  description = ''

  constructor(value = '', description = '') {
    this.value = value
    this.description = description
  }
}

export class SlashCommandArgument {
  description = ''
  typeList: string[] = []
  isRequired = false
  acceptsMultiple = false
  defaultValue?: unknown
  enumList: SlashCommandEnumValue[] = []

  static fromProps(props: Partial<SlashCommandArgument>): SlashCommandArgument {
    return Object.assign(new SlashCommandArgument(), props)
  }
}

export class SlashCommandNamedArgument extends SlashCommandArgument {
  name = ''

  static fromProps(props: Partial<SlashCommandNamedArgument>): SlashCommandNamedArgument {
    return Object.assign(new SlashCommandNamedArgument(), props)
  }
}

export class SlashCommandClosure {
  rawText = ''

  constructor(rawText = '') {
    this.rawText = rawText
  }

  toString(): string {
    return this.rawText
  }
}

export class SlashCommand {
  name = ''
  callback?: SlashCommandCallback
  helpString = ''
  splitUnnamedArgument = false
  splitUnnamedArgumentCount?: number
  rawQuotes = false
  aliases: string[] = []
  returns = ''
  namedArgumentList: SlashCommandNamedArgument[] = []
  unnamedArgumentList: SlashCommandArgument[] = []
  isExtension = false
  isThirdParty = false
  source = ''

  static fromProps(props: Partial<SlashCommand>): SlashCommand {
    return Object.assign(new SlashCommand(), props)
  }
}

export class SlashCommandParser {
  static commands: Record<string, SlashCommand> = {}

  get commands(): Record<string, SlashCommand> {
    return SlashCommandParser.commands
  }

  static addCommand(
    command: string,
    callback: SlashCommandCallback,
    aliases: string[] = [],
    helpString = '',
  ): void {
    this.addCommandObject(SlashCommand.fromProps({
      name: command,
      callback,
      aliases,
      helpString,
    }))
  }

  static addCommandObject(command: SlashCommand): void {
    if (!command.name) {
      throw new Error('Slash command name is required')
    }
    this.addCommandObjectUnsafe(command)
  }

  static addCommandObjectUnsafe(command: SlashCommand): void {
    const stack = new Error().stack ?? ''
    command.isExtension = stack.includes('/scripts/extensions/')
    command.isThirdParty = stack.includes('/scripts/extensions/third-party/')
    command.source = inferExtensionSource(stack)

    SlashCommandParser.commands[command.name] = command
    for (const alias of command.aliases ?? []) {
      SlashCommandParser.commands[alias] = command
    }
  }
}

export function registerSlashCommand(
  command: string,
  callback: SlashCommandCallback,
  aliases: string[] = [],
  helpString = '',
): void {
  SlashCommandParser.addCommand(command, callback, aliases, helpString)
}

export async function executeSlashCommands(text = '', optionsOrReturnResultObject: unknown = {}): Promise<unknown> {
  const options = typeof optionsOrReturnResultObject === 'boolean'
    ? { returnResultObject: optionsOrReturnResultObject }
    : isPlainRecord(optionsOrReturnResultObject)
      ? optionsOrReturnResultObject
      : {}
  return executeSlashCommandsWithOptions(text, options)
}

export async function executeSlashCommandsWithOptions(input: unknown = '', options: Record<string, unknown> = {}): Promise<unknown> {
  const text = getSlashCommandText(input, options)
  const trimmed = replaceVariableMacros(text).trim()
  try {
    const segments = splitSlashPipeline(trimmed)
    if (!segments.length) return ''
    let pipe: unknown = ''
    for (const segment of segments) {
      pipe = await executeSingleSlashCommand(segment, options, pipe)
    }
    return wrapSlashResult(pipe, options, false)
  } catch (error) {
    if (options.returnResultObject === true || options.handleErrors === false) {
      return {
        pipe: '',
        isError: true,
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    }
    throw error
  }
}

function executeSlashCommandsWithResultObject(input: unknown = '', options: Record<string, unknown> = {}): Promise<unknown> {
  return executeSlashCommandsWithOptions(input, { ...options, returnResultObject: true })
}

export function getGlobalVariable(name: unknown): unknown {
  return getVariableValue({ type: 'global' }, name)
}

export function setGlobalVariable(name: unknown, value: unknown): unknown {
  setVariableValue({ type: 'global' }, name, value)
  saveSettingsDebounced()
  return value
}

export function getLocalVariable(name: unknown): unknown {
  return getVariableValue({ type: 'chat' }, name)
}

export function setLocalVariable(name: unknown, value: unknown): unknown {
  setVariableValue({ type: 'chat' }, name, value)
  saveMetadataDebounced()
  return value
}

export function getVariables(option: Record<string, unknown> = { type: 'chat' }): VariableScope {
  return structuredClone(getVariableStore(option))
}

export function replaceVariables(variables: Record<string, unknown>, option: Record<string, unknown> = { type: 'chat' }): void {
  const store = getVariableStore(option)
  for (const key of Object.keys(store)) {
    delete store[key]
  }
  Object.assign(store, structuredClone(variables))
  scheduleVariableSave(option)
}

export function updateVariablesWith(
  updater: (variables: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>,
  option: Record<string, unknown> = { type: 'chat' },
): Record<string, unknown> | Promise<Record<string, unknown>> {
  const current = getVariables(option)
  const next = updater(current)
  if (isPromiseLike(next)) {
    return next.then((resolved) => {
      replaceVariables(resolved, option)
      return getVariables(option)
    })
  }
  replaceVariables(next, option)
  return getVariables(option)
}

export function insertVariables(variables: Record<string, unknown>, option: Record<string, unknown> = { type: 'chat' }): void {
  Object.assign(getVariableStore(option), structuredClone(variables))
  scheduleVariableSave(option)
}

export function insertOrAssignVariables(variables: Record<string, unknown>, option: Record<string, unknown> = { type: 'chat' }): void {
  insertVariables(variables, option)
}

export function deleteVariable(name: unknown, option: Record<string, unknown> = { type: 'chat' }): void {
  deleteVariableValue(option, name)
  scheduleVariableSave(option)
}

export async function STscript(command: unknown): Promise<unknown> {
  const result = await executeSlashCommandsWithOptions(String(command ?? ''), { returnResultObject: true })
  return isSlashResult(result) ? result.pipe : result
}

export function replaceVariableMacros(value: unknown, context: MacroLikeContext = {}): string {
  let output = String(value ?? '')
  output = output
    .replace(/\{\{getvar::([^}]+)\}\}/gi, (_, path: string) => stringifyMacroValue(getVariableValue({ type: 'chat' }, path)))
    .replace(/\{\{getglobalvar::([^}]+)\}\}/gi, (_, path: string) => stringifyMacroValue(getVariableValue({ type: 'global' }, path)))
    .replace(/\{\{xbgetvar::([^}]+)\}\}/gi, (_, path: string) => stringifyMacroValue(getVariableValue({ type: 'chat' }, path)))
    .replace(/\{\{xbgetvar_yaml::([^}]+)\}\}/gi, (_, path: string) => stringifyYamlLike(getVariableValue({ type: 'chat' }, path)))
    .replace(/\{\{xbgetvar_yaml_idx::([^}]+)\}\}/gi, (_, path: string) => stringifyYamlLike(getVariableValue({ type: 'chat' }, path)))
    .replace(/\{\{get_(message|chat|character|preset|global)_variable::(.*?)\}\}/gi, (
      _,
      scope: string,
      path: string,
    ) => stringifyMacroValue(getVariableValue({ type: normalizeVariableScope(scope), message_id: context.message_id }, path)))

  output = output.replace(/^(.*)\{\{format_(message|chat|character|preset|global)_variable::(.*?)\}\}/gim, (
    match: string,
    prefix: string,
    scope: string,
    path: string,
  ) => {
    const value = getVariableValue({ type: normalizeVariableScope(scope), message_id: context.message_id }, path)
    const formatted = stringifyYamlLike(stripPrivateVariableFields(value))
      .replaceAll('\n', `\n${' '.repeat(prefix.length)}`)
    return prefix + formatted || match
  })

  for (const macro of macroLikeRegistry) {
    output = output.replace(macro.regex, (substring: string, ...args: unknown[]) => {
      const offset = args.find(arg => typeof arg === 'number')
      const captures = offset === undefined ? args : args.slice(0, args.indexOf(offset))
      try {
        const replacement = macro.replace(context, substring, ...captures.map(String))
        return replacement == null ? '' : String(replacement)
      } catch (error) {
        console.error('[ST Compat] Macro-like replacement failed', error)
        return substring
      }
    })
  }

  for (const [name, handler] of macroRegistry.entries()) {
    const pattern = new RegExp(`\\{\\{${escapeRegExp(name)}(?:::([^}]*))?\\}\\}`, 'gi')
    output = output.replace(pattern, (substring, arg) => {
      try {
        if (typeof handler === 'function') {
          return String((handler as (value?: string, context?: MacroLikeContext) => unknown)(arg, context) ?? '')
        }
        if (handler && typeof handler === 'object' && 'replace' in handler && typeof handler.replace === 'function') {
          return String((handler.replace as (value?: string, context?: MacroLikeContext) => unknown)(arg, context) ?? '')
        }
        return String(handler ?? '')
      } catch (error) {
        console.error('[ST Compat] Macro replacement failed', name, error)
        return substring
      }
    })
  }

  return output
}

const markdownConverter = new showdown.Converter({
  ghCodeBlocks: true,
  literalMidWordUnderscores: true,
  simpleLineBreaks: true,
  simplifiedAutoLink: true,
  strikethrough: true,
  tables: true,
  tasklists: true,
})

function sanitizeFormattedHtml(html: string, overrides: DomPurifyConfig = {}): string {
  const overrideForbiddenTags = Array.isArray(overrides.FORBID_TAGS) ? overrides.FORBID_TAGS : []
  const overrideForbiddenAttributes = Array.isArray(overrides.FORBID_ATTR) ? overrides.FORBID_ATTR : []
  return DOMPurify.sanitize(html, {
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
    ...overrides,
    FORBID_TAGS: [...overrideForbiddenTags, 'script'],
    FORBID_ATTR: [...overrideForbiddenAttributes, 'onerror', 'onload', 'onclick', 'onmouseover'],
  })
}

function renderCompatMarkdown(value: unknown, sanitizerOverrides: DomPurifyConfig = {}): string {
  const html = markdownConverter.makeHtml(replaceVariableMacros(value))
  return sanitizeFormattedHtml(html, sanitizerOverrides)
}

const markdownProcessor: StMarkdownProcessor = {
  makeHtml: renderCompatMarkdown,
}

export function reloadMarkdownProcessor(): StMarkdownProcessor {
  recordCompatDiagnostic(
    'reloadMarkdownProcessor',
    'partial',
    'Returned a safe Showdown-compatible markdown processor without the full SillyTavern message-formatting settings pipeline.',
  )
  return markdownProcessor
}

export function messageFormatting(
  message: unknown,
  _chName = '',
  _isSystem = false,
  _isUser = false,
  messageId?: unknown,
  sanitizerOverrides: DomPurifyConfig = {},
  _isReasoning = false,
): string {
  if (message == null || message === '') return ''
  const macroContext: MacroLikeContext = Number.isInteger(Number(messageId)) ? { message_id: Number(messageId) } : {}
  const html = markdownConverter.makeHtml(replaceVariableMacros(message, macroContext))
  const formatted = sanitizeFormattedHtml(html, sanitizerOverrides)
  recordCompatDiagnostic(
    'messageFormatting',
    'partial',
    'Formatted markdown with macro substitution and DOMPurify sanitization; ST regex, power-user, reasoning, and display-text hooks are not fully mirrored.',
  )
  return formatted
}

export function registerMacroLike(regex: RegExp, replace: MacroLikeReplacement): { unregister: () => void } {
  if (!(regex instanceof RegExp) || typeof replace !== 'function') {
    return { unregister: () => {} }
  }
  if (!macroLikeRegistry.some(macro => macro.regex.source === regex.source && macro.regex.flags === regex.flags)) {
    macroLikeRegistry.push({ regex, replace })
  }
  return { unregister: () => unregisterMacroLike(regex) }
}

export function unregisterMacroLike(regex: RegExp): void {
  const index = macroLikeRegistry.findIndex(macro =>
    macro.regex.source === regex.source && macro.regex.flags === regex.flags,
  )
  if (index >= 0) macroLikeRegistry.splice(index, 1)
}

export function updateTemplateVariables(vars: Record<string, unknown> = {}): VariableScope {
  Object.assign(templateVariables, structuredClone(vars))
  void eventSource.emit('xiaobaix_template_variables_updated', structuredClone(templateVariables))
  return templateVariables
}

export function getContext(): Record<string, unknown> {
  return {
    accountStorage: createStorageFacade('st-account-storage'),
    chat,
    characters,
    groups: [],
    name1: 'You',
    name2: contextState.activeCharacter?.name ?? '',
    characterId: currentCharacterIndex,
    this_chid: currentCharacterIndex,
    groupId: null,
    chatId: contextState.activeChatId,
    chat_metadata,
    getCurrentChatId: () => contextState.activeChatId,
    getRequestHeaders,
    reloadCurrentChat: async () => recordCompatDiagnostic('reloadCurrentChat', 'stub', 'Current chat reload is not wired to the native chat loader yet.'),
    renameChat: async () => recordCompatDiagnostic('renameChat', 'stub', 'Chat rename through the ST compatibility context is not implemented yet.'),
    saveSettingsDebounced,
    onlineStatus: 'no_connection',
    maxContext: 0,
    chatMetadata: chat_metadata,
    saveChatConditional,
    saveChatConditionalDebounced,
    saveMetadataDebounced,
    eventSource,
    event_types,
    eventTypes: event_types,
    extensionSettings: extension_settings,
    extension_settings,
    extensionPrompts: extension_prompts,
    variables: {
      global: global_variable_facade,
      local: chat_variable_facade,
      getGlobalVariable,
      setGlobalVariable,
      getLocalVariable,
      setLocalVariable,
    },
    world_info,
    world_info_settings,
    world_names,
    selected_world_info,
    setExtensionPrompt,
    getExtensionPromptByName,
    saveChat: saveChatConditional,
    saveMetadata,
    sendSystemMessage: () => recordCompatDiagnostic('sendSystemMessage', 'stub', 'System message injection must go through native chat service semantics.'),
    activateSendButtons: () => recordCompatDiagnostic('activateSendButtons', 'stub', 'Native React send controls are not exposed through ST DOM helpers.'),
    deactivateSendButtons: () => recordCompatDiagnostic('deactivateSendButtons', 'stub', 'Native React send controls are not exposed through ST DOM helpers.'),
    saveReply: async () => recordCompatDiagnostic('saveReply', 'stub', 'Direct saveReply is not wired to CraftTalker chat persistence yet.'),
    updateMessageBlock,
    printMessages,
    clearChat,
    addOneMessage,
    appendMediaToMessage,
    addCopyToCodeBlocks,
    substituteParams: replaceVariableMacros,
    substituteParamsExtended: replaceVariableMacros,
    SlashCommandParser,
    SlashCommand,
    SlashCommandArgument,
    SlashCommandNamedArgument,
    SlashCommandEnumValue,
    ARGUMENT_TYPE,
    executeSlashCommands,
    executeSlashCommandsWithOptions: executeSlashCommandsWithResultObject,
    registerSlashCommand,
    registerMacro,
    unregisterMacro,
    registerMacroLike,
    unregisterMacroLike,
    replaceVariableMacros,
    messageFormatting,
    reloadMarkdownProcessor,
    STscript,
    renderExtensionTemplate,
    renderExtensionTemplateAsync,
    getCharacter,
    getCharacters,
    getOneCharacter,
    unshallowCharacter,
    writeExtensionField,
    writeExtensionFieldBulk,
    mainApi: 'crafttalker',
    ModuleWorkerWrapper: SimpleMutex,
    shouldSendOnEnter: () => true,
    isMobile: () => window.matchMedia('(max-width: 768px)').matches,
    t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
      if (typeof strings === 'string') return strings
      return strings.reduce((acc, part, index) => `${acc}${part}${String(values[index] ?? '')}`, '')
    },
    translate: async (value: string) => value,
    getCurrentLocale: () => navigator.language || 'en',
    addLocaleData: () => {},
    tags: [],
    tagMap: {},
    menuType: 'crafttalker',
    charactersData: contextState.characters,
    messages: contextState.messages,
    TavernHelper: tavernHelperFacade,
    builtin: builtinFacade,
    xiaobaixStreamingGeneration,
    updateTemplateVariables,
  }
}

export function updateStExtensionContext(next: Partial<StHostContextState>): void {
  const previousChatId = contextState.activeChatId
  contextState = { ...contextState, ...next }
  rebuildCompatState()
  publishGlobals()

  if (next.activeChatId !== undefined && next.activeChatId !== previousChatId) {
    void eventSource.emit(event_types.CHAT_CHANGED, next.activeChatId)
    void eventSource.emit(event_types.CHAT_LOADED, {
      detail: {
        id: currentCharacterIndex,
        character: characters[currentCharacterIndex],
      },
    })
  }
}

export function getRequestHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' }
}

export async function updateWorldInfoList(): Promise<void> {
  const settings = await api.worlds.getSettings()
  world_names.splice(0, world_names.length, ...settings.world_names)
  selected_world_info.splice(0, selected_world_info.length, ...settings.selected_world_info)
  syncWorldInfoSettings(settings)
  replaceWorldInfo({
    ...settings.world_info,
    globalSelect: selected_world_info,
  })
  syncCompatWorldSelects()
  recordCompatDiagnostic('updateWorldInfoList', 'partial', 'Worldbook names and global selections were loaded from CraftTalker world services.')
}

export async function loadWorldInfo(name: string): Promise<WorldBook | null> {
  const worldName = String(name ?? '').trim()
  if (!worldName) return null
  try {
    const world = await api.worlds.get(worldName)
    cacheWorldInfo(world)
    syncCompatWorldSelects()
    recordCompatDiagnostic('loadWorldInfo', 'partial', 'Worldbook entries were read through CraftTalker world services.')
    return structuredClone(world)
  } catch (error) {
    recordCompatDiagnostic('loadWorldInfo', 'stub', `Worldbook "${worldName}" could not be read through CraftTalker world services.`)
    console.warn('[ST Compat] Failed to load world info', worldName, error)
    return null
  }
}

export function getCharacter(idOrName: unknown = 'current'): Record<string, unknown> | null {
  const index = resolveCharacterIndex(idOrName)
  return index >= 0 ? characters[index] ?? null : null
}

export async function getCharacters(): Promise<Array<Record<string, unknown>>> {
  try {
    const snapshot = await api.characters.list()
    applyCharacterListSnapshot(snapshot)
    recordCompatDiagnostic('getCharacters', 'partial', 'Refreshed the ST compatibility character mirror from CraftTalker character storage.')
  } catch (error) {
    recordCompatDiagnostic('getCharacters', 'stub', 'Character list refresh failed; returning the existing in-memory ST compatibility mirror.')
    console.warn('[ST Compat] Failed to refresh character list', error)
  }
  return characters
}

export async function getOneCharacter(idOrName: unknown = 'current'): Promise<Record<string, unknown> | null> {
  const resolvedName = resolveCharacterFileName(idOrName)
  if (!resolvedName) {
    recordCompatDiagnostic('getOneCharacter', 'stub', 'Could not resolve a CraftTalker character file name for the requested ST character lookup.')
    return getCharacter(idOrName)
  }

  try {
    const detail = await api.characters.get(resolvedName)
    const index = upsertCharacterSnapshot(detail)
    recordCompatDiagnostic('getOneCharacter', 'partial', 'Refreshed one ST compatibility character mirror entry from CraftTalker character storage.')
    return index >= 0 ? characters[index] ?? null : null
  } catch (error) {
    recordCompatDiagnostic('getOneCharacter', 'stub', `Character "${resolvedName}" could not be refreshed through CraftTalker character storage.`)
    console.warn('[ST Compat] Failed to refresh character', resolvedName, error)
    return getCharacter(idOrName)
  }
}

export async function unshallowCharacter(idOrName: unknown = currentCharacterIndex): Promise<Record<string, unknown> | null> {
  const character = getCharacter(idOrName)
  if (!character) {
    recordCompatDiagnostic('unshallowCharacter', 'stub', 'Ignored ST unshallow request because the character could not be resolved.')
    return null
  }
  if (character.shallow !== true) return character
  return getOneCharacter(character.avatar ?? idOrName)
}

export async function writeExtensionField(
  characterIdOrField: unknown,
  fieldOrValue?: unknown,
  value?: unknown,
  _affectMemory = true,
): Promise<boolean> {
  const twoArgumentForm = arguments.length <= 2
  const characterIndex = twoArgumentForm ? currentCharacterIndex : resolveCharacterIndex(characterIdOrField)
  const field = twoArgumentForm ? characterIdOrField : fieldOrValue
  const segments = parseExtensionFieldPath(field)
  if (characterIndex < 0 || !characters[characterIndex] || !segments.length) {
    recordCompatDiagnostic('writeExtensionField', 'stub', 'Ignored extension field write because the character id or field path was invalid.')
    return false
  }

  const compatCharacter = characters[characterIndex]
  const data = ensureRecord(compatCharacter, 'data')
  const extensions = ensureRecord(data, 'extensions')
  compatCharacter.extensions = extensions

  const nextValue = twoArgumentForm ? fieldOrValue : value
  if (nextValue === undefined) {
    lodash.unset(extensions, segments)
  } else {
    lodash.set(extensions, segments, cloneCompatValue(nextValue))
  }

  syncCharacterJsonData(compatCharacter, extensions)
  syncSourceCharacterExtensions(characterIndex, extensions)

  const characterName = getPersistableCharacterName(compatCharacter)
  if (!characterName) {
    recordCompatDiagnostic('writeExtensionField', 'stub', 'Updated the in-memory extension field but could not resolve a CraftTalker character file name for persistence.')
    return false
  }

  try {
    const saved = await api.characters.update(characterName, {
      extensions: cloneCompatRecord(extensions),
    })
    mergeSavedCharacter(characterIndex, saved as unknown as Character & Record<string, unknown>)
    recordCompatDiagnostic('writeExtensionField', 'partial', 'Persisted a constrained character data.extensions field through CraftTalker character storage.')
    return true
  } catch (error) {
    recordCompatDiagnostic('writeExtensionField', 'stub', 'Character extension field persistence failed; the in-memory ST compatibility mirror was updated only.')
    console.error('[ST Compat] Failed to persist character extension field', error)
    return false
  }
}

export async function writeExtensionFieldBulk(
  characterId: unknown,
  fields: Record<string, unknown> | Array<{ key?: unknown, field?: unknown, value?: unknown }>,
): Promise<boolean> {
  if (Array.isArray(fields)) {
    const results: boolean[] = []
    for (const entry of fields) {
      results.push(await writeExtensionField(characterId, entry.key ?? entry.field, entry.value))
    }
    return results.every(Boolean)
  }

  if (!fields || typeof fields !== 'object') {
    recordCompatDiagnostic('writeExtensionFieldBulk', 'stub', 'Ignored bulk extension field write because the field map was invalid.')
    return false
  }

  const results: boolean[] = []
  for (const [field, fieldValue] of Object.entries(fields)) {
    results.push(await writeExtensionField(characterId, field, fieldValue))
  }
  return results.every(Boolean)
}

export function updateMessageBlock(
  messageId: unknown,
  message: unknown = chat[Number(messageId)],
  options: Record<string, unknown> = {},
): void {
  const index = Number(messageId)
  if (!Number.isInteger(index) || index < 0 || !message || typeof message !== 'object') {
    recordCompatDiagnostic('updateMessageBlock', 'stub', 'Ignored message block update because the message id or payload was invalid.')
    return
  }

  const next = message as CompatChatMessage
  if (chat[index] && chat[index] !== next) {
    Object.assign(chat[index], next)
  } else if (!chat[index]) {
    chat[index] = next
  }
  normalizeMessageVariableShape(chat[index])
  syncCompatDomState()
  if (options.rerenderMessage !== false) {
    renderCompatMessageBlock(index, chat[index])
  }
  void emitMessageRendered(index, chat[index])
  recordCompatDiagnostic('updateMessageBlock', 'partial', 'Updated the ST compatibility chat mirror and emitted render events without writing native chat storage.')
}

export async function printMessages(): Promise<void> {
  syncCompatDomState()
  chat.forEach((message, index) => renderCompatMessageBlock(index, message))
  recordCompatDiagnostic('printMessages', 'partial', 'Rebuilt the hidden ST compatibility chat mirror from the in-memory chat array.')
}

export async function clearChat(options: Record<string, unknown> = {}): Promise<void> {
  if (options.clearData === true) {
    chat.splice(0, chat.length)
  }
  clearCompatChatDom()
  recordCompatDiagnostic('clearChat', options.clearData === true ? 'partial' : 'stub', 'Cleared the ST compatibility chat DOM mirror; native chat storage is unchanged.')
}

export function addOneMessage(message: unknown, options: Record<string, unknown> = {}): unknown {
  if (!message || typeof message !== 'object') {
    recordCompatDiagnostic('addOneMessage', 'stub', 'Ignored addOneMessage because the payload was not a chat message object.')
    return message
  }

  const next = message as CompatChatMessage
  let index = chat.indexOf(next)
  if (index === -1) {
    const forced = Number(options.forceId)
    const insertBefore = Number(options.insertBefore)
    const insertAfter = Number(options.insertAfter)
    if (Number.isInteger(forced) && forced >= 0 && chat[forced] === next) {
      index = forced
    } else if (Number.isInteger(insertBefore) && insertBefore >= 0 && insertBefore <= chat.length) {
      chat.splice(insertBefore, 0, next)
      index = insertBefore
    } else if (Number.isInteger(insertAfter) && insertAfter >= 0 && insertAfter < chat.length) {
      chat.splice(insertAfter + 1, 0, next)
      index = insertAfter + 1
    } else if (Number.isInteger(forced) && forced >= 0 && forced <= chat.length) {
      chat.splice(forced, 0, next)
      index = forced
    } else {
      chat.push(next)
      index = chat.length - 1
    }
  }

  normalizeMessageVariableShape(next)
  syncCompatDomState()
  renderCompatMessageBlock(index, next)
  recordCompatDiagnostic('addOneMessage', 'partial', 'Added or refreshed one message in the ST compatibility chat mirror without native chat persistence.')
  return message
}

export function appendMediaToMessage(): void {
  recordCompatDiagnostic('appendMediaToMessage', 'stub', 'Media attachment rendering is not wired to the ST compatibility chat mirror yet.')
}

export function addCopyToCodeBlocks(container?: unknown): void {
  const root = getElementFromMaybeJQuery(container) ?? document
  root.querySelectorAll?.('pre code').forEach((code) => {
    const pre = code.closest('pre')
    if (!pre || pre.querySelector('[data-st-compat-copy-code]')) return
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.stCompatCopyCode = 'true'
    button.className = 'code-copy interactable'
    button.textContent = 'Copy'
    button.addEventListener('click', () => {
      void navigator.clipboard?.writeText(code.textContent ?? '')
    })
    pre.appendChild(button)
  })
  recordCompatDiagnostic('addCopyToCodeBlocks', 'partial', 'Attached simple copy buttons to code blocks in the provided ST-compatible container.')
}

export async function saveSettings(): Promise<ExtensionSettings> {
  normalizeExtensionSettingsShape()
  const saved = await api.extensions.saveSettings(extension_settings)
  mergeInto(extension_settings, saved)
  normalizeExtensionSettingsShape()
  await eventSource.emit(event_types.SETTINGS_UPDATED)
  return extension_settings
}

export function saveSettingsDebounced(): void {
  if (saveSettingsTimer !== null) {
    window.clearTimeout(saveSettingsTimer)
  }
  saveSettingsTimer = window.setTimeout(() => {
    saveSettingsTimer = null
    void saveSettings().catch(error => console.error('[ST Compat] Failed to save extension settings', error))
  }, 500)
}

export async function saveMetadata(): Promise<void> {
  const characterName = contextState.activeCharacter?.file_name
  const chatId = contextState.activeChatId
  await persistChatMetadata(characterName, chatId, structuredClone(chat_metadata))
}

export async function saveChatConditional(): Promise<void> {
  await saveMetadata()
  await persistMessageVariables()
}

export function saveChatConditionalDebounced(): void {
  if (saveChatTimer !== null) {
    window.clearTimeout(saveChatTimer)
  }
  recordCompatDiagnostic('saveChatConditionalDebounced', 'partial', 'Queued ST chat compatibility persistence through typed CraftTalker bridges.')
  saveChatTimer = window.setTimeout(() => {
    saveChatTimer = null
    void saveChatConditional().catch(error => {
      recordCompatDiagnostic('saveChatConditional', 'stub', 'ST chat compatibility persistence failed; see console for the native API error.')
      console.error('[ST Compat] Failed to save ST chat compatibility data', error)
    })
  }, 500)
}

export function saveMetadataDebounced(): void {
  const characterName = contextState.activeCharacter?.file_name
  const chatId = contextState.activeChatId
  if (!characterName || !chatId) {
    recordCompatDiagnostic('saveMetadataDebounced', 'stub', 'Debounced chat metadata was kept in memory because no active character/chat is available.')
    return
  }
  const metadataSnapshot = structuredClone(chat_metadata)
  if (saveMetadataTimer !== null) {
    window.clearTimeout(saveMetadataTimer)
  }
  recordCompatDiagnostic('saveMetadataDebounced', 'partial', 'Queued chat metadata persistence through CraftTalker chat storage.')
  saveMetadataTimer = window.setTimeout(() => {
    saveMetadataTimer = null
    void persistChatMetadata(characterName, chatId, metadataSnapshot).catch(error => {
      recordCompatDiagnostic('saveMetadata', 'stub', 'Chat metadata persistence failed; see console for the native API error.')
      console.error('[ST Compat] Failed to save chat metadata', error)
    })
  }, 500)
}

export function setExtensionPrompt(
  name: string,
  value: string,
  position?: unknown,
  depth?: unknown,
  scan?: unknown,
  role?: unknown,
): void {
  if (!name) return
  extension_prompts[name] = { value, position, depth, scan, role }
}

export function getExtensionPromptByName(name: string): ExtensionPrompt | undefined {
  return extension_prompts[name]
}

export function registerMacro(name: string, handler: unknown): void {
  if (!name) return
  macroRegistry.set(name, handler)
}

export function unregisterMacro(name: string): void {
  macroRegistry.delete(name)
}

export function getExtensionManifest(name: string): ExtensionManifest | null {
  const found = Object.keys(manifests).find(extensionName =>
    extensionName === name || extensionName.endsWith(`/${name}`),
  )
  if (!found) return null
  return structuredClone(manifests[found])
}

export function renderExtensionTemplate(
  extensionName: string,
  templateId: string,
  templateData: Record<string, unknown> = {},
): string {
  const template = extensionTemplateCache.get(getExtensionTemplateCacheKey(extensionName, templateId))
  return template ? applyExtensionTemplateData(template, templateData) : ''
}

export async function renderExtensionTemplateAsync(
  extensionName: string,
  templateId: string,
  templateData: Record<string, unknown> = {},
): Promise<string> {
  const cacheKey = getExtensionTemplateCacheKey(extensionName, templateId)
  const cached = extensionTemplateCache.get(cacheKey)
  if (cached !== undefined) return applyExtensionTemplateData(cached, templateData)

  const response = await fetch(`/scripts/extensions/${encodeExtensionPath(extensionName)}/${encodeExtensionTemplatePath(templateId)}`)
  if (!response.ok) {
    console.warn('[ST Compat] Extension template was not found', extensionName, templateId)
    return ''
  }

  const template = await response.text()
  extensionTemplateCache.set(cacheKey, template)
  return applyExtensionTemplateData(template, templateData)
}

export function initializeStExtensionHost(): Promise<void> {
  if (initializePromise) return initializePromise
  initializePromise = initializeStExtensionHostOnce()
  return initializePromise
}

class SimpleMutex {
  private current = Promise.resolve()

  async runExclusive<T>(task: () => Promise<T> | T): Promise<T> {
    const previous = this.current
    let release: () => void = () => {}
    this.current = new Promise<void>(resolve => {
      release = resolve
    })
    await previous
    try {
      return await task()
    } finally {
      release()
    }
  }
}

async function initializeStExtensionHostOnce(): Promise<void> {
  publishGlobals()

  try {
    const settings = await api.extensions.getSettings()
    mergeInto(extension_settings, settings)
    normalizeExtensionSettingsShape()
  } catch (error) {
    console.warn('[ST Compat] Failed to load extension settings', error)
  }

  await eventSource.emit(event_types.EXTENSION_SETTINGS_LOADED, extension_settings)
  await eventSource.emit(event_types.SETTINGS_LOADED)
  await updateWorldInfoList().catch(error => {
    recordCompatDiagnostic('updateWorldInfoList', 'stub', 'Worldbook settings could not be loaded from CraftTalker world services.')
    console.warn('[ST Compat] Failed to load world info settings', error)
  })

  let discovered: ExtensionDiscovery[] = []
  try {
    discovered = await api.extensions.discover()
  } catch (error) {
    console.warn('[ST Compat] Failed to discover extensions', error)
  }

  extensionNames.splice(0, extensionNames.length, ...discovered.map(extension => extension.name))
  for (const key of Object.keys(extensionTypes)) {
    delete extensionTypes[key]
  }
  Object.assign(extensionTypes, Object.fromEntries(discovered.map(extension => [extension.name, extension.type])))

  await loadManifests(discovered)
  await activateExtensions()
  publishGlobals()

  await eventSource.emit(event_types.EXTENSIONS_FIRST_LOAD)
  await eventSource.emit(event_types.APP_INITIALIZED)
  await eventSource.emit(event_types.APP_READY)
}

async function loadManifests(discovered: ExtensionDiscovery[]): Promise<void> {
  await Promise.allSettled(discovered.map(async (extension) => {
    const response = await fetch(`/scripts/extensions/${encodeExtensionPath(extension.name)}/manifest.json`)
    if (!response.ok) return
    const manifest = await response.json() as ExtensionManifest
    manifests[extension.name] = manifest
  }))
}

async function activateExtensions(): Promise<void> {
  extensionLoadErrors.clear()

  const entries = Object.entries(manifests)
    .sort(([, a], [, b]) => getLoadingOrder(a) - getLoadingOrder(b) || getDisplayName(a).localeCompare(getDisplayName(b)))

  for (const [name, manifest] of entries) {
    if (activeExtensions.has(name) || isExtensionDisabled(name)) continue
    if (!hasRequiredExtensionDependencies(manifest)) {
      extensionLoadErrors.add(name)
      continue
    }

    try {
      await addExtensionStyle(name, manifest)
      await addExtensionScript(name, manifest)
      activeExtensions.add(name)
    } catch (error) {
      extensionLoadErrors.add(name)
      console.error('[ST Compat] Could not activate extension', name, error)
    }
  }
}

async function addExtensionStyle(name: string, manifest: ExtensionManifest): Promise<void> {
  if (!manifest.css || typeof manifest.css !== 'string') return
  const cssPath = manifest.css

  await new Promise<void>((resolve, reject) => {
    const id = `st-extension-css-${safeDomId(name)}`
    if (document.getElementById(id)) {
      resolve()
      return
    }

    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.type = 'text/css'
    link.href = `/scripts/extensions/${encodeExtensionPath(name)}/${encodeExtensionPath(cssPath)}`
    link.onload = () => resolve()
    link.onerror = () => reject(new Error(`Failed to load CSS for ${name}`))
    document.head.appendChild(link)
  })
}

async function addExtensionScript(name: string, manifest: ExtensionManifest): Promise<void> {
  if (!manifest.js || typeof manifest.js !== 'string') return
  const jsPath = manifest.js

  await new Promise<void>((resolve, reject) => {
    const id = `st-extension-js-${safeDomId(name)}`
    if (document.getElementById(id)) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.id = id
    script.type = 'module'
    script.async = true
    script.src = `/scripts/extensions/${encodeExtensionPath(name)}/${encodeExtensionPath(jsPath)}`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load JS for ${name}`))
    document.body.appendChild(script)
  })
}

function createDefaultExtensionSettings(): ExtensionSettings {
  return {
    apiUrl: 'http://localhost:5100',
    apiKey: '',
    autoConnect: false,
    notifyUpdates: false,
    disabledExtensions: [],
    expressionOverrides: [],
    memory: {},
    note: { default: '', chara: [], wiAddition: [] },
    caption: { refine_mode: false },
    expressions: {
      custom: [],
      showDefault: false,
      translate: false,
      allowMultiple: true,
      rerollIfSame: false,
      promptType: 'raw',
    },
    connectionManager: { selectedProfile: '', profiles: [] },
    dice: {},
    regex: [],
    regex_presets: [],
    character_allowed_regex: [],
    preset_allowed_regex: {},
    tts: {},
    sd: { prompts: {}, character_prompts: {}, character_negative_prompts: {} },
    chromadb: {},
    translate: {},
    objective: {},
    quickReply: {},
    quickReplyV2: { config: { setList: [] } },
    randomizer: { controls: [], fluctuation: 0.1, enabled: false },
    speech_recognition: {},
    rvc: {},
    hypebot: {},
    vectors: {},
    variables: { global: global_variables },
    attachments: [],
    character_attachments: {},
    disabled_attachments: [],
    gallery: { folders: {}, sort: 'dateAsc' },
  }
}

function rebuildCompatState(): void {
  currentCharacterIndex = contextState.activeCharacter
    ? contextState.characters.findIndex(character => character.file_name === contextState.activeCharacter?.file_name)
    : -1

  characters.splice(0, characters.length, ...contextState.characters.map((character, index) => createCompatCharacter(character, index)))

  chat.splice(0, chat.length, ...createCompatChatMessages(contextState.chatLines))
  normalizeCompatMessageVariables()
  syncChatMetadataFromLines()
  normalizeExtensionSettingsShape()
  normalizeChatMetadataShape()
}

function applyCharacterListSnapshot(snapshot: CharacterIndex[]): void {
  const existingByFileName = new Map(
    contextState.characters.map(character => [character.file_name, character]),
  )
  const nextCharacters = snapshot.map(entry => {
    const existing = existingByFileName.get(entry.file_name)
    return normalizeApiCharacter(entry, existing)
  })

  const activeFileName = contextState.activeCharacter?.file_name
  contextState = {
    ...contextState,
    activeCharacter: activeFileName
      ? nextCharacters.find(character => character.file_name === activeFileName) ?? null
      : contextState.activeCharacter,
    characters: nextCharacters,
  }
  rebuildCompatState()
  publishGlobals()
}

function upsertCharacterSnapshot(detail: CharacterDetail): number {
  const next = normalizeApiCharacter(detail)
  const index = contextState.characters.findIndex(character =>
    character.file_name === next.file_name
    || character.name === next.name
    || getCompatCharacterAvatar(character as unknown as Record<string, unknown>) === getCompatCharacterAvatar(next as unknown as Record<string, unknown>),
  )
  const nextCharacters = [...contextState.characters]
  if (index >= 0) {
    nextCharacters[index] = {
      ...nextCharacters[index],
      ...next,
      shallow: false,
    } as CompatCharacter
  } else {
    nextCharacters.push(next)
  }

  const activeFileName = contextState.activeCharacter?.file_name
  contextState = {
    ...contextState,
    activeCharacter: activeFileName
      ? nextCharacters.find(character => character.file_name === activeFileName) ?? contextState.activeCharacter
      : contextState.activeCharacter,
    characters: nextCharacters,
  }
  rebuildCompatState()
  publishGlobals()
  return index >= 0 ? index : nextCharacters.length - 1
}

function normalizeApiCharacter(entry: CharacterIndex | CharacterDetail, existing?: Character): CompatCharacter {
  const source = entry as (CharacterIndex | CharacterDetail) & Record<string, unknown>
  const existingSource = (existing ?? {}) as Character & Record<string, unknown>
  const hasDetailFields = 'first_mes' in source
    || 'personality' in source
    || 'scenario' in source
    || 'mes_example' in source
    || 'extensions' in source
  const hasExistingDetailFields = Boolean(existing) && (
    existingSource.first_mes !== undefined
    || existingSource.personality !== undefined
    || existingSource.scenario !== undefined
    || existingSource.mes_example !== undefined
    || existingSource.extensions !== undefined
  )

  return {
    ...existingSource,
    ...source,
    id: getStringField(source, 'file_name', stringField(source, 'name') || existing?.id || ''),
    name: getStringField(source, 'name', existing?.name ?? ''),
    avatar: typeof source.avatar === 'string' ? source.avatar : null,
    description: getStringField(source, 'description', existing?.description ?? ''),
    tags: getStringArray(source.tags ?? existing?.tags),
    creator: getStringField(source, 'creator', existing?.creator ?? ''),
    spec: getStringField(source, 'spec', existing?.spec ?? 'chara_card_v2'),
    spec_version: getStringField(source, 'spec_version', existing?.spec_version ?? '2.0'),
    created_at: typeof source.created_at === 'number' ? source.created_at : existing?.created_at,
    updated_at: typeof source.updated_at === 'number' ? source.updated_at : existing?.updated_at,
    model: existing?.model ?? 'default',
    lastMessage: existing?.lastMessage ?? '',
    pinned: existing?.pinned ?? false,
    file_name: getStringField(source, 'file_name', existing?.file_name ?? stringField(source, 'name')),
    world: typeof source.world === 'string' ? source.world : existing?.world ?? null,
    shallow: hasDetailFields ? false : !hasExistingDetailFields && existingSource.shallow !== false,
  } as CompatCharacter
}

function getStringField(source: Record<string, unknown>, key: string, fallback = ''): string {
  return typeof source[key] === 'string' ? String(source[key]) : fallback
}

function createCompatCharacter(character: Character, index: number): Record<string, unknown> {
  const source = character as Character & Record<string, unknown>
  const sourceData = asRecord(source.data)
  const sourceExtensions = asRecord(source.extensions)
  const dataExtensions = asRecord(sourceData.extensions)
  const extensions = {
    ...structuredClone(dataExtensions),
    ...structuredClone(sourceExtensions),
  }
  const world = String(source.world ?? sourceData.world ?? extensions.world ?? '')
  if (world && extensions.world == null) extensions.world = world

  const data: Record<string, unknown> = {
    ...structuredClone(sourceData),
    name: String(source.name ?? sourceData.name ?? ''),
    description: String(source.description ?? sourceData.description ?? ''),
    personality: String(source.personality ?? sourceData.personality ?? ''),
    scenario: String(source.scenario ?? sourceData.scenario ?? ''),
    first_mes: String(source.first_mes ?? sourceData.first_mes ?? ''),
    mes_example: String(source.mes_example ?? sourceData.mes_example ?? ''),
    creator_notes: String(source.creator_notes ?? sourceData.creator_notes ?? ''),
    system_prompt: String(source.system_prompt ?? sourceData.system_prompt ?? ''),
    post_history_instructions: String(source.post_history_instructions ?? sourceData.post_history_instructions ?? ''),
    alternate_greetings: getStringArray(source.alternate_greetings ?? sourceData.alternate_greetings),
    character_version: String(source.character_version ?? sourceData.character_version ?? ''),
    creator: String(source.creator ?? sourceData.creator ?? ''),
    tags: getStringArray(source.tags ?? sourceData.tags),
    extensions,
  }

  const compatCharacter: Record<string, unknown> = {
    ...source,
    name: data.name,
    avatar: getCompatCharacterAvatar(source),
    chat: source.file_name === contextState.activeCharacter?.file_name ? contextState.activeChatId : null,
    chid: index,
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    first_mes: data.first_mes,
    mes_example: data.mes_example,
    creator_notes: data.creator_notes,
    system_prompt: data.system_prompt,
    post_history_instructions: data.post_history_instructions,
    alternate_greetings: data.alternate_greetings,
    character_version: data.character_version,
    creator: data.creator,
    tags: data.tags,
    extensions,
    data,
  }

  if (typeof compatCharacter.json_data !== 'string') {
    compatCharacter.json_data = JSON.stringify({
      spec: source.spec ?? 'chara_card_v2',
      spec_version: source.spec_version ?? '2.0',
      data,
    })
  }

  return compatCharacter
}

function resolveCharacterIndex(idOrName: unknown): number {
  if (idOrName === undefined || idOrName === null || idOrName === 'current') {
    return currentCharacterIndex
  }
  if (typeof idOrName === 'string' && idOrName.trim() === '') return -1

  const numeric = Number(idOrName)
  if (Number.isInteger(numeric) && numeric >= 0 && numeric < characters.length) {
    return numeric
  }

  const text = String(idOrName).trim().toLowerCase()
  if (!text) return -1
  return characters.findIndex(character => {
    const name = String(character.name ?? '').toLowerCase()
    const fileName = String(character.file_name ?? '').toLowerCase()
    const avatar = String(character.avatar ?? '').toLowerCase()
    return text === name || text === fileName || text === avatar
  })
}

function resolveCharacterFileName(idOrName: unknown): string {
  const indexed = getCharacter(idOrName)
  if (indexed) return getPersistableCharacterName(indexed)

  const raw = String(idOrName ?? '').trim()
  if (!raw || raw === 'current') {
    return contextState.activeCharacter?.file_name ?? ''
  }

  const urlFileName = resolveCharacterFileNameFromUrl(raw)
  if (urlFileName) return urlFileName

  if (isLegacyAvatarFileName(raw)) {
    return stripLegacyAvatarExtension(raw)
  }

  return raw.includes('/') || raw.includes('\\') ? '' : raw
}

function resolveCharacterFileNameFromUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value, window.location.origin)
  } catch {
    return ''
  }

  const thumbnailFile = url.searchParams.get('file')
  if (thumbnailFile && isLegacyAvatarFileName(thumbnailFile)) {
    return stripLegacyAvatarExtension(thumbnailFile)
  }

  const apiMatch = url.pathname.match(/^\/api\/characters\/([^/]+)\/avatar$/)
  if (apiMatch?.[1]) return safeDecode(apiMatch[1])

  const basename = safeDecode(url.pathname.split('/').pop() ?? '')
  return isLegacyAvatarFileName(basename) ? stripLegacyAvatarExtension(basename) : ''
}

function getCompatCharacterAvatar(character: Record<string, unknown>): string {
  const avatar = stringField(character, 'avatar')
  if (!avatar) return ''
  if (isLegacyAvatarFileName(avatar)) return avatar

  const fileName = stringField(character, 'file_name') || stringField(character, 'name')
  if (fileName) return isLegacyAvatarFileName(fileName) ? fileName : `${fileName}.png`

  return avatar
}

function isLegacyAvatarFileName(value: string): boolean {
  return /^[^/?#\\]+\.(?:png|jpe?g|webp|gif)$/i.test(value)
}

function stripLegacyAvatarExtension(value: string): string {
  return value.replace(/\.(?:png|jpe?g|webp|gif)$/i, '')
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseExtensionFieldPath(field: unknown): Array<string | number> {
  const segments = parseVariablePath(field)
  return segments.every(isSafeObjectPathSegment) ? segments : []
}

function isSafeObjectPathSegment(segment: string | number): boolean {
  if (typeof segment === 'number') return Number.isInteger(segment) && segment >= 0
  return Boolean(segment)
    && segment !== '__proto__'
    && segment !== 'prototype'
    && segment !== 'constructor'
}

function syncCharacterJsonData(compatCharacter: Record<string, unknown>, extensions: VariableScope): void {
  let raw: Record<string, unknown> = {}
  if (typeof compatCharacter.json_data === 'string' && compatCharacter.json_data.trim()) {
    try {
      raw = asRecord(JSON.parse(compatCharacter.json_data))
    } catch {
      raw = {}
    }
  }

  const data = ensureRecord(raw, 'data')
  data.extensions = cloneCompatRecord(extensions)
  compatCharacter.json_data = JSON.stringify(raw)
}

function syncSourceCharacterExtensions(characterIndex: number, extensions: VariableScope): void {
  const source = contextState.characters[characterIndex] as (Character & Record<string, unknown>) | undefined
  if (!source) return

  source.extensions = cloneCompatRecord(extensions)
  const data = ensureRecord(source, 'data')
  data.extensions = cloneCompatRecord(extensions)
  const world = extensions.world
  if (typeof world === 'string') source.world = world
}

function getPersistableCharacterName(compatCharacter: Record<string, unknown>): string {
  return stringField(compatCharacter, 'file_name') || stringField(compatCharacter, 'name')
}

function mergeSavedCharacter(characterIndex: number, saved: Character & Record<string, unknown>): void {
  const source = contextState.characters[characterIndex] as (Character & Record<string, unknown>) | undefined
  if (source) {
    Object.assign(source, saved)
  }

  const compatCharacter = characters[characterIndex]
  if (!compatCharacter) return

  for (const key of ['created_at', 'updated_at', 'file_name', 'world'] as const) {
    if (saved[key] !== undefined) compatCharacter[key] = saved[key]
  }
  if (saved.avatar !== undefined) compatCharacter.avatar = getCompatCharacterAvatar(saved)

  const data = ensureRecord(compatCharacter, 'data')
  const extensions = ensureRecord(data, 'extensions')
  if (isPlainRecord(saved.extensions)) {
    replaceRecordContents(extensions, saved.extensions)
    compatCharacter.extensions = extensions
    syncCharacterJsonData(compatCharacter, extensions)
  }
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = value
  }
}

function isExtensionDisabled(name: string): boolean {
  const disabled = extension_settings.disabledExtensions
  if (!Array.isArray(disabled)) return false
  const shortName = name.includes('/') ? name.split('/').pop() : name
  return disabled.includes(name)
    || (shortName ? disabled.includes(shortName) : false)
    || (!name.includes('/') && disabled.includes(`third-party/${name}`))
}

function hasRequiredExtensionDependencies(manifest: ExtensionManifest): boolean {
  const dependencies = getManifestDependencies(manifest)
  return dependencies.every(dependency =>
    hasLoadedManifest(dependency)
    && !isExtensionDisabled(dependency),
  )
}

function getManifestDependencies(manifest: ExtensionManifest): string[] {
  return [...new Set([
    ...getStringArray(manifest.requires),
    ...getStringArray(manifest.dependencies),
  ])]
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    : []
}

function hasLoadedManifest(name: string): boolean {
  return Object.hasOwn(manifests, name) || Object.hasOwn(manifests, `third-party/${name}`)
}

function getLoadingOrder(manifest: ExtensionManifest): number {
  const order = Number(manifest.loading_order)
  return Number.isFinite(order) ? order : 0
}

function getDisplayName(manifest: ExtensionManifest): string {
  return String(manifest.display_name ?? '')
}

function encodeExtensionPath(value: string): string {
  return value.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function encodeExtensionTemplatePath(templateId: string): string {
  const path = templateId.endsWith('.html') ? templateId : `${templateId}.html`
  return encodeExtensionPath(path)
}

function getExtensionTemplateCacheKey(extensionName: string, templateId: string): string {
  return `${extensionName}/${templateId}`
}

function applyExtensionTemplateData(template: string, templateData: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}|<%=\s*([\w.-]+)\s*%>/g, (match, curlyKey, ejsKey) => {
    const key = String(curlyKey ?? ejsKey ?? '')
    const value = lodash.get(templateData, key)
    return value == null || typeof value === 'object' ? match : String(value)
  })
}

function safeDomId(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, '-')
}

function inferExtensionSource(stack: string): string {
  const thirdParty = /\/scripts\/extensions\/third-party\/([^/\s]+)/.exec(stack)
  if (thirdParty?.[1]) return thirdParty[1]
  const extension = /\/scripts\/extensions\/([^/\s]+)/.exec(stack)
  return extension?.[1] ?? ''
}

function createStorageFacade(prefix: string): Storage {
  return {
    get length() {
      return window.localStorage.length
    },
    clear: () => window.localStorage.clear(),
    getItem: key => window.localStorage.getItem(`${prefix}:${key}`),
    key: index => window.localStorage.key(index),
    removeItem: key => window.localStorage.removeItem(`${prefix}:${key}`),
    setItem: (key, value) => window.localStorage.setItem(`${prefix}:${key}`, value),
  }
}

function getSlashCommandText(input: unknown, options: Record<string, unknown>): string {
  if (typeof input === 'string') return input
  if (input && typeof input === 'object') {
    const candidate = input as Record<string, unknown>
    const text = candidate.command ?? candidate.text ?? candidate.message ?? candidate.input ?? candidate.source
    if (typeof text === 'string') return text
  }
  const optionText = options.command ?? options.text ?? options.message ?? options.input
  return typeof optionText === 'string' ? optionText : String(input ?? '')
}

async function executeSingleSlashCommand(text: string, options: Record<string, unknown>, incomingPipe: unknown): Promise<unknown> {
  const match = /^\/?([^\s]+)\s*(.*)$/.exec(text.trim())
  if (!match) return incomingPipe

  const command = SlashCommandParser.commands[match[1] ?? '']
  if (!command?.callback) {
    recordCompatDiagnostic('executeSlashCommands', 'stub', `Slash command "${match[1] ?? ''}" is not registered in the compatibility parser.`)
    return text
  }

  const argumentText = match[2] ?? ''
  const unnamed = getSlashUnnamedArgs(argumentText)
  const pipe = await command.callback(
    parseSlashNamedArgs(argumentText),
    unnamed || stringifySlashPipe(incomingPipe),
  )
  return unwrapSlashPipe(pipe, options)
}

function splitSlashPipeline(text: string): string[] {
  const result: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false
  for (const char of text) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      current += char
      escaped = true
      continue
    }
    if ((char === '"' || char === "'") && !escaped) {
      quote = quote === char ? null : quote ?? char
      current += char
      continue
    }
    if (char === '|' && !quote) {
      if (current.trim()) result.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) result.push(current.trim())
  return result
}

function stringifySlashPipe(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function createVariableScopeFacade(option: Record<string, unknown>): VariableScopeFacade {
  const methods: Pick<VariableScopeFacade, 'get' | 'set' | 'delete' | 'replace' | 'assign' | 'all'> = {
    get: path => getVariableValue(option, path),
    set: (path, value) => {
      setVariableValue(option, path, value)
      scheduleVariableSave(option)
      return value
    },
    delete: (path) => {
      deleteVariableValue(option, path)
      scheduleVariableSave(option)
    },
    replace: (variables) => replaceVariables(variables, option),
    assign: (variables) => insertVariables(variables, option),
    all: () => getVariables(option),
  }

  return new Proxy({} as VariableScopeFacade, {
    get: (_target, property) => {
      if (property in methods) return methods[property as keyof typeof methods]
      if (property === 'toJSON') return () => structuredClone(getVariableStore(option))
      if (typeof property === 'symbol') return undefined
      return getVariableStore(option)[property]
    },
    set: (_target, property, value) => {
      if (typeof property === 'symbol') return false
      getVariableStore(option)[property] = value
      scheduleVariableSave(option)
      return true
    },
    deleteProperty: (_target, property) => {
      if (typeof property === 'symbol') return false
      delete getVariableStore(option)[property]
      scheduleVariableSave(option)
      return true
    },
    ownKeys: () => Reflect.ownKeys(getVariableStore(option)),
    getOwnPropertyDescriptor: (_target, property) => {
      const store = getVariableStore(option)
      if (typeof property === 'symbol' || !Object.hasOwn(store, property)) return undefined
      return {
        configurable: true,
        enumerable: true,
        value: store[property],
        writable: true,
      }
    },
  })
}

function getGlobalVariables(): VariableScope {
  normalizeExtensionSettingsShape()
  return global_variables
}

function getLocalVariables(): VariableScope {
  normalizeChatMetadataShape()
  return chat_variables
}

function ensureRecord(target: Record<string, unknown>, key: string): VariableScope {
  const value = target[key]
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as VariableScope
  }
  const next: VariableScope = {}
  target[key] = next
  return next
}

function syncChatMetadataFromLines(): void {
  const header = contextState.chatLines.find(line => line.chat_metadata && typeof line.chat_metadata === 'object')
  const next = header?.chat_metadata
  if (!next || typeof next !== 'object') {
    replaceChatMetadata({ variables: {}, extensions: {} })
    return
  }
  replaceChatMetadata(next)
}

function createCompatChatMessages(lines: ChatLine[]): CompatChatMessage[] {
  return lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => 'mes' in line)
    .map(({ line, index }) => {
      const message = cloneCompatValue(line) as CompatChatMessage
      Object.defineProperties(message, {
        _lineIndex: {
          configurable: true,
          enumerable: false,
          value: index,
          writable: true,
        },
        _hadVariables: {
          configurable: true,
          enumerable: false,
          value: Object.hasOwn(line, 'variables'),
          writable: true,
        },
        _hadVariablesInitialized: {
          configurable: true,
          enumerable: false,
          value: Object.hasOwn(line, 'variables_initialized'),
          writable: true,
        },
      })
      return message
    })
}

function hasPersistableMessageVariables(line: CompatChatMessage): boolean {
  if (line._hadVariables || line._hadVariablesInitialized) return true
  if (Array.isArray(line.variables) && line.variables.some(entry => (
    entry !== null
    && typeof entry === 'object'
    && !Array.isArray(entry)
    && Object.keys(entry).length > 0
  ))) {
    return true
  }
  return Array.isArray(line.variables_initialized) && line.variables_initialized.some(Boolean)
}

function replaceChatMetadata(next: Record<string, unknown>): void {
  const nextVariables = getRecordValue(next.variables)
  const nextExtensions = getRecordValue(next.extensions)
  for (const key of Object.keys(chat_metadata)) {
    delete chat_metadata[key]
  }
  Object.assign(chat_metadata, next)
  replaceRecordContents(chat_variables, nextVariables)
  replaceRecordContents(chat_extensions, nextExtensions)
  chat_metadata.variables = chat_variables
  chat_metadata.extensions = chat_extensions
}

function normalizeExtensionSettingsShape(): void {
  const variables = ensureRecord(extension_settings, 'variables')
  if (variables.global !== global_variables) {
    replaceRecordContents(global_variables, getRecordValue(variables.global))
    variables.global = global_variables
  }
  if (!Array.isArray(extension_settings.regex)) {
    extension_settings.regex = []
  }
  if (!Array.isArray(extension_settings.regex_presets)) {
    extension_settings.regex_presets = []
  }
  const quickReplyV2 = ensureRecord(extension_settings, 'quickReplyV2')
  const quickReplyConfig = ensureRecord(quickReplyV2, 'config')
  if (!Array.isArray(quickReplyConfig.setList)) {
    quickReplyConfig.setList = []
  }
}

function normalizeChatMetadataShape(): void {
  if (chat_metadata.variables !== chat_variables) {
    replaceRecordContents(chat_variables, getRecordValue(chat_metadata.variables))
    chat_metadata.variables = chat_variables
  }
  if (chat_metadata.extensions !== chat_extensions) {
    replaceRecordContents(chat_extensions, getRecordValue(chat_metadata.extensions))
    chat_metadata.extensions = chat_extensions
  }
}

function normalizeCompatMessageVariables(): void {
  for (const line of chat) {
    normalizeMessageVariableShape(line)
  }
}

function normalizeMessageVariableShape(line: CompatChatMessage): void {
  const swipeCount = getMessageSwipeCount(line)
  const activeSwipeId = getMessageSwipeId(line, swipeCount)
  line.swipe_id = activeSwipeId
  line.variables = normalizeSwipeRecordArray(line.variables, swipeCount, activeSwipeId)
  line.variables_initialized = normalizeSwipeInitializedArray(line.variables_initialized, swipeCount)
}

function getMessageSwipeCount(line: ChatLine): number {
  return Math.max(1, Array.isArray(line.swipes) && line.swipes.length > 0 ? line.swipes.length : 1)
}

function getMessageSwipeId(line: ChatLine, swipeCount = getMessageSwipeCount(line)): number {
  const numeric = Number(line.swipe_id)
  if (!Number.isInteger(numeric)) return 0
  return Math.min(Math.max(numeric, 0), Math.max(0, swipeCount - 1))
}

function normalizeSwipeRecordArray(value: unknown, swipeCount: number, activeSwipeId: number): VariableScope[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.assign([], value)
      : []
  const result: VariableScope[] = []
  for (let index = 0; index < swipeCount; index += 1) {
    const entry = source[index]
    result[index] = entry && typeof entry === 'object' && !Array.isArray(entry)
      ? entry as VariableScope
      : {}
  }
  if (!result[activeSwipeId]) result[activeSwipeId] = {}
  return result
}

function normalizeSwipeInitializedArray(value: unknown, swipeCount: number): boolean[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.assign([], value)
      : []
  const result: boolean[] = []
  for (let index = 0; index < swipeCount; index += 1) {
    result[index] = Boolean(source[index])
  }
  return result
}

function getRecordValue(value: unknown): VariableScope {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as VariableScope : {}
}

function replaceRecordContents(target: VariableScope, source: VariableScope): void {
  if (target === source) return
  for (const key of Object.keys(target)) {
    delete target[key]
  }
  Object.assign(target, cloneCompatRecord(source))
}

function cloneCompatRecord(source: VariableScope): VariableScope {
  try {
    return structuredClone(source)
  } catch {
    return cloneCompatValue(source) as VariableScope
  }
}

function cloneCompatValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)
  if (Array.isArray(value)) {
    const next: unknown[] = []
    seen.set(value, next)
    next.push(...value.map(entry => cloneCompatValue(entry, seen)))
    return next
  }
  const next: Record<string, unknown> = {}
  seen.set(value, next)
  for (const [key, entry] of Object.entries(value)) {
    next[key] = cloneCompatValue(entry, seen)
  }
  return next
}

function createDefaultWorldInfoSettings(): StWorldInfoRuntimeSettings {
  return {
    world_info_include_names: true,
    world_info_case_sensitive: false,
    world_info_match_whole_words: false,
    world_info_use_group_scoring: false,
    world_info_max_recursion_steps: 10,
    world_info_depth: 4,
    world_info_min_activations: 0,
    world_info_min_activations_depth_max: 0,
    world_info_budget: 25,
    world_info_budget_cap: 0,
    world_info_recursive: false,
    world_info_overflow_alert: false,
    world_info_character_strategy: 0,
  }
}

function syncWorldInfoSettings(settings: StWorldInfoSettings): void {
  const defaults = createDefaultWorldInfoSettings()
  world_info_settings.world_info_include_names = booleanSetting(settings.world_info_include_names, defaults.world_info_include_names)
  world_info_settings.world_info_case_sensitive = booleanSetting(settings.world_info_case_sensitive, defaults.world_info_case_sensitive)
  world_info_settings.world_info_match_whole_words = booleanSetting(settings.world_info_match_whole_words, defaults.world_info_match_whole_words)
  world_info_settings.world_info_use_group_scoring = booleanSetting(settings.world_info_use_group_scoring, defaults.world_info_use_group_scoring)
  world_info_settings.world_info_max_recursion_steps = numberSetting(settings.world_info_max_recursion_steps, defaults.world_info_max_recursion_steps)
  world_info_settings.world_info_depth = numberSetting(settings.world_info_depth, defaults.world_info_depth)
  world_info_settings.world_info_min_activations = numberSetting(settings.world_info_min_activations, defaults.world_info_min_activations)
  world_info_settings.world_info_min_activations_depth_max = numberSetting(settings.world_info_min_activations_depth_max, defaults.world_info_min_activations_depth_max)
  world_info_settings.world_info_budget = numberSetting(settings.world_info_budget, defaults.world_info_budget)
  world_info_settings.world_info_budget_cap = numberSetting(settings.world_info_budget_cap, defaults.world_info_budget_cap)
  world_info_settings.world_info_recursive = booleanSetting(settings.world_info_recursive, defaults.world_info_recursive)
  world_info_settings.world_info_overflow_alert = booleanSetting(settings.world_info_overflow_alert, defaults.world_info_overflow_alert)
  world_info_settings.world_info_character_strategy = numberSetting(settings.world_info_character_strategy, defaults.world_info_character_strategy)
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function numberSetting(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function replaceWorldInfo(next: Record<string, unknown>): void {
  for (const key of Object.keys(world_info)) {
    delete world_info[key]
  }
  Object.assign(world_info, next)
  world_info.globalSelect = selected_world_info
  if (!Array.isArray(world_info.charLore)) world_info.charLore = []
  if (!world_info.entries || typeof world_info.entries !== 'object' || Array.isArray(world_info.entries)) {
    world_info.entries = {}
  }
}

function cacheWorldInfo(world: WorldBook): void {
  const entries = ensureRecord(world_info, 'entries')
  entries[world.name] = structuredClone(world.entries)
  if (!world_names.includes(world.name)) world_names.push(world.name)
}

async function persistChatMetadata(
  characterName: string | undefined,
  chatId: string | null | undefined,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (!characterName || !chatId) {
    recordCompatDiagnostic('saveMetadata', 'stub', 'Chat metadata was kept in memory because no active character/chat is available.')
    return
  }
  const saved = await api.chats.updateMetadata(characterName, chatId, metadata)
  if (isCurrentChat(characterName, chatId)) {
    replaceChatMetadata(saved.chat_metadata)
  }
  recordCompatDiagnostic('saveMetadata', 'partial', 'Chat metadata was written through CraftTalker chat persistence.')
}

async function persistMessageVariables(): Promise<void> {
  const characterName = contextState.activeCharacter?.file_name
  const chatId = contextState.activeChatId
  if (!characterName || !chatId) {
    recordCompatDiagnostic('saveChatConditional', 'stub', 'Message variables were kept in memory because no active character/chat is available.')
    return
  }

  const updates = chat.flatMap((line) => {
    if (typeof line._lineIndex !== 'number') return []
    normalizeMessageVariableShape(line)
    if (!hasPersistableMessageVariables(line)) return []
    return [{
      lineIndex: line._lineIndex,
      variables: cloneCompatValue(line.variables),
      variables_initialized: cloneCompatValue(line.variables_initialized),
    }]
  })

  if (!updates.length) {
    recordCompatDiagnostic('saveChatConditional', 'stub', 'No active ST message variables were available to persist.')
    return
  }

  const result = await api.chats.updateMessageVariables(characterName, chatId, updates)
  recordCompatDiagnostic(
    'saveChatConditional',
    result.updated > 0 ? 'partial' : 'stub',
    'Persisted ST message variable arrays through the typed CraftTalker message-variable bridge.',
  )
}

function isCurrentChat(characterName: string, chatId: string): boolean {
  return contextState.activeCharacter?.file_name === characterName && contextState.activeChatId === chatId
}

function getRequestedWorldName(value?: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  const active = contextState.activeCharacter as (Character & { extensions?: Record<string, unknown> }) | null
  const world = active?.world ?? active?.extensions?.world
  if (typeof world === 'string' && world.trim()) return world.trim()
  const chatWorld = chat_metadata.world_info
  if (typeof chatWorld === 'string' && chatWorld.trim()) return chatWorld.trim()
  return selected_world_info.find(name => typeof name === 'string' && name.trim()) ?? ''
}

function parseSlashNamedArgs(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const match of text.matchAll(/(?:^|\s)([\w.-]+)=("[^"]*"|'[^']*'|\S+)/g)) {
    const key = match[1]
    if (!key) continue
    result[key] = stripOuterQuotes(match[2] ?? '')
  }
  return result
}

function getSlashUnnamedArgs(text: string): string {
  return text.replace(/(?:^|\s)([\w.-]+)=("[^"]*"|'[^']*'|\S+)/g, '').trim()
}

function wrapSlashResult(value: unknown, options: Record<string, unknown>, isError: boolean): unknown {
  if (options.returnResultObject === true) {
    return {
      pipe: value == null ? '' : String(value),
      isError,
      errorMessage: isError ? String(value ?? '') : '',
    }
  }
  return value
}

function isSlashResult(value: unknown): value is { pipe: unknown, isError?: boolean } {
  return Boolean(value && typeof value === 'object' && 'pipe' in value)
}

function unwrapSlashPipe(value: unknown, options: Record<string, unknown>): unknown {
  if (isSlashResult(value)) {
    if (value.isError && options.handleErrors === false) {
      throw new Error(String((value as { errorMessage?: unknown }).errorMessage ?? value.pipe ?? 'Slash command failed'))
    }
    return value.pipe
  }
  return value
}

function getVariableStore(option: Record<string, unknown> = { type: 'chat' }): VariableScope {
  const scope = normalizeVariableScope(option.type)
  switch (scope) {
    case 'global':
      return getGlobalVariables()
    case 'chat':
    case 'local':
      return getLocalVariables()
    case 'message':
      return getMessageVariables(option.message_id)
    case 'character':
      return character_variables
    case 'preset':
      return preset_variables
    case 'script':
      if (typeof option.script_id === 'string' && option.script_id.trim()) {
        return ensureRecord(script_variables, option.script_id.trim())
      }
      return script_variables
    case 'extension':
      if (typeof option.extension_id === 'string' && option.extension_id.trim()) {
        return ensureRecord(extension_settings, option.extension_id.trim())
      }
      return ensureRecord(extension_settings, 'extensions')
    default:
      return getLocalVariables()
  }
}

function getVariableValue(option: Record<string, unknown>, path: unknown): unknown {
  const segments = parseVariablePath(path)
  if (!segments.length) return undefined
  return lodash.get(getVariableStore(option), segments)
}

function setVariableValue(option: Record<string, unknown>, path: unknown, value: unknown): void {
  const segments = parseVariablePath(path)
  if (!segments.length) return
  lodash.set(getVariableStore(option), segments, value)
}

function deleteVariableValue(option: Record<string, unknown>, path: unknown): void {
  const segments = parseVariablePath(path)
  if (!segments.length) return
  lodash.unset(getVariableStore(option), segments)
}

function getMessageVariables(messageId: unknown): VariableScope {
  const index = resolveMessageIndex(messageId)
  const line = index >= 0 ? chat[index] : undefined
  if (!line) return {}

  normalizeMessageVariableShape(line)
  const record = line.variables
  if (Array.isArray(record)) {
    const swipeId = getMessageSwipeId(line)
    return record[swipeId] as VariableScope
  }
  return {}
}

function resolveMessageIndex(messageId: unknown): number {
  if (messageId === 'latest' || messageId === undefined || messageId === null) {
    for (let index = chat.length - 1; index >= 0; index -= 1) {
      if (!chat[index]?.is_system) return index
    }
    return chat.length - 1
  }
  const numeric = Number(messageId)
  if (!Number.isInteger(numeric)) return chat.length - 1
  return numeric < 0 ? chat.length + numeric : numeric
}

function normalizeVariableScope(value: unknown): VariableScopeName {
  const scope = String(value ?? 'chat').trim().toLowerCase()
  if (scope === 'global') return 'global'
  if (scope === 'local' || scope === 'chat') return 'chat'
  if (scope === 'character') return 'character'
  if (scope === 'preset') return 'preset'
  if (scope === 'message') return 'message'
  if (scope === 'script') return 'script'
  if (scope === 'extension') return 'extension'
  return 'chat'
}

function parseVariablePath(path: unknown): Array<string | number> {
  const text = String(path ?? '').trim()
  if (!text) return []
  return text
    .replace(/\[([^\]]+)\]/g, (_, raw: string) => {
      const unquoted = stripOuterQuotes(raw.trim())
      return /^\d+$/.test(unquoted) ? `.${unquoted}` : `.${unquoted}`
    })
    .split('.')
    .map(segment => stripOuterQuotes(segment.trim()))
    .filter(Boolean)
    .map(segment => /^\d+$/.test(segment) ? Number(segment) : segment)
}

function scheduleVariableSave(option: Record<string, unknown>): void {
  const scope = normalizeVariableScope(option.type)
  if (scope === 'global' || scope === 'extension') saveSettingsDebounced()
  if (scope === 'chat') saveMetadataDebounced()
  if (scope === 'message') saveChatConditionalDebounced()
}

function stringifyMacroValue(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'string' ? value : JSON.stringify(stripPrivateVariableFields(value))
}

function stringifyYamlLike(value: unknown, indent = 0): string {
  const clean = stripPrivateVariableFields(value)
  if (clean == null) return ''
  if (typeof clean !== 'object') return String(clean)
  if (Array.isArray(clean)) {
    if (!clean.length) return '[]'
    return clean
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          return `${' '.repeat(indent)}-\n${stringifyYamlLike(entry, indent + 2)}`
        }
        return `${' '.repeat(indent)}- ${String(entry ?? '')}`
      })
      .join('\n')
  }
  const entries = Object.entries(clean)
  if (!entries.length) return '{}'
  return entries.map(([key, entry]) => {
    if (entry && typeof entry === 'object') {
      return `${' '.repeat(indent)}${key}:\n${stringifyYamlLike(entry, indent + 2)}`
    }
    return `${' '.repeat(indent)}${key}: ${String(entry ?? '')}`
  }).join('\n')
}

function stripPrivateVariableFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPrivateVariableFields)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('$'))
      .map(([key, entry]) => [key, stripPrivateVariableFields(entry)]),
  )
}

function stripOuterQuotes(value: string): string {
  const text = String(value ?? '').trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1)
  }
  return text
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return Boolean(value && typeof (value as { then?: unknown }).then === 'function')
}

function recordCompatDiagnostic(id: string, status: CompatDiagnosticStatus, note: string): void {
  const current = diagnostics.get(id)
  diagnostics.set(id, {
    id,
    status,
    note,
    count: (current?.count ?? 0) + 1,
    lastCalledAt: new Date().toISOString(),
  })
}

export function getDiagnostics(): CompatDiagnosticEntry[] {
  return structuredClone([...diagnostics.values()].sort((a, b) => a.id.localeCompare(b.id)))
}

export function resetDiagnostics(): void {
  diagnostics.clear()
}

function createBuiltinFacade(): Record<string, unknown> {
  return {
    getContext,
    eventSource,
    event_types,
    executeSlashCommands,
    executeSlashCommandsWithOptions,
    STscript,
    substituteParams: replaceVariableMacros,
    substituteParamsExtended: replaceVariableMacros,
    getLocalVariable,
    setLocalVariable,
    getGlobalVariable,
    setGlobalVariable,
    getVariables,
    replaceVariables,
    updateVariablesWith,
    insertVariables,
    insertOrAssignVariables,
    deleteVariable,
    saveSettingsDebounced,
    saveMetadataDebounced,
    saveChatConditional,
    saveChatConditionalDebounced,
    messageFormatting,
    reloadMarkdownProcessor,
    updateMessageBlock,
    printMessages,
    clearChat,
    addOneMessage,
    appendMediaToMessage,
    addCopyToCodeBlocks,
  }
}

async function runTavernHelperGeneration(
  diagnosticId: 'TavernHelper.generate' | 'TavernHelper.generateRaw',
  input: unknown,
  usePreset: boolean,
): Promise<string> {
  const config = normalizeTavernHelperGenerationConfig(input)
  const request = buildTavernHelperGenerationRequest(config, usePreset)
  if (!request) {
    recordCompatDiagnostic(diagnosticId, 'stub', 'Background generation needs custom_api or ST oai_settings with an endpoint/key/model before it can call the governed backend bridge.')
    return ''
  }

  if (tavernHelperGenerations.has(request.generationId)) {
    recordCompatDiagnostic(diagnosticId, 'blocked', `Background generation "${request.generationId}" is already running.`)
    throw new Error(`TavernHelper generation "${request.generationId}" is already running.`)
  }

  const controller = new AbortController()
  tavernHelperGenerations.set(request.generationId, { controller })

  try {
    await eventSource.emit(event_types.GENERATION_STARTED, request.generationId)
    await eventSource.emit(event_types.JS_GENERATION_STARTED, request.generationId)
    await eventSource.emit(event_types.CHAT_COMPLETION_SETTINGS_READY, structuredClone(request.payload))

    const response = await fetch('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: getRequestHeaders(),
      cache: 'no-cache',
      body: JSON.stringify(request.payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(await response.text() || `Backend generation failed with HTTP ${response.status}`)
    }

    const text = request.stream
      ? await readTavernHelperStream(response, request.generationId)
      : extractCompletionText(await response.json())
    const beforeEndPayload = { message: text }

    await eventSource.emit(event_types.GENERATION_BEFORE_END, beforeEndPayload, request.generationId)
    const finalText = String(beforeEndPayload.message ?? '')
    await eventSource.emit(event_types.JS_GENERATION_ENDED, finalText, request.generationId)
    await eventSource.emit(event_types.GENERATION_ENDED, finalText, request.generationId)
    recordCompatDiagnostic(diagnosticId, 'partial', 'Background generation used CraftTalker ST backend bridge without writing chat rows, runs, or plugin state.')
    return finalText
  } catch (error) {
    if (isAbortError(error)) {
      recordCompatDiagnostic(diagnosticId, 'partial', `Background generation "${request.generationId}" was stopped through the governed cancellation bridge.`)
      return ''
    }
    recordCompatDiagnostic(diagnosticId, 'stub', 'Background generation failed through the CraftTalker ST backend bridge; see console for the provider error.')
    console.warn('[ST Compat] TavernHelper background generation failed', error)
    return ''
  } finally {
    tavernHelperGenerations.delete(request.generationId)
  }
}

function stopTavernHelperGenerationById(generationId: unknown): boolean {
  const id = String(generationId ?? '').trim()
  const entry = tavernHelperGenerations.get(id)
  if (!id || !entry) {
    recordCompatDiagnostic('TavernHelper.stopGenerationById', 'stub', 'No matching TavernHelper background generation was active.')
    return false
  }

  entry.controller.abort()
  tavernHelperGenerations.delete(id)
  void eventSource.emit(event_types.GENERATION_STOPPED, id)
  recordCompatDiagnostic('TavernHelper.stopGenerationById', 'partial', 'Stopped one TavernHelper background generation through AbortController.')
  return true
}

function stopAllTavernHelperGenerations(): boolean {
  const entries = [...tavernHelperGenerations.entries()]
  if (!entries.length) {
    recordCompatDiagnostic('TavernHelper.stopAllGeneration', 'stub', 'No TavernHelper background generations were active.')
    return false
  }

  for (const [id, entry] of entries) {
    entry.controller.abort()
    void eventSource.emit(event_types.GENERATION_STOPPED, id)
  }
  tavernHelperGenerations.clear()
  recordCompatDiagnostic('TavernHelper.stopAllGeneration', 'partial', 'Stopped all TavernHelper background generations through AbortController.')
  return true
}

function normalizeTavernHelperGenerationConfig(input: unknown): TavernHelperGenerationConfig {
  if (typeof input === 'string') return { user_input: input }
  if (isPlainRecord(input)) return input as TavernHelperGenerationConfig
  return {}
}

function buildTavernHelperGenerationRequest(
  config: TavernHelperGenerationConfig,
  usePreset: boolean,
): TavernHelperGenerationRequest | null {
  const customApi = asRecord(config.custom_api)
  const settings = getStOaiSettings()
  if (!hasTavernHelperBackendConfig(customApi, settings)) return null

  const source = stringField(customApi, 'source')
    || stringField(settings, 'chat_completion_source')
    || 'openai'
  const apiUrl = normalizeBaseUrl(stringField(customApi, 'apiurl')
    || stringField(settings, 'reverse_proxy')
    || stringField(settings, 'custom_url'))
  const apiKey = stringField(customApi, 'key') || stringField(settings, 'proxy_password')
  const model = stringField(customApi, 'model')
    || stringField(settings, 'model')
    || stringField(settings, 'openai_model')
  const stream = Boolean(config.should_stream)
  const payload: Record<string, unknown> = {
    chat_completion_source: source,
    messages: createTavernHelperMessages(config, usePreset),
    stream,
  }

  setPayloadString(payload, 'model', model)
  setPayloadString(payload, 'reverse_proxy', apiUrl)
  setPayloadString(payload, 'proxy_password', apiKey)
  if (source === 'custom') setPayloadString(payload, 'custom_url', apiUrl)
  setPayloadString(payload, 'apiKeySessionId', stringField(customApi, 'apiKeySessionId') || stringField(settings, 'apiKeySessionId'))
  setPayloadString(payload, 'custom_include_headers', stringField(customApi, 'custom_include_headers') || stringField(settings, 'custom_include_headers'))
  setPayloadString(payload, 'custom_include_body', stringField(customApi, 'custom_include_body') || stringField(settings, 'custom_include_body'))
  setPayloadString(payload, 'custom_exclude_body', stringField(customApi, 'custom_exclude_body') || stringField(settings, 'custom_exclude_body'))
  setPayloadString(payload, 'azure_base_url', stringField(customApi, 'azure_base_url') || stringField(settings, 'azure_base_url'))
  setPayloadString(payload, 'azure_deployment_name', stringField(customApi, 'azure_deployment_name') || stringField(settings, 'azure_deployment_name'))
  setPayloadString(payload, 'azure_api_version', stringField(customApi, 'azure_api_version') || stringField(settings, 'azure_api_version'))
  setPayloadNumber(payload, 'max_tokens', customApi.max_tokens, settings.openai_max_tokens)
  setPayloadNumber(payload, 'temperature', customApi.temperature, settings.temp_openai)
  setPayloadNumber(payload, 'top_p', customApi.top_p, settings.top_p_openai)
  setPayloadNumber(payload, 'top_k', customApi.top_k, settings.top_k_openai)
  setPayloadNumber(payload, 'frequency_penalty', customApi.frequency_penalty, settings.freq_pen_openai)
  setPayloadNumber(payload, 'presence_penalty', customApi.presence_penalty, settings.pres_pen_openai)
  setPayloadNumber(payload, 'repetition_penalty', customApi.repetition_penalty, settings.repetition_penalty_openai)

  if (Array.isArray(config.tools) && config.tools.length > 0) payload.tools = structuredClone(config.tools)
  if (config.tool_choice !== undefined) payload.tool_choice = structuredClone(config.tool_choice)
  if (config.json_schema !== undefined) payload.json_schema = structuredClone(config.json_schema)

  return {
    generationId: stringField(config, 'generation_id') || createTavernHelperGenerationId(),
    payload: removeUndefinedFields(payload),
    stream,
  }
}

function hasTavernHelperBackendConfig(customApi: Record<string, unknown>, settings: Record<string, unknown>): boolean {
  return Boolean(
    stringField(customApi, 'apiurl')
    || stringField(customApi, 'key')
    || stringField(settings, 'reverse_proxy')
    || stringField(settings, 'custom_url')
    || stringField(settings, 'proxy_password')
    || stringField(settings, 'apiKeySessionId')
    || stringField(settings, 'azure_base_url')
    || stringField(settings, 'azure_deployment_name'),
  )
}

function createTavernHelperMessages(config: TavernHelperGenerationConfig, usePreset: boolean): StGenerationMessage[] {
  const explicit = normalizeGenerationMessages(config.messages ?? config.prompt)
  if (explicit.length) return explicit

  const ordered = Array.isArray(config.ordered_prompts) ? config.ordered_prompts : []
  if (ordered.length) {
    const messages = ordered.flatMap(prompt => messagesFromOrderedPrompt(prompt, config))
    return messages.length ? messages : [{ role: 'user', content: getGenerationUserInput(config) }]
  }

  const messages: StGenerationMessage[] = []
  if (usePreset) {
    const description = getPromptPlaceholderText('char_description', config)
    if (description) messages.push({ role: 'system', content: description })
  }
  messages.push(...messagesFromInjects(config.injects))
  messages.push(...chatHistoryMessages(config.max_chat_history))
  messages.push({ role: 'user', content: getGenerationUserInput(config) })
  return messages.filter(message => message.content.trim() !== '')
}

function messagesFromOrderedPrompt(prompt: unknown, config: TavernHelperGenerationConfig): StGenerationMessage[] {
  if (isPlainRecord(prompt)) {
    const content = stringField(prompt, 'content')
    if (!content) return []
    return [{ role: normalizeGenerationRole(prompt.role), content: replaceVariableMacros(content) }]
  }
  const placeholder = String(prompt ?? '').trim()
  if (!placeholder) return []
  if (placeholder === 'chat_history') return chatHistoryMessages(config.max_chat_history)
  if (placeholder === 'user_input') return [{ role: 'user', content: getGenerationUserInput(config) }]
  const content = getPromptPlaceholderText(placeholder, config)
  return content ? [{ role: 'system', content }] : []
}

function messagesFromInjects(injects: unknown): StGenerationMessage[] {
  if (!Array.isArray(injects)) return []
  return injects.flatMap((inject) => {
    if (!isPlainRecord(inject)) return []
    const content = stringField(inject, 'content')
    if (!content) return []
    return [{ role: normalizeGenerationRole(inject.role), content: replaceVariableMacros(content) }]
  })
}

function normalizeGenerationMessages(value: unknown): StGenerationMessage[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isPlainRecord(entry)) return []
    const content = generationContentToText(entry.content)
    if (!content.trim()) return []
    return [{ role: normalizeGenerationRole(entry.role), content }]
  })
}

function chatHistoryMessages(maxChatHistory: unknown): StGenerationMessage[] {
  const limit = getChatHistoryLimit(maxChatHistory)
  if (limit === 0) return []
  const source = limit === Infinity ? chat : chat.slice(Math.max(0, chat.length - limit))
  return source
    .filter(line => typeof line.mes === 'string' && line.mes.trim() !== '')
    .map(line => ({
      role: line.is_system ? 'system' : line.is_user ? 'user' : 'assistant',
      content: line.mes ?? '',
    }))
}

function getChatHistoryLimit(maxChatHistory: unknown): number {
  if (maxChatHistory === 'all') return Infinity
  const numeric = Number(maxChatHistory)
  if (Number.isFinite(numeric)) return Math.max(0, Math.floor(numeric))
  return 20
}

function getPromptPlaceholderText(placeholder: string, config: TavernHelperGenerationConfig): string {
  const overrides = asRecord(config.overrides)
  const character = contextState.activeCharacter as (Character & Record<string, unknown>) | null
  const value = stringField(overrides, placeholder)
  if (value) return replaceVariableMacros(value)

  switch (placeholder) {
    case 'char_description':
      return replaceVariableMacros(character?.description ?? '')
    case 'char_personality':
      return replaceVariableMacros(String(character?.personality ?? ''))
    case 'scenario':
      return replaceVariableMacros(String(character?.scenario ?? ''))
    case 'dialogue_examples':
      return replaceVariableMacros(String(character?.mes_example ?? ''))
    case 'world_info_before':
    case 'world_info_after':
    case 'persona_description':
      return ''
    default:
      return ''
  }
}

function getGenerationUserInput(config: TavernHelperGenerationConfig): string {
  const value = config.user_input
    || stringField(config, 'text')
    || stringField(config, 'content')
    || (typeof config.prompt === 'string' ? config.prompt : '')
  return replaceVariableMacros(value)
}

async function readTavernHelperStream(response: Response, generationId: string): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split(/\r?\n\r?\n/)
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const chunk = parseSseTextChunk(part)
        if (chunk === null) continue
        if (chunk === '[DONE]') return text
        const incremental = extractCompletionText(parseJsonSafely(chunk))
        if (!incremental) continue
        text += incremental
        await eventSource.emit(event_types.STREAM_TOKEN_RECEIVED_FULLY, text, generationId)
        await eventSource.emit(event_types.STREAM_TOKEN_RECEIVED_INCREMENTALLY, incremental, generationId)
        await eventSource.emit(event_types.STREAM_TOKEN_RECEIVED, text, generationId)
      }
    }
  } finally {
    reader.releaseLock()
  }

  return text
}

function parseSseTextChunk(rawEvent: string): string | null {
  const lines = rawEvent.split(/\r?\n/)
  const data = lines
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
    .trim()
  return data || null
}

function extractCompletionText(data: unknown): string {
  if (!isPlainRecord(data)) return ''
  const choices = Array.isArray(data.choices) ? data.choices : []
  const first = choices[0]
  if (isPlainRecord(first)) {
    if (isPlainRecord(first.delta)) {
      const deltaContent = generationContentToText(first.delta.content)
      if (deltaContent) return deltaContent
    }
    if (isPlainRecord(first.message)) {
      const messageContent = generationContentToText(first.message.content)
      if (messageContent) return messageContent
    }
    const text = generationContentToText(first.text)
    if (text) return text
  }
  return generationContentToText(data.content ?? data.message)
}

function generationContentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part
        if (isPlainRecord(part) && typeof part.text === 'string') return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (isPlainRecord(content) && typeof content.text === 'string') return content.text
  return ''
}

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function getStOaiSettings(): Record<string, unknown> {
  return window.oai_settings ?? window.openai_settings ?? {}
}

function normalizeGenerationRole(value: unknown): StGenerationRole {
  return value === 'system' || value === 'assistant' || value === 'user' ? value : 'user'
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function setPayloadString(payload: Record<string, unknown>, key: string, value: string): void {
  if (value) payload[key] = value
}

function setPayloadNumber(payload: Record<string, unknown>, key: string, ...values: unknown[]): void {
  for (const value of values) {
    if (value === 'same_as_preset' || value === 'unset') continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      payload[key] = numeric
      return
    }
  }
}

function removeUndefinedFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ''))
}

function stringField(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {}
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError')
}

function createTavernHelperGenerationId(): string {
  return `crafttalker-th-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createTavernHelperFacade(): Record<string, unknown> {
  return {
    builtin: builtinFacade,
    tavern_events: event_types,
    iframe_events: event_types,
    getTavernHelperVersion: () => 'crafttalker-compat',
    getFrontendVersion: () => 'crafttalker-compat',
    getTavernVersion: () => CLIENT_VERSION,
    triggerSlash: STscript,
    triggerSlashWithResult: STscript,
    substitudeMacros: replaceVariableMacros,
    substituteMacros: replaceVariableMacros,
    registerMacroLike,
    unregisterMacroLike,
    registerVariableSchema: () => {},
    getVariables,
    replaceVariables,
    updateVariablesWith,
    insertOrAssignVariables,
    insertVariables,
    deleteVariable,
    getChatMessages: () => structuredClone(chat),
    getLastMessageId: () => Math.max(0, chat.length - 1),
    getMessageId: () => Math.max(0, chat.length - 1),
    getCharacterNames: () => characters.map(character => String(character.name ?? '')).filter(Boolean),
    getCharacterIds: () => characters.map((_, index) => index),
    getCurrentCharacterName: () => contextState.activeCharacter?.name ?? '',
    getCurrentCharacterId: () => currentCharacterIndex,
    getCharacter: (id?: unknown) => structuredClone(characters[Number(id ?? currentCharacterIndex)] ?? null),
    getWorldbookNames: () => structuredClone(world_names),
    getGlobalWorldbookNames: () => structuredClone(selected_world_info),
    getWorldbook: async (name?: unknown) => {
      const worldName = getRequestedWorldName(name)
      if (!worldName) {
        recordCompatDiagnostic('TavernHelper.getWorldbook', 'stub', 'No active or requested worldbook was available for a read-only lookup.')
        return []
      }
      const world = await loadWorldInfo(worldName)
      recordCompatDiagnostic('TavernHelper.getWorldbook', world ? 'partial' : 'stub', 'Worldbook reads use CraftTalker world services in read-only mode.')
      return world ? Object.values(world.entries) : []
    },
    getLorebooks: async () => {
      await updateWorldInfoList().catch(() => {})
      return structuredClone(world_names)
    },
    getLorebookSettings: () => structuredClone(world_info),
    generate: (config?: unknown) => runTavernHelperGeneration('TavernHelper.generate', config, true),
    generateRaw: (config?: unknown) => runTavernHelperGeneration('TavernHelper.generateRaw', config, false),
    stopGenerationById: (generationId?: unknown) => stopTavernHelperGenerationById(generationId),
    stopAllGeneration: () => stopAllTavernHelperGenerations(),
    playAudio: () => recordCompatDiagnostic('TavernHelper.playAudio', 'stub', 'Plugin audio playback is not wired to a native media bridge yet.'),
    pauseAudio: () => recordCompatDiagnostic('TavernHelper.pauseAudio', 'stub', 'Plugin audio playback is not wired to a native media bridge yet.'),
    getAudioList: () => [],
    replaceAudioList: () => recordCompatDiagnostic('TavernHelper.replaceAudioList', 'stub', 'Plugin audio queues are not persisted or played by CraftTalker yet.'),
    appendAudioList: () => recordCompatDiagnostic('TavernHelper.appendAudioList', 'stub', 'Plugin audio queues are not persisted or played by CraftTalker yet.'),
    getAudioSettings: () => ({}),
    setAudioSettings: () => recordCompatDiagnostic('TavernHelper.setAudioSettings', 'stub', 'Plugin audio settings are not wired to native settings yet.'),
    getCurrentAudio: () => null,
    _bind: {
      _eventOn: eventSource.on.bind(eventSource),
      _eventOnce: eventSource.once.bind(eventSource),
      _eventEmit: eventSource.emit.bind(eventSource),
      _eventEmitAndWait: eventSource.emitAndWait.bind(eventSource),
      _eventMakeFirst: eventSource.makeFirst.bind(eventSource),
      _eventMakeLast: eventSource.makeLast.bind(eventSource),
      _eventRemoveListener: eventSource.removeListener.bind(eventSource),
      _registerMacroLike: registerMacroLike,
      _getVariables: getVariables,
      _replaceVariables: replaceVariables,
      _updateVariablesWith: updateVariablesWith,
      _insertOrAssignVariables: insertOrAssignVariables,
      _insertVariables: insertVariables,
      _deleteVariable: deleteVariable,
      _getCurrentMessageId: () => Math.max(0, chat.length - 1),
      _reloadIframe: () => {},
      _errorCatched: (callback: unknown) => callback,
      _getIframeName: () => '',
      _getScriptId: () => '',
    },
  }
}

function createXiaobaixStreamingGeneration() {
  const sessions = new Map<string, XbStreamingStatus>()

  const getStatus = (sessionId: unknown): XbStreamingStatus => {
    const id = String(sessionId ?? '')
    return sessions.get(id) ?? { isStreaming: false, text: '', error: null }
  }

  const xbgenrawCommand = async (args: Record<string, unknown> = {}): Promise<string> => {
    const wantsStream = String(args.nonstream ?? 'false') !== 'true'
    const sessionId = String(args.id ?? `crafttalker-xbgen-${Date.now()}`)
    const text = await resolveXbgenText(args)

    if (!wantsStream) return text

    sessions.set(sessionId, { isStreaming: true, text: '', error: null })
    window.setTimeout(() => {
      sessions.set(sessionId, { isStreaming: false, text, error: null })
      void eventSource.emit('xiaobaix_generation_finished', sessionId, text)
    }, 0)
    return sessionId
  }

  const cancel = (sessionId: unknown): void => {
    const id = String(sessionId ?? '')
    const current = getStatus(id)
    sessions.set(id, { ...current, isStreaming: false })
    void eventSource.emit('xiaobaix_generation_cancelled', id)
  }

  return { xbgenrawCommand, getStatus, cancel }
}

async function resolveXbgenText(args: Record<string, unknown>): Promise<string> {
  const command = typeof args.command === 'string' ? args.command : typeof args.prompt === 'string' ? args.prompt : ''
  if (command.trim().startsWith('/')) {
    const result = await STscript(command)
    return String(result ?? '')
  }

  if (typeof args.text === 'string') return replaceVariableMacros(args.text)
  if (typeof args.bottomassistant === 'string') return replaceVariableMacros(args.bottomassistant)
  return ''
}

function createYamlFacade(): NonNullable<Window['YAML']> {
  return {
    parse: parseYamlLike,
    stringify: value => stringifyYamlLike(value),
    parseDocument: value => {
      const data = parseYamlLike(value)
      return {
        data,
        getIn: (path: Array<string | number>) => lodash.get(data, path),
        setIn: (path: Array<string | number>, nextValue: unknown) => lodash.set(data as object, path, nextValue),
        toString: () => stringifyYamlLike(data),
      }
    },
  }
}

function parseYamlLike(value: unknown): unknown {
  const text = String(value ?? '').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    const result: Record<string, unknown> = {}
    for (const line of text.split(/\r?\n/)) {
      const match = /^([^:#]+):\s*(.*)$/.exec(line)
      if (!match) continue
      result[match[1]?.trim() ?? ''] = parseYamlScalar(match[2] ?? '')
    }
    return result
  }
}

function parseYamlScalar(value: string): unknown {
  const text = value.trim()
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text)
  return stripOuterQuotes(text)
}

function createZodFacade(): Record<string, unknown> {
  const schema = createZodSchemaFacade()
  return new Proxy({}, {
    get: (_target, property) => {
      if (property === 'ZodError') return Error
      if (property === 'NEVER') return Symbol.for('crafttalker.st_compat.zod_never')
      return schema
    },
  })
}

function createZodSchemaFacade(): Record<string, unknown> & ((...args: unknown[]) => unknown) {
  type ZodSchemaFacade = Record<string, unknown> & ((...args: unknown[]) => unknown)
  let schema: ZodSchemaFacade
  const target = () => schema
  schema = new Proxy(target, {
    apply: () => schema,
    get: (_target, property) => {
      if (property === 'parse') return (value: unknown) => value
      if (property === 'safeParse') return (value: unknown) => ({ success: true, data: value })
      if (property === 'toJSON') return () => ({})
      if (property === 'then') return undefined
      return schema
    },
  }) as ZodSchemaFacade
  return schema
}

const builtinFacade = createBuiltinFacade()
const tavernHelperFacade = createTavernHelperFacade()
const xiaobaixStreamingGeneration = createXiaobaixStreamingGeneration()

const stHost: StHostApi = {
  CLIENT_VERSION,
  ARGUMENT_TYPE,
  SlashCommand,
  SlashCommandArgument,
  SlashCommandNamedArgument,
  SlashCommandEnumValue,
  SlashCommandClosure,
  SlashCommandParser,
  chat,
  characters,
  event_types,
  eventSource,
  extension_settings,
  extensionNames,
  extensionTypes,
  extension_prompts,
  chat_metadata,
  world_info,
  world_info_settings,
  world_names,
  selected_world_info,
  variables: {
    global: global_variable_facade,
    local: chat_variable_facade,
    getGlobalVariable,
    setGlobalVariable,
    getLocalVariable,
    setLocalVariable,
  },
  getContext,
  getExtensionManifest,
  getRequestHeaders,
  loadWorldInfo,
  updateWorldInfoList,
  initialize: initializeStExtensionHost,
  ModuleWorkerWrapper: SimpleMutex,
  registerMacro,
  unregisterMacro,
  registerMacroLike,
  unregisterMacroLike,
  replaceVariableMacros,
  messageFormatting,
  reloadMarkdownProcessor,
  registerSlashCommand,
  STscript,
  executeSlashCommands,
  executeSlashCommandsWithOptions: executeSlashCommandsWithResultObject,
  renderExtensionTemplate,
  renderExtensionTemplateAsync,
  getCharacter,
  getCharacters,
  getOneCharacter,
  unshallowCharacter,
  writeExtensionField,
  writeExtensionFieldBulk,
  updateMessageBlock,
  printMessages,
  clearChat,
  addOneMessage,
  appendMediaToMessage,
  addCopyToCodeBlocks,
  saveChatConditional,
  saveChatConditionalDebounced,
  saveMetadata,
  saveMetadataDebounced,
  saveSettings,
  saveSettingsDebounced,
  setExtensionPrompt,
  getExtensionPromptByName,
  getGlobalVariable,
  setGlobalVariable,
  getLocalVariable,
  setLocalVariable,
  getVariables,
  replaceVariables,
  updateVariablesWith,
  insertVariables,
  insertOrAssignVariables,
  deleteVariable,
  TavernHelper: tavernHelperFacade,
  builtin: builtinFacade,
  xiaobaixStreamingGeneration,
  updateTemplateVariables,
  updateContext: updateStExtensionContext,
  recordCompatDiagnostic,
  getDiagnostics,
  resetDiagnostics,
}

function publishGlobals(): void {
  installGlobalLibraries()
  ensureStCompatDomAnchors()
  syncCompatDomState()

  stHost.extensionNames = extensionNames
  stHost.extensionTypes = extensionTypes
  stHost.variables.global = global_variable_facade
  stHost.variables.local = chat_variable_facade

  window.CraftTalker = {
    ...(window.CraftTalker ?? {}),
    stHost,
  }
  window.SillyTavern = stHost
  window.extension_settings = extension_settings
  window.eventSource = eventSource
  window.chat_metadata = chat_metadata
  window.getContext = getContext
  window.saveSettingsDebounced = saveSettingsDebounced
  window.saveChatConditional = saveChatConditional
  window.saveChatConditionalDebounced = saveChatConditionalDebounced
  window.getCharacters = getCharacters
  window.getOneCharacter = getOneCharacter
  window.unshallowCharacter = unshallowCharacter
  window.STscript = STscript
  window.TavernHelper = tavernHelperFacade
  window.builtin = builtinFacade
  window.registerMacroLike = registerMacroLike
  window.unregisterMacroLike = unregisterMacroLike
  window.xiaobaixStreamingGeneration = xiaobaixStreamingGeneration
  window.updateTemplateVariables = updateTemplateVariables
  window.executeSlashCommands = executeSlashCommands
  window.executeSlashCommandsWithOptions = executeSlashCommandsWithResultObject
  window.messageFormatting = messageFormatting
  window.reloadMarkdownProcessor = reloadMarkdownProcessor
  window.updateMessageBlock = updateMessageBlock
  window.printMessages = printMessages
  window.clearChat = clearChat
  window.addOneMessage = addOneMessage
}

function installGlobalLibraries(): void {
  window.$ ??= jquery
  window.jQuery ??= jquery
  window._ ??= lodash
  window.hljs ??= hljs
  window.toastr ??= toastr
  window.showdown ??= showdown
  window.Popper ??= Popper
  window.YAML ??= createYamlFacade()
  window.z ??= createZodFacade()
  installSortableShim(window.$)
}

function syncCompatDomState(): void {
  syncStCompatDomState({
    chat,
    selectedWorldInfo: selected_world_info,
    worldNames: world_names,
  })
}

function getCompatChatRootElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#crafttalker-st-compat-root [data-st-compat-anchor="chat"]')
    ?? document.querySelector<HTMLElement>('#crafttalker-st-compat-root #chat')
}

function getCompatMessageElement(index: number): HTMLElement | null {
  return getCompatChatRootElement()?.querySelector<HTMLElement>(`.mes[mesid="${index}"]`) ?? null
}

function renderCompatMessageBlock(index: number, message: CompatChatMessage): void {
  const element = getCompatMessageElement(index)
  if (!element) return
  element.setAttribute('mesid', String(index))
  element.setAttribute('ch_name', String(message.name ?? ''))
  element.setAttribute('is_user', String(Boolean(message.is_user)))
  element.setAttribute('is_system', String(Boolean(message.is_system)))
  element.setAttribute('swipeid', String(message.swipe_id ?? 0))

  const name = element.querySelector<HTMLElement>('.ch_name .name_text')
  if (name) name.textContent = String(message.name ?? '')

  const text = element.querySelector<HTMLElement>('.mes_text')
  if (text) {
    text.innerHTML = messageFormatting(
      message.mes ?? '',
      String(message.name ?? ''),
      Boolean(message.is_system),
      Boolean(message.is_user),
      index,
    )
  }
}

function clearCompatChatDom(): void {
  const chatRoot = getCompatChatRootElement()
  if (!chatRoot) return
  chatRoot.querySelectorAll('.mes').forEach(message => message.remove())
}

async function emitMessageRendered(index: number, message: CompatChatMessage): Promise<void> {
  await eventSource.emit(
    message.is_user ? event_types.USER_MESSAGE_RENDERED : event_types.CHARACTER_MESSAGE_RENDERED,
    index,
  )
}

function getElementFromMaybeJQuery(value: unknown): Element | null {
  if (value instanceof Element) return value
  if (!value || typeof value !== 'object') return null
  const maybeJQuery = value as { get?: (index: number) => unknown; 0?: unknown }
  const element = typeof maybeJQuery.get === 'function' ? maybeJQuery.get(0) : maybeJQuery[0]
  return element instanceof Element ? element : null
}

function syncCompatWorldSelects(): void {
  syncStCompatWorldSelects({
    selectedWorldInfo: selected_world_info,
    worldNames: world_names,
  })
}

function installSortableShim($: typeof jquery | undefined): void {
  const fn = ($ as JQueryStaticWithPlugins | undefined)?.fn
  if (!fn || typeof fn.sortable === 'function') return

  fn.sortable = function sortableCompat(this: JQuery, optionsOrAction?: SortableOptions | SortableAction, ...args: unknown[]) {
    if (typeof optionsOrAction === 'string') {
      switch (optionsOrAction) {
        case 'toArray':
          return sortableIds(this)
        case 'instance':
          return this.data('crafttalker-sortable') ?? undefined
        case 'destroy':
          this.removeData('crafttalker-sortable')
          return this
        case 'option':
          return args.length > 1 ? this : undefined
        case 'disable':
        case 'enable':
        case 'refresh':
          return this
        default:
          console.warn('[ST Compat] jQuery sortable action is not implemented', optionsOrAction)
          return this
      }
    }

    const instance = {
      options: optionsOrAction ?? {},
      refresh: () => this,
      destroy: () => {
        this.removeData('crafttalker-sortable')
        return this
      },
      toArray: () => sortableIds(this),
    }
    this.data('crafttalker-sortable', instance)
    return this
  }
}

function sortableIds(collection: JQuery): string[] {
  const source = collection.length === 1 && collection[0]
    ? Array.from(collection[0].children)
    : collection.toArray()
  return source
    .map(element => element.id || element.getAttribute('data-id') || element.getAttribute('data-task-id') || '')
    .filter(Boolean)
}

publishGlobals()
