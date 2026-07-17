import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createCharacter,
  deleteCharacter,
  listCharacters,
  saveCharacterAvatar,
} from '../services/character.service.js'

const GIF_IMAGE = Buffer.from('GIF89a', 'ascii')

describe('character summary cache', () => {
  let dataDir = ''

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crafttalker-character-cache-'))
    process.env.LUKER_DATA_DIR = dataDir
  })

  afterEach(async () => {
    delete process.env.LUKER_DATA_DIR
    await fs.rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  })

  it('refreshes the cached summary immediately after an avatar is saved', async () => {
    const character = await createCharacter({ name: 'AvatarCache', description: 'No avatar yet' })

    expect((await listCharacters()).find(entry => entry.file_name === character.file_name)?.avatar).toBeNull()

    await saveCharacterAvatar(character.file_name, GIF_IMAGE)

    expect((await listCharacters()).find(entry => entry.file_name === character.file_name)?.avatar)
      .toBe('/api/characters/AvatarCache/avatar')
  })

  it('does not reuse a deleted character summary when the same path is recreated', async () => {
    const character = await createCharacter({ name: 'ReusedPath', description: 'Before delete' })
    const jsonPath = path.join(dataDir, 'characters', character.file_name, 'character.json')
    const originalStat = await fs.stat(jsonPath)
    const originalBody = await fs.readFile(jsonPath, 'utf8')

    expect((await listCharacters()).find(entry => entry.file_name === character.file_name)?.description)
      .toBe('Before delete')

    await deleteCharacter(character.file_name)
    await fs.mkdir(path.dirname(jsonPath), { recursive: true })
    await fs.writeFile(jsonPath, originalBody.replace('Before delete', 'After  delete'), 'utf8')
    await fs.utimes(jsonPath, originalStat.atime, originalStat.mtime)

    expect((await listCharacters()).find(entry => entry.file_name === character.file_name)?.description)
      .toBe('After  delete')
  })
})
