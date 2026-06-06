import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCharacterCard, parseCharacterJson, type CharacterCard } from '../lib/png-parser.js'
import { createError, ErrorCode } from '../lib/errors.js'
import { saveWorldBook, type WorldBook, type WorldBookEntry } from './world.service.js'
import { safePath } from '../lib/path-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')

function getDataDir() { return process.env.LUKER_DATA_DIR ?? DEFAULT_DATA_DIR }
function getCharactersDir() { return path.join(getDataDir(), 'characters') }

export interface CharacterIndexEntry {
  name: string
  description: string
  tags: string[]
  creator: string
  spec: string
  spec_version: string
  avatar: string | null
  file_name: string
  created_at: number
  updated_at: number
  world: string | null
}

export interface CharacterDetail extends CharacterCard {
  avatar: string | null
  file_name: string
  created_at: number
  updated_at: number
}

function getCharDir(name: string): string {
  return safePath(getCharactersDir(), name)
}

function getJsonPath(name: string): string {
  return path.join(getCharDir(name), 'character.json')
}

function getPngPath(name: string): string {
  return path.join(getCharDir(name), 'character.png')
}

function getAvatarPath(name: string): string {
  return path.join(getCharDir(name), 'avatar.png')
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  const buffer = await fs.readFile(filePath)
  let text = buffer.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }
  return JSON.parse(text) as Record<string, unknown>
}

async function extractAndSaveWorldBook(rawJson: string, worldName: string): Promise<void> {
  const data = JSON.parse(rawJson)
  const charData = data.data || data
  const book = charData.character_book
  if (!book || !book.entries) return

  const entries: Record<string, WorldBookEntry> = {}
  for (const [key, entry] of Object.entries(book.entries)) {
    const e = entry as Record<string, unknown>
    const uid = (e.uid as number) ?? Number(key) ?? Date.now()
    entries[String(uid)] = {
      uid,
      key: (e.keys as string[]) ?? (e.key as string[]) ?? [],
      keysecondary: (e.secondary_keys as string[]) ?? (e.keysecondary as string[]) ?? [],
      comment: (e.comment as string) ?? (e.name as string) ?? '',
      content: (e.content as string) ?? '',
      constant: (e.constant as boolean) ?? false,
      selective: (e.selective as boolean) ?? false,
      insertion_order: (e.insertion_order as number) ?? 100,
      enabled: (e.enabled as boolean) ?? true,
      position: typeof e.position === 'number' ? e.position : (e.position === 'after_char' ? 1 : 0),
      depth: (e.depth as number) ?? 4,
      order: (e.order as number) ?? (e.insertion_order as number) ?? 100,
      use_regexp: (e.use_regex as boolean) ?? (e.use_regexp as boolean) ?? false,
      probability: (e.probability as number) ?? 100,
      group: (e.group as string) ?? '',
      group_override: (e.group_override as boolean) ?? false,
      exclude_recursion: (e.exclude_recursion as boolean) ?? false,
      prevent_recursion: (e.prevent_recursion as boolean) ?? false,
      delay_until_recursion: (e.delay_until_recursion as boolean) ?? false,
      scan_depth: (e.scan_depth as number) ?? 100,
      match_whole_words: (e.match_whole_words as boolean) ?? false,
      use_group_scoring: (e.use_group_scoring as boolean) ?? false,
      case_sensitive: (e.case_sensitive as boolean) ?? false,
      automation_id: (e.automation_id as string) ?? '',
      role: (e.role as number) ?? 0,
      sticky: (e.sticky as number) ?? 0,
      cooldown: (e.cooldown as number) ?? 0,
      delay: (e.delay as number) ?? 0,
      display_index: (e.display_index as number) ?? uid,
    }
  }

  const world: WorldBook = {
    name: worldName,
    description: (book.description as string) ?? '',
    entries,
    enabled: true,
    global_selective: (book.global_selective as boolean) ?? false,
    selective_default: (book.selective_default as boolean) ?? false,
    recursive_scanning: (book.recursive_scanning as boolean) ?? false,
    scan_depth: (book.scan_depth as number) ?? 100,
    token_budget: (book.token_budget as number) ?? 500,
    recursive_scanning_depth: (book.recursive_scanning_depth as number) ?? 2,
    extensions: (book.extensions as Record<string, unknown>) ?? {},
  }

  await saveWorldBook(world)
}

