import { api, type ChatLine, type ExtensionDiscovery, type ExtensionManifest, type ExtensionSettings } from '@/lib/api'
import type { Character, ChatMessage } from '@/types'
import * as Popper from '@popperjs/core'
import hljs from 'highlight.js/lib/common'
import jquery from 'jquery'
import lodash from 'lodash'
import showdown from 'showdown'
import toastr from 'toastr'

type Listener = (...args: unknown[]) => unknown | Promise<unknown>
type SlashCommandCallback = (namedArgs: Record<string, unknown>, unnamedArgs: string) => unknown | Promise<unknown>
type VariableScope = Record<string, unknown>
type VariableScopeName = 'global' | 'chat' | 'local' | 'character' | 'preset' | 'message' | 'script' | 'extension'
type SortableAction = 'destroy' | 'disable' | 'enable' | 'instance' | 'option' | 'refresh' | 'toArray'
type SortableOptions = Record<string, unknown>
type MacroLikeContext = {
  message_id?: number | 'latest'
  role?: string
}
type MacroLikeReplacement = (context: MacroLikeContext, substring: string, ...args: string[]) => unknown
type XbStreamingStatus = {
  isStreaming: boolean
  text: string
  error: string | null
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
  chat: ChatLine[]
  characters: Array<Record<string, unknown>>
  event_types: typeof event_types
  eventSource: StEventEmitter
  extension_settings: ExtensionSettings
  extensionNames: string[]
  extensionTypes: Record<string, string>
  extension_prompts: Record<string, ExtensionPrompt>
  chat_metadata: Record<string, unknown>
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
  initialize: typeof initializeStExtensionHost
  ModuleWorkerWrapper: typeof SimpleMutex
  registerMacro: typeof registerMacro
  unregisterMacro: typeof unregisterMacro
  registerMacroLike: typeof registerMacroLike
  unregisterMacroLike: typeof unregisterMacroLike
  replaceVariableMacros: typeof replaceVariableMacros
  registerSlashCommand: typeof registerSlashCommand
  STscript: typeof STscript
  executeSlashCommands: typeof executeSlashCommands
  executeSlashCommandsWithOptions: typeof executeSlashCommandsWithOptions
  renderExtensionTemplate: typeof renderExtensionTemplate
  renderExtensionTemplateAsync: typeof renderExtensionTemplateAsync
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
    executeSlashCommands?: typeof executeSlashCommands
    executeSlashCommandsWithOptions?: typeof executeSlashCommandsWithOptions
    STscript?: typeof STscript
    TavernHelper?: Record<string, unknown>
    builtin?: Record<string, unknown>
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
const chat: ChatLine[] = []
const characters: Array<Record<string, unknown>> = []
const chat_metadata: Record<string, unknown> = { variables: {}, extensions: {} }
const world_info: Record<string, unknown> = { globalSelect: [], charLore: [], entries: {} }
const character_variables: VariableScope = {}
const preset_variables: VariableScope = {}
const script_variables: VariableScope = {}
const templateVariables: VariableScope = {}

let saveSettingsTimer: number | null = null
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

export async function executeSlashCommands(text = ''): Promise<unknown> {
  return executeSlashCommandsWithOptions(text)
}

export async function executeSlashCommandsWithOptions(input: unknown = '', options: Record<string, unknown> = {}): Promise<unknown> {
  const text = getSlashCommandText(input, options)
  const trimmed = replaceVariableMacros(text).trim()
  const match = /^\/?([^\s]+)\s*(.*)$/.exec(trimmed)
  if (!match) return ''

  const command = SlashCommandParser.commands[match[1] ?? '']
  if (!command?.callback) return wrapSlashResult(text, options, false)

  try {
    const pipe = await command.callback(parseSlashNamedArgs(match[2] ?? ''), getSlashUnnamedArgs(match[2] ?? ''))
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
    reloadCurrentChat: async () => {},
    renameChat: async () => {},
    saveSettingsDebounced,
    onlineStatus: 'no_connection',
    maxContext: 0,
    chatMetadata: chat_metadata,
    saveMetadataDebounced,
    eventSource,
    eventTypes: event_types,
    extensionSettings: extension_settings,
    extension_settings,
    extensionPrompts: extension_prompts,
    variables: {
      global: getGlobalVariables(),
      local: getLocalVariables(),
      getGlobalVariable,
      setGlobalVariable,
      getLocalVariable,
      setLocalVariable,
    },
    world_info,
    writeExtensionField: () => {},
    setExtensionPrompt,
    getExtensionPromptByName,
    saveChat: async () => {},
    saveMetadata,
    sendSystemMessage: () => {},
    activateSendButtons: () => {},
    deactivateSendButtons: () => {},
    saveReply: async () => {},
    substituteParams: replaceVariableMacros,
    substituteParamsExtended: replaceVariableMacros,
    SlashCommandParser,
    SlashCommand,
    SlashCommandArgument,
    SlashCommandNamedArgument,
    SlashCommandEnumValue,
    ARGUMENT_TYPE,
    executeSlashCommands,
    executeSlashCommandsWithOptions,
    registerSlashCommand,
    registerMacro,
    unregisterMacro,
    registerMacroLike,
    unregisterMacroLike,
    replaceVariableMacros,
    STscript,
    renderExtensionTemplate,
    renderExtensionTemplateAsync,
    mainApi: 'crafttalker',
    ModuleWorkerWrapper: SimpleMutex,
    messageFormatting: (message: string) => message,
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

export async function saveSettings(): Promise<ExtensionSettings> {
  const saved = await api.extensions.saveSettings(extension_settings)
  mergeInto(extension_settings, saved)
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

export async function saveMetadata(): Promise<void> {}

export function saveMetadataDebounced(): void {}

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
  } catch (error) {
    console.warn('[ST Compat] Failed to load extension settings', error)
  }

  await eventSource.emit(event_types.EXTENSION_SETTINGS_LOADED, extension_settings)
  await eventSource.emit(event_types.SETTINGS_LOADED)

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
    randomizer: { controls: [], fluctuation: 0.1, enabled: false },
    speech_recognition: {},
    rvc: {},
    hypebot: {},
    vectors: {},
    variables: { global: {} },
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

  characters.splice(0, characters.length, ...contextState.characters.map((character, index) => ({
    ...character,
    avatar: character.avatar ?? '',
    chat: character.file_name === contextState.activeCharacter?.file_name ? contextState.activeChatId : null,
    chid: index,
  })))

  chat.splice(0, chat.length, ...contextState.chatLines)
  syncChatMetadataFromLines()
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = value
  }
}

function isExtensionDisabled(name: string): boolean {
  const disabled = extension_settings.disabledExtensions
  return Array.isArray(disabled) && disabled.includes(name)
}

function hasRequiredExtensionDependencies(manifest: ExtensionManifest): boolean {
  const dependencies = Array.isArray(manifest.dependencies) ? manifest.dependencies : manifest.requires
  if (!Array.isArray(dependencies)) return true
  return dependencies.every(dependency =>
    typeof dependency === 'string'
    && hasLoadedManifest(dependency)
    && !isExtensionDisabled(dependency),
  )
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

function getGlobalVariables(): VariableScope {
  const variables = ensureRecord(extension_settings, 'variables')
  return ensureRecord(variables, 'global')
}

function getLocalVariables(): VariableScope {
  return ensureRecord(chat_metadata, 'variables')
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
    return
  }
  Object.assign(chat_metadata, next)
  ensureRecord(chat_metadata, 'variables')
  ensureRecord(chat_metadata, 'extensions')
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

  const record = line as ChatLine & { variables?: unknown }
  if (!record.variables || typeof record.variables !== 'object') {
    record.variables = {}
  }
  if (Array.isArray(record.variables)) {
    const swipeId = Number.isInteger(record.swipe_id) ? Number(record.swipe_id) : 0
    const value = record.variables[swipeId]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as VariableScope
    }
    const next: VariableScope = {}
    record.variables[swipeId] = next
    return next
  }
  return record.variables as VariableScope
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
  if (scope === 'chat' || scope === 'message') saveMetadataDebounced()
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
  }
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
    getWorldbookNames: () => structuredClone(world_info.globalSelect ?? []),
    getGlobalWorldbookNames: () => structuredClone(world_info.globalSelect ?? []),
    getWorldbook: async () => [],
    getLorebooks: () => [],
    getLorebookSettings: () => ({}),
    generate: async () => '',
    generateRaw: async () => '',
    stopGenerationById: () => {},
    stopAllGeneration: () => {},
    playAudio: () => {},
    pauseAudio: () => {},
    getAudioList: () => [],
    replaceAudioList: () => {},
    appendAudioList: () => {},
    getAudioSettings: () => ({}),
    setAudioSettings: () => {},
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
  variables: {
    global: getGlobalVariables(),
    local: getLocalVariables(),
    getGlobalVariable,
    setGlobalVariable,
    getLocalVariable,
    setLocalVariable,
  },
  getContext,
  getExtensionManifest,
  getRequestHeaders,
  initialize: initializeStExtensionHost,
  ModuleWorkerWrapper: SimpleMutex,
  registerMacro,
  unregisterMacro,
  registerMacroLike,
  unregisterMacroLike,
  replaceVariableMacros,
  registerSlashCommand,
  STscript,
  executeSlashCommands,
  executeSlashCommandsWithOptions,
  renderExtensionTemplate,
  renderExtensionTemplateAsync,
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
}

function publishGlobals(): void {
  installGlobalLibraries()

  stHost.extensionNames = extensionNames
  stHost.extensionTypes = extensionTypes
  stHost.variables.global = getGlobalVariables()
  stHost.variables.local = getLocalVariables()

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
  window.STscript = STscript
  window.TavernHelper = tavernHelperFacade
  window.builtin = builtinFacade
  window.registerMacroLike = registerMacroLike
  window.unregisterMacroLike = unregisterMacroLike
  window.xiaobaixStreamingGeneration = xiaobaixStreamingGeneration
  window.updateTemplateVariables = updateTemplateVariables
  window.executeSlashCommands = executeSlashCommands
  window.executeSlashCommandsWithOptions = executeSlashCommandsWithOptions
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
