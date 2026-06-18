import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { importCharacterJson, getCharacter, updateCharacter } from '../services/character.service.js'
import { getWorld } from '../services/world.service.js'
import { readCharacterCard, writeCharacterCard } from '../lib/png-parser.js'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const testDataDir = path.join(os.tmpdir(), `luker-character-compat-${Date.now()}`)

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crcBuffer])
}

function minimalPng(): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x63, 0, 0, 0, 2, 0, 1])),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function textKeywords(pngPath: string): string[] {
  const buffer = fs.readFileSync(pngPath)
  const keywords: string[] = []
  let offset = 8
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'tEXt') {
      const end = data.indexOf(0)
      if (end !== -1) keywords.push(data.subarray(0, end).toString('latin1'))
    }
    offset += 12 + length
  }
  return keywords
}

beforeEach(() => {
  process.env.LUKER_DATA_DIR = testDataDir
  fs.mkdirSync(testDataDir, { recursive: true })
})

afterEach(() => {
  delete process.env.LUKER_DATA_DIR
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

describe('character card compatibility', () => {
  it('preserves V3 raw data, unknown fields, and regex extension payloads on import and update', async () => {
    const rawCard = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      top_level_runtime: { avatar: 'old.png' },
      data: {
        name: 'V3Bot',
        description: 'Original description',
        nickname: 'Vee',
        assets: [{ type: 'icon', uri: 'asset://icon.png' }],
        group_only_greetings: ['Group hello'],
        extensions: {
          regex_scripts: [{ script_name: 'KeepMe', find_regex: '/x/g' }],
          depth_prompt: { depth: 2, prompt: 'stay' },
        },
      },
    }

    await importCharacterJson(JSON.stringify(rawCard), 'v3bot.json')
    await updateCharacter('V3Bot', { description: 'Edited description' })

    const storedPath = path.join(testDataDir, 'characters', 'V3Bot', 'character.json')
    const stored = JSON.parse(fs.readFileSync(storedPath, 'utf8'))

    expect(stored.spec).toBe('chara_card_v3')
    expect(stored.top_level_runtime.avatar).toBe('old.png')
    expect(stored.data.description).toBe('Edited description')
    expect(stored.data.nickname).toBe('Vee')
    expect(stored.data.assets[0].uri).toBe('asset://icon.png')
    expect(stored.data.group_only_greetings).toEqual(['Group hello'])
    expect(stored.data.extensions.regex_scripts[0].script_name).toBe('KeepMe')

    const detail = await getCharacter('V3Bot')
    expect(detail.description).toBe('Edited description')
    expect(detail.extensions.regex_scripts).toHaveLength(1)
  })

  it('keeps existing flat CraftTalker character JSON readable', async () => {
    const charDir = path.join(testDataDir, 'characters', 'FlatBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({
        spec: 'chara_card_v2',
        spec_version: '2.0',
        name: 'FlatBot',
        description: 'Existing flat storage',
        extensions: { world: 'FlatWorld' },
      }),
      'utf8',
    )

    const detail = await getCharacter('FlatBot')

    expect(detail.name).toBe('FlatBot')
    expect(detail.description).toBe('Existing flat storage')
    expect(detail.extensions.world).toBe('FlatWorld')
  })

  it('extracts embedded world books without dropping ST disable/vectorized or unknown entry fields', async () => {
    const rawCard = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'WorldBot',
        description: 'Has a book',
        character_book: {
          description: 'Book description',
          scan_depth: 42,
          token_budget: 777,
          custom_book_field: 'preserve-me',
          entries: {
            '7': {
              uid: 7,
              keys: ['dragon'],
              secondary_keys: ['cave'],
              content: 'Dragon cave lore',
              disable: true,
              vectorized: true,
              selectiveLogic: 1,
              custom_entry_field: 'keep-entry',
            },
          },
        },
      },
    }

    await importCharacterJson(JSON.stringify(rawCard), 'worldbot.json')
    const world = await getWorld('WorldBot')
    const entry = world.entries['7']

    expect(world.custom_book_field).toBe('preserve-me')
    expect(world.scan_depth).toBe(42)
    expect(world.token_budget).toBe(777)
    expect(entry.key).toEqual(['dragon'])
    expect(entry.keysecondary).toEqual(['cave'])
    expect(entry.enabled).toBe(false)
    expect(entry.disable).toBe(true)
    expect(entry.vectorized).toBe(true)
    expect(entry.selectiveLogic).toBe(1)
    expect(entry.custom_entry_field).toBe('keep-entry')
  })

  it('extracts Character Book array entries using stable id and priority fields', async () => {
    const rawCard = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'ArrayBookBot',
        description: 'Has array book',
        character_book: {
          name: 'Array Book',
          description: 'Book description',
          entries: [
            {
              id: 12,
              keys: ['archive'],
              secondary_keys: ['sealed'],
              content: 'Archive lore',
              enabled: true,
              insertion_order: 30,
              priority: 44,
              position: 'before_char',
              extensions: {
                depth: 6,
                display_index: 3,
                match_whole_words: true,
                unknown_extension: 'keep-extension',
              },
            },
          ],
        },
      },
    }

    await importCharacterJson(JSON.stringify(rawCard), 'array-book-bot.json')
    const world = await getWorld('ArrayBookBot')
    const entry = world.entries['12']

    expect(world.name).toBe('ArrayBookBot')
    expect(entry.uid).toBe(12)
    expect(entry.key).toEqual(['archive'])
    expect(entry.keysecondary).toEqual(['sealed'])
    expect(entry.insertion_order).toBe(30)
    expect(entry.order).toBe(30)
    expect(entry.position).toBe(0)
    expect(entry.depth).toBe(6)
    expect(entry.displayIndex).toBe(3)
    expect(entry.matchWholeWords).toBe(true)
    expect(entry.extensions?.unknown_extension).toBe('keep-extension')
  })

  it('writes ccv3 and chara chunks for V3 PNG cards', () => {
    const sourcePng = path.join(testDataDir, 'source.png')
    const outputPng = path.join(testDataDir, 'card.png')
    fs.writeFileSync(sourcePng, minimalPng())

    const card = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: { name: 'PngBot', description: 'PNG card' },
    }

    writeCharacterCard(sourcePng, JSON.stringify(card), outputPng)

    expect(textKeywords(outputPng)).toEqual(expect.arrayContaining(['chara', 'ccv3']))
    expect(JSON.parse(readCharacterCard(outputPng)).data.name).toBe('PngBot')
  })
})
