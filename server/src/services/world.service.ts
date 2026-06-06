import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createError, ErrorCode } from '../lib/errors.js'
import { safePath } from '../lib/path-utils.js'

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
  delay_until_recursion: boolean
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
}

export interface WorldBook {
  name: string
  description: string
  entries: Record<string, WorldBookEntry>
  enabled: boolean
  global_selective: boolean
  selective_default: boolean
  recursive_scanning: boolean
  scan_depth: number
  token_budget: number
  recursive_scanning_depth: number
  extensions: Record<string, unknown>
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
  bound_to: string[]
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
        const card = await readJsonFile(jsonPath)
        const worldName = (card.extensions as Record<string, unknown>)?.world as string | undefined
        if (worldName) {
          if (!bindings.has(worldName)) bindings.set(worldName, [])
          bindings.get(worldName)!.push(d.name)
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
          const world = await readJsonFile(filePath) as unknown as WorldBook
          return {
            name: world.name,
            description: world.description ?? '',
            entry_count: Object.keys(world.entries ?? {}).length,
            enabled: world.enabled ?? true,
            bound_to: bindings.get(world.name) ?? [],
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
  return await readJsonFile(filePath) as unknown as WorldBook
}

export async function createWorld(name: string, description?: string): Promise<WorldBook> {
  const world: WorldBook = {
    name,
    description: description ?? '',
    entries: {},
    enabled: true,
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
  await fs.writeFile(filePath, JSON.stringify(world, null, 2), 'utf8')
  return world
}

export async function saveWorldBook(world: WorldBook): Promise<WorldBook> {
  const filePath = getWorldPath(world.name)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(world, null, 2), 'utf8')
  return world
}

export async function updateWorld(name: string, updates: Partial<WorldBook>): Promise<WorldBook> {
  const existing = await getWorld(name)
  const merged = { ...existing, ...updates }
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

export async function addWorldEntry(worldName: string, entry: WorldBookEntry): Promise<WorldBook> {
  const world = await getWorld(worldName)
  const uid = entry.uid || Date.now()
  world.entries[String(uid)] = { ...entry, uid }
  return updateWorld(worldName, world)
}

export async function updateWorldEntry(worldName: string, uid: number, updates: Partial<WorldBookEntry>): Promise<WorldBook> {
  const world = await getWorld(worldName)
  const key = String(uid)
  if (!world.entries[key]) {
    throw createError(ErrorCode.NOT_FOUND, `世界书条目 "${uid}" 不存在`, { worldName, uid })
  }
  world.entries[key] = { ...world.entries[key], ...updates, uid }
  return updateWorld(worldName, world)
}

export async function deleteWorldEntry(worldName: string, uid: number): Promise<WorldBook> {
  const world = await getWorld(worldName)
  delete world.entries[String(uid)]
  return updateWorld(worldName, world)
}
