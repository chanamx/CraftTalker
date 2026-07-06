import { getHost } from './host.js'

const host = getHost()

export const world_names = host.world_names
export const selected_world_info = host.selected_world_info
export const world_info = host.world_info
export let world_info_include_names = true
export let world_info_case_sensitive = false
export let world_info_match_whole_words = false
export let world_info_use_group_scoring = false
export let world_info_max_recursion_steps = 10
export let world_info_depth = 4
export let world_info_min_activations = 0
export let world_info_min_activations_depth_max = 0
export let world_info_budget = 25
export let world_info_budget_cap = 0
export let world_info_recursive = false
export let world_info_overflow_alert = false
export let world_info_character_strategy = 0
export const METADATA_KEY = 'world_info'
export const DEFAULT_DEPTH = 4
export const DEFAULT_WEIGHT = 100
export const world_info_logic = {
  AND_ANY: 0,
  NOT_ALL: 1,
  NOT_ANY: 2,
  AND_ALL: 3,
}
export const world_info_position = {
  before: 0,
  after: 1,
  ANTop: 2,
  ANBottom: 3,
  atDepth: 4,
  EMTop: 5,
  EMBottom: 6,
  outlet: 7,
}
export const wi_anchor_position = {
  before: 0,
  after: 1,
}
export const newWorldInfoEntryTemplate = {
  uid: 0,
  key: [],
  keysecondary: [],
  comment: '',
  content: '',
  constant: false,
  selective: false,
  enabled: true,
  position: 0,
  depth: DEFAULT_DEPTH,
  order: DEFAULT_WEIGHT,
}

export function loadWorldInfo(name) {
  return host.loadWorldInfo(name)
}

export function saveWorldInfo(name, data, immediately = false) {
  if (typeof host.saveWorldInfo !== 'function') {
    return Promise.resolve(blockWorldInfoWrite('saveWorldInfo', false))
  }
  return host.saveWorldInfo(name, data, immediately)
}

export function updateWorldInfoList() {
  return host.updateWorldInfoList().then((result) => {
    syncWorldInfoSettings()
    return result
  })
}

