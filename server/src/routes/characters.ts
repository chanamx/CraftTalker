import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import * as characterService from '../services/character.service.js'
import { createError, ErrorCode } from '../lib/errors.js'
import { safePath, validatePathInBase } from '../lib/path-utils.js'

const charactersRoute = new Hono()

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
    'Content-Type': 'image/png',
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

charactersRoute.post('/import', zValidator('json', importSchema), async (c) => {
  const { filePath } = c.req.valid('json')
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
})

charactersRoute.patch('/:name', zValidator('json', updateSchema), async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const updates = c.req.valid('json')
  const updated = await characterService.updateCharacter(name, updates)
  return c.json(updated)
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
