import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import * as characterService from '../services/character.service.js'
import { AppError, createError, ErrorCode } from '../lib/errors.js'
import { safePath, validatePathInBase } from '../lib/path-utils.js'
import type { CharacterCard } from '../lib/png-parser.js'

const charactersRoute = new Hono()
const MAX_CHARACTER_IMPORT_BYTES = 20 * 1024 * 1024

function getImportDir(): string {
  return path.resolve(process.env.LUKER_IMPORT_DIR ?? path.join(os.tmpdir(), 'luker-import'))
}

function resolveImportPath(filePath: string): string {
  const IMPORT_DIR = getImportDir()
  const candidate = path.isAbsolute(filePath) ? filePath : path.join(IMPORT_DIR, filePath)
  return validatePathInBase(candidate, IMPORT_DIR)
}

function getSupportedExtension(fileName: string): '.png' | '.json' {
  const ext = path.extname(fileName).toLowerCase()
  if (ext !== '.png' && ext !== '.json') {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Unsupported character import file type', { fileName })
  }
  return ext
}

async function importCharacterFile(filePath: string, fileName = path.basename(filePath)) {
  const ext = getSupportedExtension(fileName)
  if (ext === '.json') {
    const json = await fs.readFile(filePath, 'utf8')
    return characterService.importCharacterJson(json, fileName)
  }
  return characterService.importCharacterFromPng(filePath)
}

charactersRoute.get('/', async (c) => {
  const characters = await characterService.listCharacters()
  return c.json(characters)
})

charactersRoute.get('/:name', async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const character = await characterService.getCharacter(name)
  return c.json(character)
})

charactersRoute.get('/:name/avatar', async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const avatarPath = characterService.getCharacterAvatarPath(name)
  if (!avatarPath) return c.json({ error: 'Avatar not found' }, 404)
  const buf = await fs.readFile(avatarPath)
  return c.body(buf, 200, {
    'Content-Type': characterService.getCharacterAvatarContentType(buf),
    'Cache-Control': 'public, max-age=3600',
  })
})

charactersRoute.get('/:name/card', async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const pngPath = characterService.getCharacterPngPath(name)
  if (!pngPath) return c.json({ error: 'Card image not found' }, 404)
  const buf = await fs.readFile(pngPath)
  return c.body(buf, 200, {
    'Content-Type': 'image/png',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}.png"`,
  })
})

const importSchema = z.object({
  filePath: z.string().min(1),
})

charactersRoute.post('/import', async (c) => {
  if (isFormRequest(c.req.header('content-type'))) {
    return importCharacterMultipart(c)
  }

  const body = await c.req.json().catch(() => undefined)
  const parsed = importSchema.safeParse(body)
  if (!parsed.success) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'filePath is required')
  }

  const { filePath } = parsed.data
  const importPath = resolveImportPath(filePath)
  const character = await importCharacterFile(importPath)
  return c.json(character, 201)
})

const uploadSchema = z.object({
  fileName: z.string().min(1),
  data: z.string().min(1),
})

charactersRoute.post('/upload', zValidator('json', uploadSchema), async (c) => {
  const { fileName, data } = c.req.valid('json')
  const ext = getSupportedExtension(fileName)
  const tmpDir = getImportDir()
  await fs.mkdir(tmpDir, { recursive: true })
  const tmpPath = safePath(tmpDir, `${randomUUID()}-${fileName}`)
  const buffer = Buffer.from(data, 'base64')

  try {
    if (ext === '.json') {
      const character = await characterService.importCharacterJson(buffer.toString('utf8'), fileName)
      return c.json(character, 201)
    }

    await fs.writeFile(tmpPath, buffer)
    const character = await characterService.importCharacterFromPng(tmpPath)
    return c.json(character, 201)
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  } finally {
    try { await fs.unlink(tmpPath) } catch {}
  }
})

charactersRoute.post('/create', async (c) => {
  const parsed = await parseStCharacterForm(c.req)
  const avatarBody = parsed.avatar ? await characterService.prepareCharacterAvatarUpload(parsed.avatar) : undefined
  const character = await characterService.createCharacter(parsed.card)
  if (!avatarBody) return c.json(character, 201)

  await characterService.saveCharacterAvatar(character.file_name, avatarBody)
  return c.json(await characterService.getCharacter(character.file_name), 201)
})