export async function getWorldInfoPrompt(chat = [], maxContext, isDryRun = false, globalScanData = {}) {
  const context = getCompatContext()
  const activeCharacter = getActiveCharacter(context)
  const payload = {
    chat: normalizePromptChat(chat),
    maxContext,
    isDryRun: Boolean(isDryRun),
    globalScanData,
    characterName: activeCharacter?.file_name ?? activeCharacter?.avatar ?? activeCharacter?.name,
    chatId: typeof context?.chatId === 'string'
      ? context.chatId
      : typeof context?.getCurrentChatId === 'function'
        ? context.getCurrentChatId()
        : undefined,
  }

  try {
    const response = await fetch('/api/worldinfo/check', {
      method: 'POST',
      headers: host.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(`World info check failed with ${response.status}`)
    return await response.json()
  } catch (error) {
    host.recordCompatDiagnostic?.(
      'getWorldInfoPrompt',
      'stub',
      'Public world-info.js prompt scanning failed; returning an empty ST-shaped prompt result.',
    )
    console.warn('[ST Compat] Failed to scan world info prompt', error)
    return emptyWorldInfoPromptResult()
  }
}

export async function checkWorldInfo(chat = [], maxContext, isDryRun = false, globalScanData = {}) {
  const result = await getWorldInfoPrompt(chat, maxContext, isDryRun, globalScanData)
  return {
    ...result,
    allActivatedEntries: result.allActivatedEntries ?? result.matchedEntries ?? [],
    EMEntries: result.EMEntries ?? result.worldInfoExamples ?? [],
    WIDepthEntries: result.WIDepthEntries ?? result.worldInfoDepth ?? [],
    ANBeforeEntries: result.ANBeforeEntries ?? result.anBefore ?? [],
    ANAfterEntries: result.ANAfterEntries ?? result.anAfter ?? [],
    outletEntries: result.outletEntries ?? {},
  }
}

export function getWorldInfoSettings() {
  syncWorldInfoSettings()
  return {
    world_info,
    world_info_include_names,
    world_info_case_sensitive,
    world_info_match_whole_words,
    world_info_use_group_scoring,
    world_info_max_recursion_steps,
    world_info_depth,
    world_info_min_activations,
    world_info_min_activations_depth_max,
    world_info_budget,
    world_info_budget_cap,
    world_info_recursive,
    world_info_overflow_alert,
    world_info_character_strategy,
  }
}

function syncWorldInfoSettings() {
  const settings = host.world_info_settings ?? {}
  world_info_include_names = typeof settings.world_info_include_names === 'boolean' ? settings.world_info_include_names : true
  world_info_case_sensitive = typeof settings.world_info_case_sensitive === 'boolean' ? settings.world_info_case_sensitive : false
  world_info_match_whole_words = typeof settings.world_info_match_whole_words === 'boolean' ? settings.world_info_match_whole_words : false
  world_info_use_group_scoring = typeof settings.world_info_use_group_scoring === 'boolean' ? settings.world_info_use_group_scoring : false
  world_info_max_recursion_steps = finiteNumber(settings.world_info_max_recursion_steps, 10)
  world_info_depth = finiteNumber(settings.world_info_depth, 4)
  world_info_min_activations = finiteNumber(settings.world_info_min_activations, 0)
  world_info_min_activations_depth_max = finiteNumber(settings.world_info_min_activations_depth_max, 0)
  world_info_budget = finiteNumber(settings.world_info_budget, 25)
  world_info_budget_cap = finiteNumber(settings.world_info_budget_cap, 0)
  world_info_recursive = typeof settings.world_info_recursive === 'boolean' ? settings.world_info_recursive : false
  world_info_overflow_alert = typeof settings.world_info_overflow_alert === 'boolean' ? settings.world_info_overflow_alert : false
  world_info_character_strategy = finiteNumber(settings.world_info_character_strategy, 0)
}

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

syncWorldInfoSettings()

function getCompatContext() {
  try {
    return typeof host.getContext === 'function' ? host.getContext() : null
  } catch {
    return null
  }
}

function getActiveCharacter(context) {
  const characters = Array.isArray(context?.characters) ? context.characters : []
  const index = Number(context?.characterId ?? context?.this_chid)
  return Number.isInteger(index) && index >= 0 ? characters[index] : null
}

function normalizePromptChat(chat) {
  const values = Array.isArray(chat) ? chat : typeof chat === 'string' ? [chat] : []
  return values
    .map((item) => {
      if (typeof item === 'string') return item
      if (!item || typeof item !== 'object') return ''
      return {
        name: typeof item.name === 'string' ? item.name : undefined,
        content: typeof item.content === 'string'
          ? item.content
          : typeof item.mes === 'string'
            ? item.mes
            : '',
      }
    })
    .filter((item) => typeof item === 'string' ? item.trim() : item.content.trim())
}

function emptyWorldInfoPromptResult() {
  return {
    matchedEntries: [],
    worldInfoBefore: '',
    worldInfoAfter: '',
    worldInfoExamples: [],
    worldInfoDepth: [],
    anBefore: [],
    anAfter: [],
    outletEntries: {},
    allActivatedEntries: [],
    overflowed: false,
    timedEffects: {},
    timedEffectsChanged: false,
    scanEvents: [],
    vectorizedSkipped: [],
    vectorizedActivated: [],
  }
}

export function parseRegexFromString(value) {
  const text = String(value ?? '')
  const match = text.match(/^\/(.+)\/([a-z]*)$/i)
  if (!match) return null
  try {
    return new RegExp(match[1], match[2])
  } catch {
    return null
  }
}

export function createNewWorldInfo(name, options = {}) {
  if (typeof host.createNewWorldInfo !== 'function') {
    return Promise.resolve(blockWorldInfoWrite('createNewWorldInfo', false))
  }
  return host.createNewWorldInfo(name, options)
}

export function createWorldInfoEntry(_name, data) {
  const entries = getWorldInfoEntries(data)
  if (!entries) return blockWorldInfoWrite('createWorldInfoEntry', undefined)
  const uid = getFreeWorldEntryUid(data)
  if (!Number.isInteger(uid)) return blockWorldInfoWrite('createWorldInfoEntry', undefined)
  const entry = { ...structuredClone(newWorldInfoEntryTemplate), uid }
  entries[uid] = entry
  host.recordCompatDiagnostic?.(
    'createWorldInfoEntry',
    'partial',
    'Created an in-memory worldbook entry in the provided ST data object; persistence requires saveWorldInfo.',
  )
  return entry
}

export async function deleteWorldInfoEntry(data, uid) {
  const entries = getWorldInfoEntries(data)
  const key = String(uid ?? '')
  if (!entries) return blockWorldInfoWrite('deleteWorldInfoEntry', false)
  if (!Object.hasOwn(entries, key)) return false
  delete entries[key]
  host.recordCompatDiagnostic?.(
    'deleteWorldInfoEntry',
    'partial',
    'Deleted an in-memory worldbook entry from the provided ST data object; persistence requires saveWorldInfo.',
  )
  return true
}

export function deleteWorldInfo() {
  return Promise.resolve(blockWorldInfoWrite('deleteWorldInfo', false))
}

export function charUpdatePrimaryWorld() {
  return Promise.resolve(blockWorldInfoWrite('charUpdatePrimaryWorld', false))
}

export const originalWIDataKeyMap = new Map()

export function setWIOriginalDataValue(entry, key, value) {
  if (entry && typeof entry === 'object') entry[key] = value
  return entry
}

export function onWorldInfoChange(args, text = '') {
  if (typeof args !== 'function') {
    if (typeof host.setWorldInfoSelection !== 'function') {
      return Promise.resolve(blockWorldInfoWrite('onWorldInfoChange', ''))
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return Promise.resolve(blockWorldInfoWrite('onWorldInfoChange', ''))
    }

    const state = normalizeWorldInfoSelectionState(args.state, text)
    if (!state) return Promise.resolve(blockWorldInfoWrite('onWorldInfoChange', ''))

    return host.setWorldInfoSelection(normalizeWorldInfoSelectionNames(text), state).then(() => '')
  }
  return () => {}
}

function blockWorldInfoWrite(id, fallback) {
  host.recordCompatDiagnostic?.(
    id,
    'blocked',
    'This public world-info.js helper is blocked unless CraftTalker exposes a matching permissioned compatibility bridge.',
  )
  return fallback
}

function normalizeWorldInfoSelectionState(value, text) {
  if (value === undefined || value === null || value === '') {
    return String(text ?? '').trim() ? 'on' : 'off'
  }
  if (value === true) return 'on'
  if (value === false) return 'off'
  const state = String(value).trim().toLowerCase()
  if (state === 'on' || state === 'true' || state === '1') return 'on'
  if (state === 'off' || state === 'false' || state === '0') return 'off'
  if (state === 'toggle') return 'toggle'
  return null
}

function normalizeWorldInfoSelectionNames(text) {
  const value = String(text ?? '').trim()
  if (!value) return []
  if (host.world_names?.includes(value)) return [value]
  return value.split(',').map(part => part.trim()).filter(Boolean)
}

export function getFreeWorldEntryUid(data) {
  const entries = getWorldInfoEntries(data)
  if (!entries) return null
  for (let uid = 0; uid < 1_000_000; uid += 1) {
    if (!Object.hasOwn(entries, String(uid)) && !Object.hasOwn(entries, uid)) return uid
  }
  return null
}

function getWorldInfoEntries(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (!data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) return null
  return data.entries
}

export function setWorldInfoButtonClass() {}
export function reloadEditor() {}
export function convertCharacterBook(book) {
  return book
}

export default {
  world_names,
  loadWorldInfo,
  saveWorldInfo,
  updateWorldInfoList,
  getWorldInfoPrompt,
  checkWorldInfo,
  getWorldInfoSettings,
  onWorldInfoChange,
  charUpdatePrimaryWorld,
  reloadEditor,
  convertCharacterBook,
}