export async function listCharacters(): Promise<CharacterIndexEntry[]> {
  const charsDir = getCharactersDir()
  if (!existsSync(charsDir)) return []

  const entries = await fs.readdir(charsDir, { withFileTypes: true })
  const results = await Promise.all(
    entries
      .filter(d => d.isDirectory())
      .map(async (d) => {
        const jsonPath = getJsonPath(d.name)
        if (!existsSync(jsonPath)) return null
        try {
          const card = await readJsonFile(jsonPath) as unknown as CharacterCard
          const stat = await fs.stat(jsonPath)
          const hasAvatar = existsSync(getAvatarPath(d.name)) || existsSync(getPngPath(d.name))
          return {
            name: card.name,
            description: card.description,
            tags: card.tags ?? [],
            creator: card.creator,
            spec: card.spec,
            spec_version: card.spec_version,
            avatar: hasAvatar ? `/api/characters/${encodeURIComponent(d.name)}/avatar` : null,
            file_name: d.name,
            created_at: stat.birthtimeMs,
            updated_at: stat.mtimeMs,
            world: (card.extensions?.world as string) || null,
          } as CharacterIndexEntry
        } catch { return null }
      })
  )

  return results
    .filter((r): r is CharacterIndexEntry => r !== null)
    .sort((a, b) => b.updated_at - a.updated_at)
}

export async function getCharacter(name: string): Promise<CharacterDetail> {
  const jsonPath = getJsonPath(name)
  if (!existsSync(jsonPath)) {
    throw createError(ErrorCode.CHARACTER_NOT_FOUND, `角色 "${name}" 不存在`, { characterName: name })
  }

  const card = await readJsonFile(jsonPath) as unknown as CharacterCard
  const stat = await fs.stat(jsonPath)
  const hasAvatar = existsSync(getAvatarPath(name)) || existsSync(getPngPath(name))

  return {
    ...card,
    avatar: hasAvatar ? `/api/characters/${encodeURIComponent(name)}/avatar` : null,
    file_name: name,
    created_at: stat.birthtimeMs,
    updated_at: stat.mtimeMs,
  }
}

