import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCharacterCard, parseCharacterJson, serializeCharacterJson, toStoredCharacterJson, writeCharacterCardToBuffer, type CharacterCard } from '../lib/png-parser.js'
import { createError, ErrorCode } from '../lib/errors.js'
import { normalizeWorld, saveWorldBook, type WorldBook } from './world.service.js'
import { safePath } from '../lib/path-utils.js'
import {
  assertSupportedImage,
  getStoredImageContentType,
  readValidatedImageUpload,
  writeAtomicFile,
  type UploadedImageFile,
} from '../lib/image-storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')
const MAX_CHARACTER_AVATAR_BYTES = 10 * 1024 * 1024
const LEGACY_CHARACTER_AVATAR_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const characterIndexCache = new Map<string, { fingerprint: string; entry: CharacterIndexEntry }>()

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

export type UploadedCharacterAvatarFile = UploadedImageFile

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

async function fileFingerprint(filePath: string): Promise<string> {
  try {
    const stat = await fs.stat(filePath)
    return `1:${stat.mtimeMs}:${stat.size}`
  } catch (error) {
    if (isMissingFileError(error)) return '0'
    throw error
  }
}

async function getCharacterIndexFingerprint(name: string): Promise<string> {
  return (await Promise.all([
    fileFingerprint(getJsonPath(name)),
    fileFingerprint(getAvatarPath(name)),
    fileFingerprint(getPngPath(name)),
  ])).join('|')
}

function invalidateCharacterIndex(name: string): void {
  characterIndexCache.delete(getJsonPath(name))
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function normalizeLegacyCharacterAvatarFileName(fileName: string): string | null {
  const normalized = fileName.trim().replaceAll('\\', '/')
  if (!normalized || normalized.includes('/') || normalized.includes('\0')) return null

  const extension = path.extname(normalized).toLowerCase()
  if (extension && !LEGACY_CHARACTER_AVATAR_EXTENSIONS.has(extension)) return null

  const characterName = extension ? normalized.slice(0, -extension.length) : normalized
  if (!characterName || characterName === '.' || characterName === '..' || characterName.includes('..')) return null
  return characterName
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  const buffer = await fs.readFile(filePath)
  let text = buffer.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }
  return JSON.parse(text) as Record<string, unknown>
}

async function readCharacterJsonFile(filePath: string): Promise<CharacterCard> {
  const raw = await readJsonFile(filePath)
  return parseCharacterJson(JSON.stringify(raw))
}

async function extractAndSaveWorldBook(rawJson: string, worldName: string): Promise<void> {
  const data = JSON.parse(rawJson)
  const charData = data.data || data
  const book = charData.character_book
  if (!book || !book.entries) return

  const world = normalizeWorld({
    ...book,
    name: worldName,
    description: (book.description as string) ?? '',
    entries: book.entries,
    enabled: true,
  }, worldName) as WorldBook

  await saveWorldBook(world)
}

export async function listCharacters(): Promise<CharacterIndexEntry[]> {
  const charsDir = getCharactersDir()
  if (!existsSync(charsDir)) return []
  const entries = await fs.readdir(charsDir, { withFileTypes: true })
  const results = await Promise.all(entries.filter(d => d.isDirectory()).map(async (d) => {
    const jsonPath = getJsonPath(d.name)
    if (!existsSync(jsonPath)) return null
    try {
      const [stat, fingerprint] = await Promise.all([
        fs.stat(jsonPath),
        getCharacterIndexFingerprint(d.name),
      ])
      const cached = characterIndexCache.get(jsonPath)
      if (cached?.fingerprint === fingerprint) return cached.entry
      const card = await readCharacterJsonFile(jsonPath)
      const hasAvatar = existsSync(getAvatarPath(d.name)) || existsSync(getPngPath(d.name))
      const entry = {
        name: card.name, description: card.description, tags: card.tags ?? [], creator: card.creator,
        spec: card.spec, spec_version: card.spec_version,
        avatar: hasAvatar ? `/api/characters/${encodeURIComponent(d.name)}/avatar` : null,
        file_name: d.name, created_at: stat.birthtimeMs, updated_at: stat.mtimeMs,
        world: (card.extensions?.world as string) || null,
      } as CharacterIndexEntry
      characterIndexCache.set(jsonPath, { fingerprint, entry })
      return entry
    } catch { return null }
  }))
  return results.filter((r): r is CharacterIndexEntry => r !== null).sort((a, b) => b.updated_at - a.updated_at)
}
export async function getCharacter(name: string): Promise<CharacterDetail> {
  const jsonPath = getJsonPath(name)
  if (!existsSync(jsonPath)) {
    throw createError(ErrorCode.CHARACTER_NOT_FOUND, `角色 "${name}" 不存在`, { characterName: name })
  }

  const card = await readCharacterJsonFile(jsonPath)
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
  await fs.writeFile(jsonPath, serializeCharacterJson(card), 'utf8')
  invalidateCharacterIndex(safeName)

  return getCharacter(safeName)
}

