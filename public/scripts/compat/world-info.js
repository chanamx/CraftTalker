import { getHost } from './host.js'
import {
  NOTE_MODULE_NAME,
  metadata_keys,
  refreshShouldWIAddPrompt,
  shouldWIAddPrompt,
} from './authors-note.js'

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
export const scan_state = {
  NONE: 0,
  INITIAL: 1,
  RECURSION: 2,
  MIN_ACTIVATIONS: 3,
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
  refreshShouldWIAddPrompt()
  const activeCharacter = getActiveCharacter(context)
  const activeCharacterTagPayload = getActiveCharacterTagPayload(context, activeCharacter)

  try {
    const scanInjects = await getWorldInfoScanInjects(context)
    const payload = {
      chat: normalizePromptChat(chat),
      maxContext,
      isDryRun: Boolean(isDryRun),
      globalScanData,
      ...(scanInjects.length > 0 ? { scanInjects } : {}),
      characterName: activeCharacter?.file_name ?? activeCharacter?.avatar ?? activeCharacter?.name,
      ...activeCharacterTagPayload,
      chatId: typeof context?.chatId === 'string'
        ? context.chatId
        : typeof context?.getCurrentChatId === 'function'
          ? context.getCurrentChatId()
          : undefined,
      userName: getCompatUserName(context),
      model: getCompatModel(context),
    }
    const response = await fetch('/api/worldinfo/check', {
      method: 'POST',
      headers: host.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(`World info check failed with ${response.status}`)
    const result = await response.json()
    await emitWorldInfoEntriesLoaded(result)
    await emitWorldInfoScanDone(result)
    await emitActivatedWorldInfo(result, Boolean(isDryRun))
    applyWorldInfoAuthorNote(result, context)
    return result
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

function applyWorldInfoAuthorNote(result, context) {
  if (!shouldWIAddPrompt) return
  const setExtensionPrompt = context?.setExtensionPrompt ?? host.setExtensionPrompt
  if (typeof setExtensionPrompt !== 'function') return

  const extensionPrompts = context?.extensionPrompts ?? context?.extension_prompts ?? host.extension_prompts ?? {}
  const notePrompt = extensionPrompts?.[NOTE_MODULE_NAME]
  const originalNote = typeof notePrompt === 'string'
    ? notePrompt
    : typeof notePrompt?.value === 'string'
      ? notePrompt.value
      : ''
  const before = asRawStringList(result?.anBefore ?? result?.ANBeforeEntries).join('\n')
  const after = asRawStringList(result?.anAfter ?? result?.ANAfterEntries).join('\n')
  const mergedNote = `${before}\n${originalNote}\n${after}`.replace(/(^\n)|(\n$)/g, '')
  const metadata = context?.chat_metadata ?? context?.chatMetadata ?? host.chat_metadata ?? {}
  const allowWIScan = host.extension_settings?.note?.allowWIScan

  setExtensionPrompt(
    NOTE_MODULE_NAME,
    mergedNote,
    metadata?.[metadata_keys.position],
    metadata?.[metadata_keys.depth],
    allowWIScan,
    metadata?.[metadata_keys.role],
  )
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

async function getWorldInfoScanInjects(context) {
  const prompts = recordValue(
    context?.extensionPrompts
      ?? context?.extension_prompts
      ?? host.extension_prompts,
  )
  const resolvePrompt = context?.getExtensionPromptByName ?? host.getExtensionPromptByName
  const scanInjects = []

  for (const [name, value] of Object.entries(prompts)) {
    const prompt = recordValue(value)
    if (!prompt.scan) continue

    const resolved = typeof resolvePrompt === 'function'
      ? await resolvePrompt(name)
      : prompt.value
    const content = typeof resolved === 'string'
      ? resolved
      : typeof resolved?.value === 'string'
        ? resolved.value
        : ''
    if (content) scanInjects.push(content)
  }

  return scanInjects
}

function getActiveCharacter(context) {
  const characters = Array.isArray(context?.characters)
    ? context.characters
    : Array.isArray(context?.charactersData)
      ? context.charactersData
      : []
  const index = Number(context?.characterId ?? context?.this_chid)
  return Number.isInteger(index) && index >= 0 ? characters[index] : null
}

function getActiveCharacterTagPayload(context, activeCharacter) {
  const tagMap = getCompatTagMap(context)
  const tagKey = getActiveCharacterTagKey(context, activeCharacter, tagMap)
  const mappedTags = tagKey && Object.hasOwn(tagMap, tagKey)
    ? asStringList(tagMap[tagKey])
    : undefined
  const cardTags = asStringList(activeCharacter?.tags ?? activeCharacter?.data?.tags)
  const characterTags = mappedTags ?? (cardTags.length > 0 ? cardTags : undefined)
  if (!characterTags) return {}

  const characterTagNames = resolveCharacterTagNames(characterTags, getCompatTags(context), mappedTags ? [] : cardTags)
  return {
    characterTags,
    ...(characterTagNames.length > 0 ? { characterTagNames } : {}),
  }
}

function getCompatTagMap(context) {
  for (const value of [context?.tagMap, context?.tag_map, host.tagMap, host.tag_map, globalThis.tagMap, globalThis.tag_map]) {
    const record = recordValue(value)
    if (Object.keys(record).length > 0) return record
  }
  return {}
}

function getCompatTags(context) {
  for (const value of [context?.tags, host.tags, globalThis.tags]) {
    if (Array.isArray(value)) return value
  }
  return []
}

function getActiveCharacterTagKey(context, activeCharacter, tagMap) {
  const index = Number(context?.characterId ?? context?.this_chid)
  const candidates = [
    activeCharacter?.avatar,
    activeCharacter?.file_name,
    activeCharacter?.id,
    activeCharacter?.name,
    Number.isInteger(index) && index >= 0 ? String(index) : undefined,
  ].map(value => typeof value === 'string' ? value.trim() : '').filter(Boolean)

  return candidates.find(candidate => Object.hasOwn(tagMap, candidate)) ?? candidates[0]
}

function resolveCharacterTagNames(tagIds, tags, fallbackNames = []) {
  const namesById = new Map()
  for (const tag of tags) {
    if (!tag || typeof tag !== 'object') continue
    const id = typeof tag.id === 'string' ? tag.id.trim() : ''
    const name = typeof tag.name === 'string' ? tag.name.trim() : ''
    if (id && name) namesById.set(id, name)
  }

  return uniqueStrings([
    ...tagIds.map(tagId => namesById.get(tagId) ?? tagId),
    ...fallbackNames,
  ])
}

function getCompatUserName(context) {
  return firstStringValue([
    context?.name1,
    context?.userName,
    context?.user_name,
    context?.chatMetadata?.user_name,
    context?.chat_metadata?.user_name,
    Array.isArray(context?.chat) ? context.chat[0]?.user_name : undefined,
  ])
}

function getCompatModel(context) {
  const settings = context?.oai_settings
    ?? context?.openai_settings
    ?? globalThis.oai_settings
    ?? globalThis.openai_settings
  return firstStringValue([
    context?.model,
    context?.selectedModel,
    context?.selected_model,
    settings?.model,
    settings?.openai_model,
  ])
}

function firstStringValue(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function asStringList(value) {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item ?? '').trim()).filter(Boolean)
}

function asRawStringList(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))]
}

async function emitActivatedWorldInfo(result, isDryRun) {
  if (isDryRun) return
  const entries = Array.isArray(result?.allActivatedEntries)
    ? result.allActivatedEntries
    : Array.isArray(result?.matchedEntries)
      ? result.matchedEntries
      : []
  if (entries.length === 0) return

  const eventName = host.event_types?.WORLD_INFO_ACTIVATED ?? 'world_info_activated'
  try {
    await host.eventSource?.emit?.(eventName, entries)
  } catch (error) {
    host.recordCompatDiagnostic?.(
      'WORLD_INFO_ACTIVATED',
      'stub',
      'World info activation event listener failed in the public compatibility bridge.',
    )
    console.warn('[ST Compat] Failed to emit world info activation event', error)
  }
}

async function emitWorldInfoScanDone(result) {
  const scanEvents = Array.isArray(result?.scanEvents)
    ? result.scanEvents.filter(event => event?.type === 'scan_done')
    : []
  if (scanEvents.length === 0) return

  const eventName = host.event_types?.WORLDINFO_SCAN_DONE ?? 'worldinfo_scan_done'
  const activatedEntries = getWorldInfoActivatedEntries(result)
  const activatedMap = createActivatedEntryMap(activatedEntries)
  const activatedText = activatedEntries
    .map(entry => typeof entry?.content === 'string' ? entry.content : '')
    .filter(Boolean)
    .join('\n')

  try {
    for (const event of scanEvents) {
      await host.eventSource?.emit?.(eventName, createScanDoneEventData(event, result, activatedMap, activatedText))
    }
    host.recordCompatDiagnostic?.(
      'WORLDINFO_SCAN_DONE',
      'partial',
      'Emitted read-only ST-shaped world-info scan-done events from the public compatibility bridge; listener mutations do not affect the completed server-side scan.',
    )
  } catch (error) {
    host.recordCompatDiagnostic?.(
      'WORLDINFO_SCAN_DONE',
      'stub',
      'World info scan-done event listener failed in the public compatibility bridge.',
    )
    console.warn('[ST Compat] Failed to emit world info scan-done event', error)
  }
}

async function emitWorldInfoEntriesLoaded(result) {
  const sourceEntries = recordValue(result?.sourceEntries)
  const sourceKeys = ['globalLore', 'characterLore', 'chatLore', 'personaLore']
  if (!sourceKeys.some(key => Object.hasOwn(sourceEntries, key))) return

  const payload = {
    globalLore: entryArray(sourceEntries.globalLore),
    characterLore: entryArray(sourceEntries.characterLore),
    chatLore: entryArray(sourceEntries.chatLore),
    personaLore: entryArray(sourceEntries.personaLore),
  }
  const eventName = host.event_types?.WORLDINFO_ENTRIES_LOADED ?? 'worldinfo_entries_loaded'

  try {
    await host.eventSource?.emit?.(eventName, payload)
    host.recordCompatDiagnostic?.(
      'WORLDINFO_ENTRIES_LOADED',
      'partial',
      'Emitted a read-only ST-shaped world-info entries-loaded event from the public compatibility bridge; listener mutations do not affect the completed server-side scan.',
    )
  } catch (error) {
    host.recordCompatDiagnostic?.(
      'WORLDINFO_ENTRIES_LOADED',
      'stub',
      'World info entries-loaded event listener failed in the public compatibility bridge.',
    )
    console.warn('[ST Compat] Failed to emit world info entries-loaded event', error)
  }
}

function createScanDoneEventData(event, result, activatedMap, activatedText) {
  const currentState = normalizeScanState(event?.currentState)
  const nextState = normalizeScanState(event?.nextState)
  const budgetCurrent = finiteNumber(event?.budgetCurrent, finiteNumber(result?.budgetCurrent, 0))
  const overflowed = typeof event?.overflowed === 'boolean'
    ? event.overflowed
    : Boolean(result?.overflowed)
  const eventActivatedEntries = Array.isArray(event?.activatedEntries)
    ? entryArray(event.activatedEntries)
    : null
  const eventActivatedMap = eventActivatedEntries
    ? createActivatedEntryMap(eventActivatedEntries)
    : activatedMap
  const eventActivatedText = typeof event?.activatedText === 'string'
    ? event.activatedText
    : eventActivatedEntries
      ? eventActivatedEntries.map(entry => typeof entry?.content === 'string' ? entry.content : '').filter(Boolean).join('\n')
      : activatedText

  return {
    state: {
      current: currentState.value,
      next: nextState.value,
      loopCount: Math.max(0, Math.floor(finiteNumber(event?.loopCount, 0))),
      currentState: currentState.name,
      nextState: nextState.name,
    },
    new: {
      all: entryArray(event?.newAllEntries),
      successful: entryArray(event?.newSuccessfulEntries),
    },
    activated: {
      entries: new Map(eventActivatedMap),
      text: eventActivatedText,
    },
    sortedEntries: entryArray(result?.sortedEntries),
    recursionDelay: {
      availableLevels: numberArray(event?.recursionDelayAvailableLevels),
      currentLevel: Math.max(0, Math.floor(finiteNumber(event?.recursionDelayCurrentLevel, 0))),
    },
    budget: {
      current: budgetCurrent,
      overflowed,
    },
    timedEffects: createTimedEffectsFacade(
      event?.timedEffectsMetadata ?? result?.timedEffects,
      event?.timedEffectActiveEntryIds,
      entryArray(result?.sortedEntries),
    ),
  }
}

function createTimedEffectsFacade(metadata, activeEntryIds, sortedEntries = []) {
  const timedEffects = metadata && typeof metadata === 'object' ? metadata : {}
  const sticky = recordValue(timedEffects.sticky)
  const cooldown = recordValue(timedEffects.cooldown)
  const activeRecord = recordValue(activeEntryIds)
  const active = {
    sticky: stringSet(activeRecord.sticky),
    cooldown: stringSet(activeRecord.cooldown),
    delay: stringSet(activeRecord.delay),
  }
  const hasActiveState = ['sticky', 'cooldown', 'delay'].some(type => Array.isArray(activeRecord[type]))

  return {
    metadata: {
      sticky,
      cooldown,
    },
    sticky,
    cooldown,
    delay: {},
    isValidEffectType: isValidTimedEffectType,
    isEffectActive(type, entry) {
      if (!isValidTimedEffectType(type)) return false
      const effectType = normalizeTimedEffectType(type)
      if (hasActiveState) return isTimedEffectActive(active, sortedEntries, effectType, entry)
      if (effectType === 'delay') return false
      return Boolean(getTimedEffectMetadata(sticky, cooldown, type, entry))
    },
    getEffectMetadata(type, entry) {
      if (!isValidTimedEffectType(type)) return null
      return getTimedEffectMetadata(sticky, cooldown, type, entry)
    },
    setTimedEffect(type) {
      host.recordCompatDiagnostic?.(
        'WORLDINFO_SCAN_DONE.timedEffects.setTimedEffect',
        'readonly',
        `Ignored public scan-done timed effect mutation for "${String(type)}"; server-side scans are already complete.`,
      )
    },
    setTimedEffects() {
      host.recordCompatDiagnostic?.(
        'WORLDINFO_SCAN_DONE.timedEffects.setTimedEffects',
        'readonly',
        'Ignored public scan-done timed effects mutation; server-side scans are already complete.',
      )
    },
    cleanUp() {},
  }
}

function isTimedEffectActive(active, sortedEntries, type, entry) {
  const key = getEntryKey(entry)
  if (key && active[type]?.has(key)) return true

  const hash = finiteNumber(entry?.hash, Number.NaN)
  if (!Number.isFinite(hash)) return false

  return sortedEntries.some(sortedEntry => {
    if (!sortedEntry || typeof sortedEntry !== 'object') return false
    if (String(sortedEntry.hash) !== String(hash)) return false
    const sortedKey = getEntryKey(sortedEntry)
    return Boolean(sortedKey && active[type]?.has(sortedKey))
  })
}

function isValidTimedEffectType(type) {
  return ['sticky', 'cooldown', 'delay'].includes(normalizeTimedEffectType(type))
}

function normalizeTimedEffectType(type) {
  return typeof type === 'string' ? type.trim().toLowerCase() : ''
}

function getTimedEffectMetadata(sticky, cooldown, type, entry) {
  const effectType = normalizeTimedEffectType(type)
  if (effectType === 'delay') return undefined
  const store = effectType === 'sticky' ? sticky : cooldown
  const key = getEntryKey(entry)
  if (key && store[key]) return store[key]
  const hash = finiteNumber(entry?.hash, Number.NaN)
  if (!Number.isFinite(hash)) return undefined
  return Object.values(store).find(effect => {
    if (!effect || typeof effect !== 'object') return false
    return String(effect.hash) === String(hash)
  })
}

function getEntryKey(entry) {
  if (!entry || typeof entry !== 'object') return ''
  const world = typeof entry.world === 'string' ? entry.world.trim() : ''
  const uid = entry.uid ?? entry.id
  return world && uid !== undefined && uid !== null ? `${world}.${uid}` : ''
}

function normalizeScanState(value) {
  switch (value) {
    case 'initial':
    case scan_state.INITIAL:
      return { name: 'initial', value: scan_state.INITIAL }
    case 'recursion':
    case scan_state.RECURSION:
      return { name: 'recursion', value: scan_state.RECURSION }
    case 'min_activations':
    case scan_state.MIN_ACTIVATIONS:
      return { name: 'min_activations', value: scan_state.MIN_ACTIVATIONS }
    case null:
    case undefined:
    case 'none':
    case scan_state.NONE:
    default:
      return { name: null, value: scan_state.NONE }
  }
}

function numberArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(item => finiteNumber(item, Number.NaN))
    .filter(Number.isFinite)
    .map(item => Math.max(0, Math.floor(item)))
}

function entryArray(value) {
  return Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object')
    : []
}

function recordValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function stringSet(value) {
  return new Set(Array.isArray(value) ? value.filter(item => typeof item === 'string') : [])
}

function getWorldInfoActivatedEntries(result) {
  return Array.isArray(result?.allActivatedEntries)
    ? result.allActivatedEntries
    : Array.isArray(result?.matchedEntries)
      ? result.matchedEntries
      : []
}

function createActivatedEntryMap(entries) {
  const map = new Map()
  entries.forEach((entry, index) => {
    const world = typeof entry?.world === 'string' && entry.world.trim() ? entry.world.trim() : 'unknown'
    const uid = entry?.uid ?? entry?.id ?? index
    map.set(`${world}.${uid}`, entry)
  })
  return map
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
    worldInfoString: '',
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
    sortedEntries: [],
    sourceEntries: {
      globalLore: [],
      characterLore: [],
      chatLore: [],
      personaLore: [],
    },
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
