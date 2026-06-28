import fs from 'node:fs'
import path from 'node:path'
import { Buffer } from 'node:buffer'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

interface PNGChunk {
  length: number
  type: string
  data: Buffer
  crc: number
}

function readChunks(buffer: Buffer): PNGChunk[] {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a valid PNG file')
  }

  const chunks: PNGChunk[] = []
  let offset = 8

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    const crc = buffer.readUInt32BE(offset + 8 + length)
    chunks.push({ length, type, data, crc })
    offset += 12 + length
  }

  return chunks
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crcData = Buffer.concat([typeBuffer, data])

  let crc = 0xffffffff
  for (let i = 0; i < crcData.length; i++) {
    crc ^= crcData[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  crc = (crc ^ 0xffffffff) >>> 0

  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc)

  return Buffer.concat([length, typeBuffer, data, crcBuffer])
}

export function readCharacterCard(pngPath: string): string {
  const buffer = fs.readFileSync(pngPath)
  const chunks = readChunks(buffer)

  const textChunks = chunks.filter(c => c.type === 'tEXt')

  for (const chunk of textChunks) {
    const keywordEnd = chunk.data.indexOf(0)
    if (keywordEnd === -1) continue
    const keyword = chunk.data.subarray(0, keywordEnd).toString('latin1')
    const text = chunk.data.subarray(keywordEnd + 1).toString('latin1')

    if (keyword === 'ccv3') {
      return Buffer.from(text, 'base64').toString('utf8')
    }
  }

  for (const chunk of textChunks) {
    const keywordEnd = chunk.data.indexOf(0)
    if (keywordEnd === -1) continue
    const keyword = chunk.data.subarray(0, keywordEnd).toString('latin1')
    const text = chunk.data.subarray(keywordEnd + 1).toString('latin1')

    if (keyword === 'chara') {
      return Buffer.from(text, 'base64').toString('utf8')
    }
  }

  throw new Error('No character card data found in PNG')
}

export function writeCharacterCard(imagePath: string, jsonData: string, outputPath: string): void {
  const imageBuffer = fs.readFileSync(imagePath)
  const output = writeCharacterCardToBuffer(imageBuffer, jsonData)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, output)
}

export function writeCharacterCardToBuffer(imageBuffer: Buffer, jsonData: string): Buffer {
  const chunks = readChunks(imageBuffer)

  const filtered = chunks.filter(c => {
    if (c.type !== 'tEXt') return true
    const keywordEnd = c.data.indexOf(0)
    if (keywordEnd === -1) return true
    const keyword = c.data.subarray(0, keywordEnd).toString('latin1').toLowerCase()
    return keyword !== 'chara' && keyword !== 'ccv3'
  })

  const base64Data = Buffer.from(jsonData, 'utf8').toString('base64')
  const cardSpec = getCharacterCardSpec(jsonData)
  const textKeywords = cardSpec === 'chara_card_v3' ? ['chara', 'ccv3'] : ['chara']
  const textChunks = textKeywords.map((keyword) => {
    const text = Buffer.concat([Buffer.from(`${keyword}\0`), Buffer.from(base64Data, 'latin1')])
    const chunk = createChunk('tEXt', text)
    return {
      length: chunk.length - 12,
      type: 'tEXt',
      data: text,
      crc: chunk.readUInt32BE(chunk.length - 4),
    }
  })

  const iendIndex = filtered.findIndex(c => c.type === 'IEND')
  const insertIndex = iendIndex === -1 ? filtered.length : iendIndex

  const newChunks = [...filtered.slice(0, insertIndex), ...textChunks, ...filtered.slice(insertIndex)]

  const output = Buffer.alloc(8 + newChunks.reduce((acc, c) => acc + 12 + c.length, 0))
  PNG_SIGNATURE.copy(output, 0)
  let offset = 8
  for (const chunk of newChunks) {
    const buf = createChunk(chunk.type, chunk.data)
    buf.copy(output, offset)
    offset += buf.length
  }

  return output
}