export async function updateCharacter(name: string, data: Partial<CharacterCard>): Promise<CharacterDetail> {
  const existing = await getCharacter(name)
  const updated = { ...existing, ...data }
  const { avatar, file_name, created_at, updated_at, ...card } = updated

  const jsonPath = getJsonPath(name)
  await fs.writeFile(jsonPath, serializeCharacterJson(card), 'utf8')
  invalidateCharacterIndex(name)

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
  await fs.writeFile(jsonPath, serializeCharacterJson(card), 'utf8')

  const pngBuffer = await fs.readFile(filePath)
  const pngPath = getPngPath(safeName)
  await fs.writeFile(pngPath, pngBuffer)
  invalidateCharacterIndex(safeName)

  const worldName = (card.extensions?.world as string) || safeName
  try {
    await extractAndSaveWorldBook(jsonStr, worldName)
  } catch { /* non-fatal: world book extraction failure shouldn't block import */ }

  if (!card.extensions?.world) {
    const raw = JSON.parse(jsonStr)
    const charData = raw.data || raw
    if (charData.character_book?.entries && Object.keys(charData.character_book.entries).length > 0) {
      card.extensions = { ...card.extensions, world: worldName }
      await fs.writeFile(jsonPath, serializeCharacterJson(card), 'utf8')
      invalidateCharacterIndex(safeName)
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

  await fs.writeFile(jsonPath, serializeCharacterJson(card), 'utf8')
  invalidateCharacterIndex(safeName)
  return getCharacter(safeName)
}

export async function duplicateCharacter(name: string, newName: string): Promise<CharacterDetail> {
  const existing = await getCharacter(name)
  const { avatar, file_name, created_at, updated_at, ...card } = existing
  card.name = newName

  const safeName = newName.replace(/[/\\?%*:|"<>]/g, '_')
  const jsonPath = getJsonPath(safeName)
  await fs.mkdir(path.dirname(jsonPath), { recursive: true })
  await fs.writeFile(jsonPath, serializeCharacterJson(card), 'utf8')
  invalidateCharacterIndex(safeName)

  const avPath = getAvatarPath(name)
  if (existsSync(avPath)) {
    const newAvPath = getAvatarPath(safeName)
    await fs.mkdir(path.dirname(newAvPath), { recursive: true })
    await fs.copyFile(avPath, newAvPath)
    invalidateCharacterIndex(safeName)
  }

  return getCharacter(safeName)
}

export async function cloneCharacter(name: string): Promise<CharacterDetail> {
  const existing = await getCharacter(name)
  return duplicateCharacter(name, `${existing.name} (副本)`)
}

export async function exportCharacter(name: string): Promise<Record<string, unknown>> {
  return getShareableCharacterCard(name)
}

export async function exportCharacterPng(name: string): Promise<{ body: Buffer; fileName: string }> {
  const avatarPath = getCharacterAvatarPath(name)
  if (!avatarPath) {
    throw createError(ErrorCode.CHARACTER_NOT_FOUND, `Character avatar "${name}" was not found`, { characterName: name })
  }

  const imageBuffer = await fs.readFile(avatarPath)
  const card = await getShareableCharacterCard(name)
  return {
    body: writeCharacterCardToBuffer(imageBuffer, JSON.stringify(card)),
    fileName: `${name}.png`,
  }
}

export async function prepareCharacterAvatarUpload(file: UploadedCharacterAvatarFile): Promise<Buffer> {
  const { body } = await readValidatedImageUpload(file, {
    label: 'Character avatar',
    maxBytes: MAX_CHARACTER_AVATAR_BYTES,
  })
  return body
}

export async function saveCharacterAvatar(name: string, body: Buffer): Promise<void> {
  assertSupportedImage(body, {
    label: 'Character avatar',
    maxBytes: MAX_CHARACTER_AVATAR_BYTES,
  })
  await writeAtomicFile(getAvatarPath(name), body)
  invalidateCharacterIndex(name)
}

export async function deleteCharacter(name: string): Promise<boolean> {
  const charDir = getCharDir(name)
  if (!existsSync(charDir)) {
    throw createError(ErrorCode.CHARACTER_NOT_FOUND, `角色 "${name}" 不存在`, { characterName: name })
  }
  await fs.rm(charDir, { recursive: true, force: true })
  invalidateCharacterIndex(name)
  return true
}

export function getCharacterAvatarPath(name: string): string | null {
  const avPath = getAvatarPath(name)
  if (existsSync(avPath)) return avPath
  const pngPath = getPngPath(name)
  return existsSync(pngPath) ? pngPath : null
}

export function getLegacyCharacterAvatarPath(fileName: string): string | null {
  const characterName = normalizeLegacyCharacterAvatarFileName(fileName)
  return characterName ? getCharacterAvatarPath(characterName) : null
}

export function getCharacterAvatarContentType(body: Buffer): string {
  return getStoredImageContentType(body, 'avatar.png')
}

export function getCharacterPngPath(name: string): string | null {
  const pngPath = getPngPath(name)
  return existsSync(pngPath) ? pngPath : null
}

async function getShareableCharacterCard(name: string): Promise<Record<string, unknown>> {
  const existing = await getCharacter(name)
  const { avatar, file_name, created_at, updated_at, ...card } = existing
  const stored = toStoredCharacterJson(card as CharacterCard)
  unsetPrivateCharacterFields(stored)
  return stored
}

function unsetPrivateCharacterFields(card: Record<string, unknown>): void {
  card.fav = false
  delete card.chat
  const data = card.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const dataRecord = data as Record<string, unknown>
    const extensions = dataRecord.extensions
    if (extensions && typeof extensions === 'object' && !Array.isArray(extensions)) {
      ;(extensions as Record<string, unknown>).fav = false
    }
  }
}