charactersRoute.post('/edit', async (c) => {
  const parsed = await parseStCharacterForm(c.req)
  const avatarBody = parsed.avatar ? await characterService.prepareCharacterAvatarUpload(parsed.avatar) : undefined
  const character = await characterService.updateCharacter(parsed.card.name, parsed.card)
  if (!avatarBody) return c.json(character)

  await characterService.saveCharacterAvatar(character.file_name, avatarBody)
  return c.json(await characterService.getCharacter(character.file_name))
})

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  personality: z.string().optional(),
  scenario: z.string().optional(),
  first_mes: z.string().optional(),
  mes_example: z.string().optional(),
  creator_notes: z.string().optional(),
  system_prompt: z.string().optional(),
  post_history_instructions: z.string().optional(),
  tags: z.array(z.string()).optional(),
  creator: z.string().optional(),
  character_version: z.string().optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
})

charactersRoute.patch('/:name', zValidator('json', updateSchema), async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const updates = c.req.valid('json')
  const updated = await characterService.updateCharacter(name, updates)
  return c.json(updated)
})

charactersRoute.post('/export', async (c) => {
  const payload = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const format = stringBodyValue(payload, 'format')
  const characterName = characterNameFromAvatarUrl(stringBodyValue(payload, 'avatar_url'))
  if (!format || !characterName) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'format and avatar_url are required')
  }

  if (format === 'json') {
    const data = await characterService.exportCharacter(characterName)
    return c.json(data, 200, {
      'Content-Disposition': `attachment; filename="${encodeURIComponent(characterName)}.json"`,
    })
  }

  if (format === 'png') {
    const data = await characterService.exportCharacterPng(characterName)
    return c.body(data.body, 200, {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(data.fileName)}"`,
    })
  }

  throw createError(ErrorCode.VALIDATION_ERROR, 'Unsupported character export format', { format })
})

charactersRoute.delete('/:name', async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  await characterService.deleteCharacter(name)
  return c.json({ success: true })
})

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  personality: z.string().optional(),
  scenario: z.string().optional(),
  first_mes: z.string().optional(),
  mes_example: z.string().optional(),
  creator_notes: z.string().optional(),
  system_prompt: z.string().optional(),
  post_history_instructions: z.string().optional(),
  tags: z.array(z.string()).optional(),
  creator: z.string().optional(),
  character_version: z.string().optional(),
})

charactersRoute.post('/', zValidator('json', createSchema), async (c) => {
  const data = c.req.valid('json')
  const character = await characterService.createCharacter(data)
  return c.json(character, 201)
})

charactersRoute.post('/:name/clone', async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const cloned = await characterService.cloneCharacter(name)
  return c.json(cloned, 201)
})

charactersRoute.get('/:name/export', async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const data = await characterService.exportCharacter(name)
  return c.json(data)
})

export { charactersRoute }

type HonoRequestLike = {
  parseBody: (options?: { all?: boolean }) => Promise<Record<string, unknown>>
}

type UploadedFormFile = {
  name?: string
  size?: number
  type?: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

type ParsedStCharacterForm = {
  card: Partial<CharacterCard> & { name: string }
  avatar?: UploadedFormFile
}

function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : undefined
}

function stringArrayField(body: Record<string, unknown>, key: string): string[] | undefined {
  const value = body[key]
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string')
  }
  return typeof value === 'string' ? [value] : undefined
}

function booleanField(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = stringField(body, key)
  if (value === undefined) return undefined
  if (value === 'true' || value === 'on' || value === '1') return true
  if (value === 'false' || value === 'off' || value === '0') return false
  return undefined
}

