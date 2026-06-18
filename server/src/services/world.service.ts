import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createError, ErrorCode } from '../lib/errors.js'
import { safePath } from '../lib/path-utils.js'
import { parseCharacterJson } from '../lib/png-parser.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')
const WORLD_ENTRY_UPDATE_ALIASES = {
  keys: 'key',
  secondary_keys: 'keysecondary',
  group_weight: 'groupWeight',
  group_override: 'groupOverride',
  ignore_budget: 'ignoreBudget',
  selective_logic: 'selectiveLogic',
  outlet_name: 'outletName',
  scan_depth: 'scanDepth',
  match_whole_words: 'matchWholeWords',
  use_group_scoring: 'useGroupScoring',
  case_sensitive: 'caseSensitive',
  automation_id: 'automationId',
  display_index: 'displayIndex',
  exclude_recursion: 'excludeRecursion',
  prevent_recursion: 'preventRecursion',
  delay_until_recursion: 'delayUntilRecursion',
  use_probability: 'useProbability',
  match_persona_description: 'matchPersonaDescription',
  match_character_description: 'matchCharacterDescription',
  match_character_personality: 'matchCharacterPersonality',
  match_character_depth_prompt: 'matchCharacterDepthPrompt',
  match_scenario: 'matchScenario',
  match_creator_notes: 'matchCreatorNotes',
  character_filter: 'characterFilter',
  use_regex: 'use_regexp',
  add_memo: 'addMemo',
} as const
const WORLD_ENTRY_EXTENSION_KEYS = {
  displayIndex: 'display_index',
  excludeRecursion: 'exclude_recursion',
  preventRecursion: 'prevent_recursion',
  delayUntilRecursion: 'delay_until_recursion',
  depth: 'depth',
  probability: 'probability',
  useProbability: 'useProbability',
  position: 'position',
  role: 'role',
  matchWholeWords: 'match_whole_words',
  useGroupScoring: 'use_group_scoring',
  caseSensitive: 'case_sensitive',
  matchPersonaDescription: 'match_persona_description',
  matchCharacterDescription: 'match_character_description',
  matchCharacterPersonality: 'match_character_personality',
  matchCharacterDepthPrompt: 'match_character_depth_prompt',
  matchScenario: 'match_scenario',
  matchCreatorNotes: 'match_creator_notes',
  scanDepth: 'scan_depth',
  automationId: 'automation_id',
  vectorized: 'vectorized',
  group: 'group',
  groupOverride: 'group_override',
  groupWeight: 'group_weight',
  sticky: 'sticky',
  cooldown: 'cooldown',
  delay: 'delay',
  triggers: 'triggers',
  ignoreBudget: 'ignore_budget',
  outletName: 'outlet_name',
} as const

function getDataDir() { return process.env.LUKER_DATA_DIR ?? DEFAULT_DATA_DIR }
function getWorldsDir() { return path.join(getDataDir(), 'worlds') }

export interface WorldBookEntryCharacterFilter {
  names: string[]
  tags: string[]
  isExclude: boolean
}

export interface WorldBookEntry {
  uid: number
  id?: number | string
  key: string[]
  keys?: string[]
  keysecondary: string[]
  secondary_keys?: string[]
  comment: string
  content: string
  constant: boolean
  selective: boolean
  insertion_order: number
  priority?: number | string
  enabled: boolean
  position: number
  depth: number
  order: number
  use_regexp: boolean
  probability: number
  group: string
  group_override: boolean
  exclude_recursion: boolean
  prevent_recursion: boolean
  delay_until_recursion: boolean | number
  scan_depth: number
  match_whole_words: boolean
  use_group_scoring: boolean
  case_sensitive: boolean
  automation_id: string
  role: number
  sticky: number
  cooldown: number
  delay: number
  display_index: number
  selectiveLogic?: number
  groupWeight?: number
  groupOverride?: boolean
  ignoreBudget?: boolean
  outletName?: string
  outlet_name?: string
  excludeRecursion?: boolean
  preventRecursion?: boolean
  delayUntilRecursion?: boolean | number
  useProbability?: boolean
  scanDepth?: number | null
  matchWholeWords?: boolean | null
  useGroupScoring?: boolean | null
  caseSensitive?: boolean | null
  automationId?: string
  displayIndex?: number
  addMemo?: boolean
  matchPersonaDescription?: boolean
  matchCharacterDescription?: boolean
  matchCharacterPersonality?: boolean
  matchCharacterDepthPrompt?: boolean
  matchScenario?: boolean
  matchCreatorNotes?: boolean
  triggers?: string[]
  characterFilter?: WorldBookEntryCharacterFilter
  character_filter?: WorldBookEntryCharacterFilter
  extensions?: Record<string, unknown>
  disable?: boolean
  vectorized?: boolean
  [key: string]: unknown
}

