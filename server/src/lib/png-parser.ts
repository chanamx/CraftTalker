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
  const chunks = readChunks(imageBuffer)

  const filtered = chunks.filter(c => {
    if (c.type !== 'tEXt') return true
    const keywordEnd = c.data.indexOf(0)
    if (keywordEnd === -1) return true
    const keyword = c.data.subarray(0, keywordEnd).toString('latin1').toLowerCase()
    return keyword !== 'chara' && keyword !== 'ccv3'
  })

  const base64Data = Buffer.from(jsonData, 'utf8').toString('base64')
  const charaText = Buffer.concat([Buffer.from('chara\0'), Buffer.from(base64Data, 'latin1')])
  const charaChunk = createChunk('tEXt', charaText)

  const iendIndex = filtered.findIndex(c => c.type === 'IEND')
  const insertIndex = iendIndex === -1 ? filtered.length : iendIndex

  const newChunks = [...filtered.slice(0, insertIndex), {
    length: charaChunk.length - 12,
    type: 'tEXt',
    data: charaText,
    crc: charaChunk.readUInt32BE(charaChunk.length - 4),
  }, ...filtered.slice(insertIndex)]

  const output = Buffer.alloc(8 + newChunks.reduce((acc, c) => acc + 12 + c.length, 0))
  PNG_SIGNATURE.copy(output, 0)
  let offset = 8
  for (const chunk of newChunks) {
    const buf = createChunk(chunk.type, chunk.data)
    buf.copy(output, offset)
    offset += buf.length
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, output)
}

export function parseCharacterJson(raw: string): CharacterCard {
  const data = JSON.parse(raw)
  if (data.spec === 'chara_card_v2' || data.spec === 'chara_card_v3') {
    return {
      spec: data.spec,
      spec_version: data.spec_version,
      name: data.data?.name ?? '',
      description: data.data?.description ?? '',
      personality: data.data?.personality ?? '',
      scenario: data.data?.scenario ?? '',
      first_mes: data.data?.first_mes ?? '',
      mes_example: data.data?.mes_example ?? '',
      creator_notes: data.data?.creator_notes ?? '',
      system_prompt: data.data?.system_prompt ?? '',
      post_history_instructions: data.data?.post_history_instructions ?? '',
      alternate_greetings: data.data?.alternate_greetings ?? [],
      tags: data.data?.tags ?? [],
      creator: data.data?.creator ?? '',
      character_version: data.data?.character_version ?? '',
      extensions: data.data?.extensions ?? {},
    }
  }

  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    name: data.name ?? '',
    description: data.description ?? '',
    personality: data.personality ?? '',
    scenario: data.scenario ?? '',
    first_mes: data.first_mes ?? '',
    mes_example: data.mes_example ?? '',
    creator_notes: data.creatorcomment ?? '',
    tags: data.tags ?? [],
    creator: data.creator ?? '',
    character_version: data.character_version ?? '',
    extensions: data.extensions ?? {},
  }
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
}