function numberField(body: Record<string, unknown>, key: string): number | undefined {
  const value = stringField(body, key)
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function uploadedFileField(body: Record<string, unknown>, key: string): UploadedFormFile | undefined {
  const value = body[key]
  const first = Array.isArray(value) ? value[0] : value
  return Boolean(first)
    && typeof first === 'object'
    && typeof (first as UploadedFormFile).arrayBuffer === 'function'
    ? first as UploadedFormFile
    : undefined
}

function isFormRequest(contentType: string | undefined): boolean {
  const normalized = contentType?.toLowerCase() ?? ''
  return normalized.includes('multipart/form-data') || normalized.includes('application/x-www-form-urlencoded')
}

function stringBodyValue(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  return typeof value === 'string' ? value.trim() : ''
}

function characterNameFromAvatarUrl(avatarUrl: string): string {
  if (!avatarUrl || avatarUrl.includes('\0')) return ''
  const normalized = avatarUrl.replaceAll('\\', '/')
  if (normalized.includes('/') || normalized.includes('..')) return ''
  const extension = path.extname(normalized).toLowerCase()
  if (extension && extension !== '.png') return ''
  const characterName = extension ? normalized.slice(0, -extension.length) : normalized
  return characterName && characterName !== '.' && characterName !== '..' ? characterName : ''
}

function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

function normalizeImportFileType(body: Record<string, unknown>, file?: UploadedFormFile): 'png' | 'json' {
  const explicit = stringField(body, 'file_type')?.replace(/^\./, '').toLowerCase()
  if (explicit === 'png' || explicit === 'json') return explicit

  const ext = path.extname(file?.name ?? '').replace(/^\./, '').toLowerCase()
  if (ext === 'png' || ext === 'json') return ext

  throw createError(ErrorCode.VALIDATION_ERROR, 'Unsupported character import file type')
}

function normalizeImportFileName(rawName: string | undefined, fileType: 'png' | 'json'): string {
  const name = String(rawName || `character.${fileType}`).trim()
  if (!name || name === '.' || name === '..' || name.includes('..') || name !== path.basename(name)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid character import file name')
  }

  const extension = path.extname(name).toLowerCase()
  if (!extension) return `${name}.${fileType}`
  if (extension !== `.${fileType}`) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Character import file type does not match the file name')
  }
  getSupportedExtension(name)
  return name
}

async function importCharacterMultipart(c: Context) {
  const body = await c.req.parseBody({ all: true })
  const file = uploadedFileField(body, 'avatar') ?? uploadedFileField(body, 'file')
  if (!file) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Character import file is required')
  }

  const fileType = normalizeImportFileType(body, file)
  const fileName = normalizeImportFileName(stringField(body, 'preserved_name') ?? file.name, fileType)
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length > MAX_CHARACTER_IMPORT_BYTES) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Character import file is too large', {
      maxBytes: MAX_CHARACTER_IMPORT_BYTES,
      size: buffer.length,
    })
  }

  try {
    if (fileType === 'json') {
      const character = await characterService.importCharacterJson(buffer.toString('utf8'), fileName)
      return c.json(character, 201)
    }

    const tmpDir = getImportDir()
    await fs.mkdir(tmpDir, { recursive: true })
    const tmpPath = safePath(tmpDir, `${randomUUID()}-${fileName}`)
    try {
      await fs.writeFile(tmpPath, buffer)
      const character = await importCharacterFile(tmpPath, fileName)
      return c.json(character, 201)
    } finally {
      try { await fs.unlink(tmpPath) } catch {}
    }
  } catch (error) {
    if (isAppError(error)) throw error
    throw createError(ErrorCode.VALIDATION_ERROR, 'Character import failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function parseJsonObjectField(body: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = stringField(body, key)
  if (!value) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    throw createError(ErrorCode.VALIDATION_ERROR, `Invalid ${key} JSON`)
  }
  return undefined
}

async function parseStCharacterForm(req: HonoRequestLike): Promise<ParsedStCharacterForm> {
  const body = await req.parseBody({ all: true })
  const name = stringField(body, 'ch_name') ?? stringField(body, 'name')
  if (!name) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Character name is required')
  }

  const patch: Partial<CharacterCard> & { name: string } = { name }
  for (const [field, value] of [
    ['description', stringField(body, 'description')],
    ['personality', stringField(body, 'personality')],
    ['scenario', stringField(body, 'scenario')],
    ['first_mes', stringField(body, 'first_mes')],
    ['mes_example', stringField(body, 'mes_example')],
    ['creator_notes', stringField(body, 'creator_notes')],
    ['creator', stringField(body, 'creator')],
    ['character_version', stringField(body, 'character_version')],
  ] as const) {
    if (value !== undefined) {
      patch[field] = value
    }
  }

  const alternateGreetings = stringArrayField(body, 'alternate_greetings')
  if (alternateGreetings !== undefined) patch.alternate_greetings = alternateGreetings

  const tags = stringArrayField(body, 'tags')
  if (tags !== undefined) patch.tags = tags

  let extensions = parseJsonObjectField(body, 'extensions')
  const world = stringField(body, 'world')
  if (world !== undefined) {
    extensions ??= {}
    extensions.world = world
  }

  const talkativeness = numberField(body, 'talkativeness')
  if (talkativeness !== undefined) {
    extensions ??= {}
    extensions.talkativeness = talkativeness
  }

  const fav = booleanField(body, 'fav')
  if (fav !== undefined) {
    extensions ??= {}
    extensions.fav = fav
  }
  if (extensions !== undefined) patch.extensions = extensions

  return {
    card: patch,
    avatar: uploadedFileField(body, 'avatar'),
  }
}