export interface WorldBook {
  name: string
  description: string
  entries: Record<string, WorldBookEntry>
  enabled: boolean
  global_enabled?: boolean
  global_selective: boolean
  selective_default: boolean
  recursive_scanning: boolean
  scan_depth: number
  token_budget: number
  recursive_scanning_depth: number
  extensions: Record<string, unknown>
  [key: string]: unknown
}

export type WorldBookEntryInput = Record<string, unknown> & {
  content: string
  key?: string[]
  keys?: string[]
  uid?: number
}

function getWorldPath(name: string): string {
  return safePath(getWorldsDir(), `${name}.json`)
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  const buffer = await fs.readFile(filePath)
  let text = buffer.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }
  return JSON.parse(text) as Record<string, unknown>
}

export interface WorldListItem {
  name: string
  description: string
  entry_count: number
  enabled: boolean
  global_enabled: boolean
  bound_to: string[]
}

export function getWorldNamesFromExtensions(extensions: Record<string, unknown> | undefined): string[] {
  if (!extensions) return []
  const names = new Set<string>()
  const primary = extensions.world
  if (typeof primary === 'string' && primary.trim()) names.add(primary)
  const extra = extensions.worlds
  if (Array.isArray(extra)) {
    for (const item of extra) {
      if (typeof item === 'string' && item.trim()) names.add(item)
    }
  }
  return [...names]
}

export function isWorldGloballyEnabled(world: Pick<WorldBook, 'global_enabled'>, boundTo: string[]): boolean {
  return typeof world.global_enabled === 'boolean' ? world.global_enabled : boundTo.length === 0
}

export function hasExplicitGlobalScope(world: Pick<WorldBook, 'global_enabled'>): boolean {
  return world.global_enabled === true
}

export async function listWorlds(): Promise<WorldListItem[]> {
  const worldsDir = getWorldsDir()
  if (!existsSync(worldsDir)) return []

  // 扫描角色绑定关系
  const charsDir = path.join(getDataDir(), 'characters')
  const bindings = new Map<string, string[]>()
  if (existsSync(charsDir)) {
    const charDirs = await fs.readdir(charsDir, { withFileTypes: true })
    for (const d of charDirs.filter(d => d.isDirectory())) {
      const jsonPath = path.join(charsDir, d.name, 'character.json')
      if (!existsSync(jsonPath)) continue
      try {
        const card = parseCharacterJson(JSON.stringify(await readJsonFile(jsonPath)))
        const worldNames = getWorldNamesFromExtensions(card.extensions as Record<string, unknown> | undefined)
        for (const worldName of worldNames) {
          const boundCharacters = bindings.get(worldName) ?? []
          boundCharacters.push(d.name)
          bindings.set(worldName, boundCharacters)
        }
      } catch { /* skip */ }
    }
  }

  const files = await fs.readdir(worldsDir)
  const results = await Promise.all(
    files
      .filter(f => f.endsWith('.json'))
      .map(async (f) => {
        const filePath = path.join(worldsDir, f)
        try {
          const world = normalizeWorld(await readJsonFile(filePath), path.parse(f).name)
          const boundTo = bindings.get(world.name) ?? []
          return {
            name: world.name,
            description: world.description ?? '',
            entry_count: Object.keys(world.entries ?? {}).length,
            enabled: world.enabled ?? true,
            global_enabled: isWorldGloballyEnabled(world, boundTo),
            bound_to: boundTo,
          }
        } catch (err) {
          console.error(`Failed to read world ${f}:`, err)
          return null
        }
      })
  )

  return results.filter(Boolean) as WorldListItem[]
}

export async function getWorld(name: string): Promise<WorldBook> {
  const filePath = getWorldPath(name)
  if (!existsSync(filePath)) {
    throw createError(ErrorCode.WORLD_NOT_FOUND, `世界书 "${name}" 不存在`, { worldName: name })
  }
  return normalizeWorld(await readJsonFile(filePath), name)
}

export async function createWorld(name: string, description?: string): Promise<WorldBook> {
  const world: WorldBook = {
    name,
    description: description ?? '',
    entries: {},
    enabled: false,
    global_enabled: false,
    global_selective: false,
    selective_default: false,
    recursive_scanning: false,
    scan_depth: 100,
    token_budget: 500,
    recursive_scanning_depth: 2,
    extensions: {},
  }

  const filePath = getWorldPath(name)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const normalized = normalizeWorld(world)
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

export async function saveWorldBook(world: WorldBook): Promise<WorldBook> {
  const filePath = getWorldPath(world.name)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(world, null, 2), 'utf8')
  return world
}

