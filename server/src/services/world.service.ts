import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createError, ErrorCode } from '../lib/errors.js'
import { safePath } from '../lib/path-utils.js'
import { parseCharacterJson } from '../lib/png-parser.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')

function getDataDir() { return process.env.LUKER_DATA_DIR ?? DEFAULT_DATA_DIR }
function getWorldsDir() { return path.join(getDataDir(), 'worlds') }

export interface WorldBookEntry {
  uid: number
  key: string[]
  keysecondary: string[]
  comment: string
  content: string
  constant: boolean
  selective: boolean
  insertion_order: number
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

export type WorldBookEntryInput =
  Pick<WorldBookEntry, 'key' | 'content'> &
  Partial<Omit<WorldBookEntry, 'key' | 'content'>>

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
          const world = normalizeWorld(await readJsonFile(filePath))
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
  return normalizeWorld(await readJsonFile(filePath))
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
  const merged = normalizeWorld({ ...existing, ...updates })
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
  const uid = entry.uid || Date.now()
  world.entries[String(uid)] = normalizeWorldEntry({ ...entry, uid })
  return updateWorld(worldName, world)
}

export async function updateWorldEntry(worldName: string, uid: number, updates: Partial<WorldBookEntry>): Promise<WorldBook> {
  const world = await getWorld(worldName)
  const key = String(uid)
  if (!world.entries[key]) {
    throw createError(ErrorCode.NOT_FOUND, `世界书条目 "${uid}" 不存在`, { worldName, uid })
  }
  world.entries[key] = normalizeWorldEntry({ ...world.entries[key], ...updates, uid })
  return updateWorld(worldName, world)
}

export async function deleteWorldEntry(worldName: string, uid: number): Promise<WorldBook> {
  const world = await getWorld(worldName)
  delete world.entries[String(uid)]
  return updateWorld(worldName, world)
}

export function normalizeWorld(raw: Record<string, unknown>): WorldBook {
  const entriesRaw = isRecord(raw.entries) ? raw.entries : {}
  const entries: Record<string, WorldBookEntry> = {}

  for (const [key, value] of Object.entries(entriesRaw)) {
    if (!isRecord(value)) continue
    const entry = normalizeWorldEntry(value)
    entries[String(entry.uid || key)] = entry
  }

  return {
    ...raw,
    name: asString(raw.name),
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
  const uid = asNumber(raw.uid, Date.now())
  const useRegexp = asBoolean(valueFrom(raw, extensions, ['use_regexp', 'use_regex']), false)
  const insertionOrder = asNumber(valueFrom(raw, extensions, ['insertion_order', 'order']), 100)
  const positionValue = valueFrom(raw, extensions, ['position'])
  const groupOverride = asBoolean(valueFrom(raw, extensions, ['groupOverride', 'group_override']), false)
  const groupWeight = asNumber(valueFrom(raw, extensions, ['groupWeight', 'group_weight']), 100)
  const ignoreBudget = asBoolean(valueFrom(raw, extensions, ['ignoreBudget', 'ignore_budget']), false)
  const selectiveLogic = asNumber(valueFrom(raw, extensions, ['selectiveLogic', 'selective_logic']), 0)
  const outletName = asString(valueFrom(raw, extensions, ['outletName', 'outlet_name']))
  const vectorized = asBoolean(valueFrom(raw, extensions, ['vectorized']), false)

  return {
    ...raw,
    uid,
    key: asStringArray(raw.key ?? raw.keys),
    keysecondary: asStringArray(raw.keysecondary ?? raw.secondary_keys),
    comment: asString(raw.comment ?? raw.name),
    content: asString(raw.content),
    constant: Boolean(raw.constant),
    selective: Boolean(raw.selective),
    insertion_order: insertionOrder,
    enabled,
    disable: !enabled,
    position: normalizePosition(positionValue),
    depth: asNumber(valueFrom(raw, extensions, ['depth']), 4),
    order: asNumber(valueFrom(raw, extensions, ['order', 'insertion_order']), insertionOrder),
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
    exclude_recursion: asBoolean(valueFrom(raw, extensions, ['excludeRecursion', 'exclude_recursion']), false),
    prevent_recursion: asBoolean(valueFrom(raw, extensions, ['preventRecursion', 'prevent_recursion']), false),
    delay_until_recursion: asBooleanOrNumber(valueFrom(raw, extensions, ['delayUntilRecursion', 'delay_until_recursion']), false),
    scan_depth: asNumber(valueFrom(raw, extensions, ['scanDepth', 'scan_depth']), 100),
    match_whole_words: asBoolean(valueFrom(raw, extensions, ['matchWholeWords', 'match_whole_words']), false),
    use_group_scoring: asBoolean(valueFrom(raw, extensions, ['useGroupScoring', 'use_group_scoring']), false),
    case_sensitive: asBoolean(valueFrom(raw, extensions, ['caseSensitive', 'case_sensitive']), false),
    automation_id: asString(valueFrom(raw, extensions, ['automationId', 'automation_id'])),
    role: asNumber(valueFrom(raw, extensions, ['role']), 0),
    sticky: asNumber(valueFrom(raw, extensions, ['sticky']), 0),
    cooldown: asNumber(valueFrom(raw, extensions, ['cooldown']), 0),
    delay: asNumber(valueFrom(raw, extensions, ['delay']), 0),
    display_index: asNumber(valueFrom(raw, extensions, ['displayIndex', 'display_index']), uid),
    extensions,
  }
}

function valueFrom(raw: Record<string, unknown>, extensions: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.hasOwn(raw, key)) return raw[key]
    if (Object.hasOwn(extensions, key)) return extensions[key]
  }
  return undefined
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
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
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