export function parseCharacterJson(raw: string): CharacterCard {
  const data = JSON.parse(raw)
  if (data.spec === 'chara_card_v2' || data.spec === 'chara_card_v3') {
    const hasNestedData = isRecord(data.data)
    const cardData = hasNestedData ? data.data : data
    const extensions = isRecord(cardData.extensions) ? cardData.extensions : {}
    const card: CharacterCard = {
      ...data,
      spec: data.spec,
      spec_version: data.spec_version,
      name: asString(cardData.name),
      description: asString(cardData.description),
      personality: asString(cardData.personality),
      scenario: asString(cardData.scenario),
      first_mes: asString(cardData.first_mes),
      mes_example: asString(cardData.mes_example),
      creator_notes: asString(cardData.creator_notes),
      system_prompt: asString(cardData.system_prompt),
      post_history_instructions: asString(cardData.post_history_instructions),
      alternate_greetings: asStringArray(cardData.alternate_greetings),
      tags: asStringArray(cardData.tags),
      creator: asString(cardData.creator),
      character_version: asString(cardData.character_version),
      extensions,
    }
    if (hasNestedData) {
      card.data = { ...cardData, extensions }
    }
    return card
  }

  const extensions = isRecord(data.extensions) ? data.extensions : {}
  return {
    ...data,
    spec: 'chara_card_v2',
    spec_version: '2.0',
    name: asString(data.name),
    description: asString(data.description),
    personality: asString(data.personality),
    scenario: asString(data.scenario),
    first_mes: asString(data.first_mes),
    mes_example: asString(data.mes_example),
    creator_notes: asString(data.creatorcomment ?? data.creator_notes),
    system_prompt: asString(data.system_prompt),
    post_history_instructions: asString(data.post_history_instructions),
    alternate_greetings: asStringArray(data.alternate_greetings),
    tags: asStringArray(data.tags),
    creator: asString(data.creator),
    character_version: asString(data.character_version),
    extensions,
  }
}

export function serializeCharacterJson(card: CharacterCard, space: number = 2): string {
  return JSON.stringify(toStoredCharacterJson(card), null, space)
}

export function toStoredCharacterJson(card: CharacterCard): Record<string, unknown> {
  if (isRecord(card.data) || card.spec === 'chara_card_v2' || card.spec === 'chara_card_v3') {
    const stored: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(card)) {
      if (!CHARACTER_DATA_KEYS.has(key) && value !== undefined) {
        stored[key] = value
      }
    }

    stored.spec = card.spec || 'chara_card_v2'
    stored.spec_version = card.spec_version || '2.0'

    const data = isRecord(card.data) ? { ...card.data } : {}
    for (const key of CHARACTER_DATA_KEYS) {
      const value = card[key]
      if (value !== undefined) {
        data[key] = value
      }
    }
    data.extensions = card.extensions ?? {}
    stored.data = data
    return stored
  }

  return { ...card }
}

const CHARACTER_DATA_KEYS = new Set([
  'name',
  'description',
  'personality',
  'scenario',
  'first_mes',
  'mes_example',
  'creator_notes',
  'system_prompt',
  'post_history_instructions',
  'alternate_greetings',
  'tags',
  'creator',
  'character_version',
  'extensions',
])

function getCharacterCardSpec(jsonData: string): string | undefined {
  try {
    const parsed = JSON.parse(jsonData) as { spec?: unknown }
    return typeof parsed.spec === 'string' ? parsed.spec : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export interface CharacterCard {
  spec: string
  spec_version: string
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  creator_notes: string
  system_prompt?: string
  post_history_instructions?: string
  alternate_greetings?: string[]
  tags: string[]
  creator: string
  character_version: string
  extensions: Record<string, unknown>
  data?: Record<string, unknown>
  [key: string]: unknown
}