export async function updateWorld(name: string, updates: Partial<WorldBook>): Promise<WorldBook> {
  const existing = await getWorld(name)
  const merged = normalizeWorld({ ...existing, ...updates }, name)
  const filePath = getWorldPath(name)
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

export async function deleteWorld(name: string): Promise<boolean> {
  const filePath = getWorldPath(name)
  if (!existsSync(filePath)) {
    throw createError(ErrorCode.WORLD_NOT_FOUND, `世界书 "${name}" 不存在`, { worldName: name })
  }
  await fs.unlink(filePath)
  return true
}

export async function addWorldEntry(worldName: string, entry: WorldBookEntryInput): Promise<WorldBook> {
  const world = await getWorld(worldName)
  const fallbackUid = Date.now()
  const uid = getEntryFallbackUid(String(fallbackUid), entry) ?? fallbackUid
  world.entries[String(uid)] = normalizeWorldEntry({ ...canonicalizeWorldEntryUpdates(entry), uid })
  return updateWorld(worldName, world)
}

export async function updateWorldEntry(worldName: string, uid: number, updates: Record<string, unknown>): Promise<WorldBook> {
  const world = await getWorld(worldName)
  const key = String(uid)
  if (!world.entries[key]) {
    throw createError(ErrorCode.NOT_FOUND, `世界书条目 "${uid}" 不存在`, { worldName, uid })
  }
  world.entries[key] = normalizeWorldEntry({
    ...world.entries[key],
    ...canonicalizeWorldEntryUpdates(updates, world.entries[key].extensions),
    uid,
  })
  return updateWorld(worldName, world)
}

export async function deleteWorldEntry(worldName: string, uid: number): Promise<WorldBook> {
  const world = await getWorld(worldName)
  delete world.entries[String(uid)]
  return updateWorld(worldName, world)
}

export function normalizeWorld(raw: Record<string, unknown>, fallbackName = ''): WorldBook {
  const entriesRaw = getWorldEntryRecords(raw.entries)
  const entries: Record<string, WorldBookEntry> = {}
  const usedUids = new Set<number>()
  let nextFallbackUid = 0

  for (const [key, value] of entriesRaw) {
    if (!isRecord(value)) continue
    const fallbackUid = getEntryFallbackUid(key, value)
    const uid = fallbackUid ?? nextAvailableUid(usedUids, nextFallbackUid)
    const entry = normalizeWorldEntry({ ...value, uid })
    usedUids.add(entry.uid)
    nextFallbackUid = Math.max(nextFallbackUid, entry.uid + 1)
    entries[String(entry.uid)] = entry
  }

  return {
    ...raw,
    name: fallbackName || asString(raw.name),
    description: asString(raw.description),
    entries,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    ...(typeof raw.global_enabled === 'boolean' ? { global_enabled: raw.global_enabled } : {}),
    global_selective: Boolean(raw.global_selective),
    selective_default: Boolean(raw.selective_default),
    recursive_scanning: Boolean(raw.recursive_scanning),
    scan_depth: asNumber(raw.scan_depth, 100),
    token_budget: asNumber(raw.token_budget, 500),
    recursive_scanning_depth: asNumber(raw.recursive_scanning_depth, 2),
    extensions: isRecord(raw.extensions) ? raw.extensions : {},
  }
}

export function normalizeWorldEntry(raw: Record<string, unknown>): WorldBookEntry {
  const extensions = isRecord(raw.extensions) ? raw.extensions : {}
  const disable = typeof raw.disable === 'boolean' ? raw.disable : undefined
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : disable !== true
  const uid = asUid(raw.uid ?? raw.id, Date.now())
  const useRegexp = asBoolean(valueFrom(raw, extensions, ['use_regexp', 'use_regex']), false)
  const insertionOrder = asNumber(valueFrom(raw, extensions, ['insertion_order', 'order', 'priority']), 100)
  const positionValue = valueFrom(raw, extensions, ['position'])
  const groupOverride = asBoolean(valueFrom(raw, extensions, ['groupOverride', 'group_override']), false)
  const groupWeight = asNumber(valueFrom(raw, extensions, ['groupWeight', 'group_weight']), 100)
  const ignoreBudget = asBoolean(valueFrom(raw, extensions, ['ignoreBudget', 'ignore_budget']), false)
  const selectiveLogic = asNumber(valueFrom(raw, extensions, ['selectiveLogic', 'selective_logic']), 0)
  const outletName = asString(valueFrom(raw, extensions, ['outletName', 'outlet_name']))
  const vectorized = asBoolean(valueFrom(raw, extensions, ['vectorized']), false)
  const excludeRecursion = asBoolean(valueFrom(raw, extensions, ['excludeRecursion', 'exclude_recursion']), false)
  const preventRecursion = asBoolean(valueFrom(raw, extensions, ['preventRecursion', 'prevent_recursion']), false)
  const delayUntilRecursion = asBooleanOrNumber(valueFrom(raw, extensions, ['delayUntilRecursion', 'delay_until_recursion']), false)
  const scanDepth = asNullableNumber(valueFrom(raw, extensions, ['scanDepth', 'scan_depth']))
  const matchWholeWords = asNullableBoolean(valueFrom(raw, extensions, ['matchWholeWords', 'match_whole_words']))
  const useGroupScoring = asNullableBoolean(valueFrom(raw, extensions, ['useGroupScoring', 'use_group_scoring']))
  const caseSensitive = asNullableBoolean(valueFrom(raw, extensions, ['caseSensitive', 'case_sensitive']))
  const automationId = asString(valueFrom(raw, extensions, ['automationId', 'automation_id']))
  const role = asNumber(valueFrom(raw, extensions, ['role']), 0)
  const sticky = asNullableNumber(valueFrom(raw, extensions, ['sticky']))
  const cooldown = asNullableNumber(valueFrom(raw, extensions, ['cooldown']))
  const delay = asNullableNumber(valueFrom(raw, extensions, ['delay']))
  const displayIndex = asNumber(valueFrom(raw, extensions, ['displayIndex', 'display_index']), uid)
  const useProbability = asBoolean(valueFrom(raw, extensions, ['useProbability', 'use_probability']), true)
  const characterFilter = asCharacterFilter(valueFrom(raw, extensions, ['characterFilter', 'character_filter']))
  const characterFilterFields = characterFilter
    ? { characterFilter, character_filter: characterFilter }
    : {}

  return {
    ...raw,
    uid,
    key: asStringArray(raw.key ?? raw.keys),
    ...(Object.hasOwn(raw, 'keys') ? { keys: asStringArray(raw.keys ?? raw.key) } : {}),
    keysecondary: asStringArray(raw.keysecondary ?? raw.secondary_keys),
    ...(Object.hasOwn(raw, 'secondary_keys') ? { secondary_keys: asStringArray(raw.secondary_keys ?? raw.keysecondary) } : {}),
    comment: asString(raw.comment ?? raw.name),
    content: asString(raw.content),
    constant: Boolean(raw.constant),
    selective: Boolean(raw.selective),
    insertion_order: insertionOrder,
    enabled,
    disable: !enabled,
    position: normalizePosition(positionValue),
    depth: asNumber(valueFrom(raw, extensions, ['depth']), 4),
    order: asNumber(valueFrom(raw, extensions, ['order', 'insertion_order', 'priority']), insertionOrder),
    use_regexp: useRegexp,
    probability: asNumber(valueFrom(raw, extensions, ['probability']), 100),
    group: asString(valueFrom(raw, extensions, ['group'])),
    group_override: groupOverride,
    groupOverride,
    groupWeight,
    ignoreBudget,
    selectiveLogic,
    outletName,
    vectorized,
    exclude_recursion: excludeRecursion,
    excludeRecursion,
    prevent_recursion: preventRecursion,
    preventRecursion,
    delay_until_recursion: delayUntilRecursion,
    delayUntilRecursion,
    scan_depth: scanDepth ?? 100,
    scanDepth,
    match_whole_words: matchWholeWords ?? false,
    matchWholeWords,
    use_group_scoring: useGroupScoring ?? false,
    useGroupScoring,
    case_sensitive: caseSensitive ?? false,
    caseSensitive,
    automation_id: automationId,
    automationId,
    role,
    sticky: sticky ?? 0,
    cooldown: cooldown ?? 0,
    delay: delay ?? 0,
    display_index: displayIndex,
    displayIndex,
    useProbability,
    addMemo: asBoolean(valueFrom(raw, extensions, ['addMemo', 'add_memo']), false),
    matchPersonaDescription: asBoolean(valueFrom(raw, extensions, ['matchPersonaDescription', 'match_persona_description']), false),
    matchCharacterDescription: asBoolean(valueFrom(raw, extensions, ['matchCharacterDescription', 'match_character_description']), false),
    matchCharacterPersonality: asBoolean(valueFrom(raw, extensions, ['matchCharacterPersonality', 'match_character_personality']), false),
    matchCharacterDepthPrompt: asBoolean(valueFrom(raw, extensions, ['matchCharacterDepthPrompt', 'match_character_depth_prompt']), false),
    matchScenario: asBoolean(valueFrom(raw, extensions, ['matchScenario', 'match_scenario']), false),
    matchCreatorNotes: asBoolean(valueFrom(raw, extensions, ['matchCreatorNotes', 'match_creator_notes']), false),
    triggers: asStringArray(valueFrom(raw, extensions, ['triggers'])),
    ...characterFilterFields,
    extensions,
  }
}

function canonicalizeWorldEntryUpdates(
  updates: Partial<WorldBookEntry> | WorldBookEntryInput,
  baseExtensions: Record<string, unknown> = {},
): Partial<WorldBookEntry> {
  const next: Record<string, unknown> = { ...updates }
  const updateExtensions = isRecord(updates.extensions) ? updates.extensions : {}
  const extensions = { ...baseExtensions, ...updateExtensions }
  let hasExtensionUpdate = Object.hasOwn(updates, 'extensions')

  for (const [sourceKey, targetKey] of Object.entries(WORLD_ENTRY_UPDATE_ALIASES)) {
    if (Object.hasOwn(updates, sourceKey)) {
      next[targetKey] = updates[sourceKey]
    }
  }

  for (const [sourceKey, extensionKey] of Object.entries(WORLD_ENTRY_EXTENSION_KEYS)) {
    if (Object.hasOwn(updateExtensions, extensionKey)) {
      next[sourceKey] = updateExtensions[extensionKey]
    }
    if (Object.hasOwn(next, sourceKey)) {
      extensions[extensionKey] = next[sourceKey]
      hasExtensionUpdate = true
    }
  }

  if (Object.hasOwn(next, 'characterFilter')) {
    next.character_filter = next.characterFilter
  }

  if (hasExtensionUpdate) {
    next.extensions = extensions
  }

  return next as Partial<WorldBookEntry>
}

function valueFrom(raw: Record<string, unknown>, extensions: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.hasOwn(raw, key)) return raw[key]
    if (Object.hasOwn(extensions, key)) return extensions[key]
  }
  return undefined
}