export async function createCharacter(data: Partial<CharacterCard>): Promise<CharacterDetail> {
  if (!data.name) {
    throw createError(ErrorCode.VALIDATION_ERROR, '角色名称不能为空', {})
  }

  const safeName = data.name.replace(/[/\\?%*:|"<>]/g, '_')
  const charDir = getCharDir(safeName)
  await fs.mkdir(charDir, { recursive: true })

  const card: CharacterCard = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    name: data.name,
    description: data.description ?? '',
    personality: data.personality ?? '',
    scenario: data.scenario ?? '',
    first_mes: data.first_mes ?? '',
    mes_example: data.mes_example ?? '',
    creator_notes: data.creator_notes ?? '',
    system_prompt: data.system_prompt ?? '',
    post_history_instructions: data.post_history_instructions ?? '',
    tags: data.tags ?? [],
    creator: data.creator ?? '',
    character_version: data.character_version ?? '1.0',
    alternate_greetings: data.alternate_greetings ?? [],
    extensions: data.extensions ?? {},
  }

  const jsonPath = getJsonPath(safeName)
  await fs.writeFile(jsonPath, JSON.stringify(card, null, 2), 'utf8')

  return getCharacter(safeName)
}

export async function updateCharacter(name: string, data: Partial<CharacterCard>): Promise<CharacterDetail> {
  const existing = await getCharacter(name)
  const updated = { ...existing, ...data }
  const { avatar, file_name, created_at, updated_at, ...card } = updated

  const jsonPath = getJsonPath(name)
  await fs.writeFile(jsonPath, JSON.stringify(card, null, 2), 'utf8')

  return getCharacter(name)
}

export async function importCharacterFromPng(filePath: string): Promise<CharacterDetail> {
  const jsonStr = readCharacterCard(filePath)
  const card = parseCharacterJson(jsonStr)
  const fileName = path.basename(filePath)
  const safeName = (card.name || fileName.replace('.png', '')).replace(/[/\\?%*:|"<>]/g, '_')
  const charDir = getCharDir(safeName)
  await fs.mkdir(charDir, { recursive: true })

  const jsonPath = getJsonPath(safeName)
  await fs.writeFile(jsonPath, JSON.stringify(card, null, 2), 'utf8')

  const pngBuffer = await fs.readFile(filePath)
  const pngPath = getPngPath(safeName)
  await fs.writeFile(pngPath, pngBuffer)

  const worldName = (card.extensions?.world as string) || safeName
  try {
    await extractAndSaveWorldBook(jsonStr, worldName)
  } catch { /* non-fatal: world book extraction failure shouldn't block import */ }

  if (!card.extensions?.world) {
    const raw = JSON.parse(jsonStr)
    const charData = raw.data || raw
    if (charData.character_book?.entries && Object.keys(charData.character_book.entries).length > 0) {
      card.extensions = { ...card.extensions, world: worldName }
      await fs.writeFile(jsonPath, JSON.stringify(card, null, 2), 'utf8')
    }
  }

  return getCharacter(safeName)
}

export async function importCharacterJson(jsonStr: string, fileName: string): Promise<CharacterDetail> {
  const card = parseCharacterJson(jsonStr)
  if (!card) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'JSON 文件不包含有效角色数据', { fileName })
  }

  const safeName = (card.name || fileName.replace('.json', '')).replace(/[/\\?%*:|"<>]/g, '_')
  const jsonPath = getJsonPath(safeName)
  await fs.mkdir(path.dirname(jsonPath), { recursive: true })

  const worldName = (card.extensions?.world as string) || safeName
  try {
    await extractAndSaveWorldBook(jsonStr, worldName)
  } catch { /* non-fatal */ }

  if (!card.extensions?.world) {
    const raw = JSON.parse(jsonStr)
    const charData = raw.data || raw
    if (charData.character_book?.entries && Object.keys(charData.character_book.entries).length > 0) {
      card.extensions = { ...card.extensions, world: worldName }
    }
  }

  await fs.writeFile(jsonPath, JSON.stringify(card, null, 2), 'utf8')
  return getCharacter(safeName)
}

export async function duplicateCharacter(name: string, newName: string): Promise<CharacterDetail> {
  const existing = await getCharacter(name)
  const { avatar, file_name, created_at, updated_at, ...card } = existing
  card.name = newName

  const safeName = newName.replace(/[/\\?%*:|"<>]/g, '_')
  const jsonPath = getJsonPath(safeName)
  await fs.mkdir(path.dirname(jsonPath), { recursive: true })
  await fs.writeFile(jsonPath, JSON.stringify(card, null, 2), 'utf8')

  const avPath = getAvatarPath(name)
  if (existsSync(avPath)) {
    const newAvPath = getAvatarPath(safeName)
    await fs.mkdir(path.dirname(newAvPath), { recursive: true })
    await fs.copyFile(avPath, newAvPath)
  }

  return getCharacter(safeName)
}

export async function cloneCharacter(name: string): Promise<CharacterDetail> {
  const existing = await getCharacter(name)
  return duplicateCharacter(name, `${existing.name} (副本)`)
}

export async function exportCharacter(name: string): Promise<CharacterCard> {
  const existing = await getCharacter(name)
  const { avatar, file_name, created_at, updated_at, ...card } = existing
  return card as CharacterCard
}

export async function deleteCharacter(name: string): Promise<boolean> {
  const charDir = getCharDir(name)
  if (!existsSync(charDir)) {
    throw createError(ErrorCode.CHARACTER_NOT_FOUND, `角色 "${name}" 不存在`, { characterName: name })
  }
  await fs.rm(charDir, { recursive: true, force: true })
  return true
}

export function getCharacterAvatarPath(name: string): string | null {
  const avPath = getAvatarPath(name)
  if (existsSync(avPath)) return avPath
  const pngPath = getPngPath(name)
  return existsSync(pngPath) ? pngPath : null
}

export function getCharacterPngPath(name: string): string | null {
  const pngPath = getPngPath(name)
  return existsSync(pngPath) ? pngPath : null
}