function getWorldEntryRecords(value: unknown): Array<[string, Record<string, unknown>]> {
  if (Array.isArray(value)) {
    return value
      .map((entry, index): [string, Record<string, unknown>] | null => isRecord(entry) ? [String(index), entry] : null)
      .filter((entry): entry is [string, Record<string, unknown>] => entry !== null)
  }
  return isRecord(value)
    ? Object.entries(value).filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    : []
}

function getEntryFallbackUid(key: string, entry: Record<string, unknown>): number | undefined {
  const existingUid = firstNonNegativeInteger(entry.uid, entry.id)
  if (existingUid !== undefined) return existingUid

  const numericKey = Number(key)
  return Number.isInteger(numericKey) && numericKey >= 0 ? numericKey : undefined
}

function firstNonNegativeInteger(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isInteger(parsed) && parsed >= 0) return parsed
    }
  }
  return undefined
}

function nextAvailableUid(usedUids: Set<number>, start: number): number {
  let uid = Math.max(0, Math.floor(start))
  while (usedUids.has(uid)) uid += 1
  return uid
}

function normalizePosition(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value === 'before' || value === 'before_char') return 0
  if (value === 'after' || value === 'after_char') return 1
  if (value === 'an_top' || value === 'author_note_top') return 2
  if (value === 'an_bottom' || value === 'author_note_bottom') return 3
  if (value === 'at_depth') return 4
  if (value === 'example_top' || value === 'em_top') return 5
  if (value === 'example_bottom' || value === 'em_bottom') return 6
  if (value === 'outlet') return 7
  if (value === 'before_char') return 0
  if (value === 'after_char') return 1
  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asUid(value: unknown, fallback: number): number {
  return firstNonNegativeInteger(value) ?? fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function asBooleanOrNumber(value: unknown, fallback: boolean): boolean | number {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function asCharacterFilter(value: unknown): WorldBookEntryCharacterFilter | undefined {
  if (!isRecord(value)) return undefined
  return {
    names: asStringArray(value.names),
    tags: asStringArray(value.tags),
    isExclude: asBoolean(value.isExclude, false),
  }
}
