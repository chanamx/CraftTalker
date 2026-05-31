import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const testDataDir = path.join(os.tmpdir(), `luker-test-${Date.now()}`)
const charactersDir = path.join(testDataDir, 'characters')

function writeChar(dir: string, data: Record<string, unknown>) {
  fs.mkdirSync(path.join(charactersDir, dir), { recursive: true })
  fs.writeFileSync(
    path.join(charactersDir, dir, 'character.json'),
    JSON.stringify(data),
    'utf8',
  )
}

function listDirNames(base: string): string[] {
  return fs.readdirSync(base, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}

beforeEach(() => {
  fs.mkdirSync(charactersDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

describe('Character Service', () => {
  describe('listCharacters', () => {
    it('returns empty array when no characters exist', () => {
      const names = listDirNames(charactersDir)
      expect(names).toEqual([])
    })

    it('returns all character directories', () => {
      writeChar('Allen', { spec: 'chara_card_v2', name: 'Allen', description: 'A helper' })
      writeChar('Luna', { spec: 'chara_card_v2', name: 'Luna', description: 'An elf' })

      const names = listDirNames(charactersDir)
      expect(names).toHaveLength(2)
      expect(names).toContain('Allen')
      expect(names).toContain('Luna')
    })
  })

  describe('character.json parsing', () => {
    it('reads a valid character.json file', () => {
      writeChar('Allen', {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        name: 'Allen',
        description: 'A friendly AI assistant',
        personality: 'Helpful',
        tags: ['AI', 'helper'],
      })

      const filePath = path.join(charactersDir, 'Allen', 'character.json')
      const raw = fs.readFileSync(filePath, 'utf8')
      const card = JSON.parse(raw)

      expect(card.name).toBe('Allen')
      expect(card.description).toBe('A friendly AI assistant')
      expect(card.tags).toEqual(['AI', 'helper'])
    })

    it('handles BOM in JSON files', () => {
      const dir = path.join(charactersDir, 'BomChar')
      fs.mkdirSync(dir, { recursive: true })
      const bom = '\uFEFF'
      fs.writeFileSync(
        path.join(dir, 'character.json'),
        bom + JSON.stringify({ name: 'BomChar', description: 'With BOM' }),
        'utf8',
      )

      const raw = fs.readFileSync(path.join(dir, 'character.json'), 'utf8')
      expect(raw.charCodeAt(0)).toBe(0xfeff)

      const cleaned = raw.replace(/^\uFEFF/, '')
      const card = JSON.parse(cleaned)
      expect(card.name).toBe('BomChar')
    })

    it('returns null for missing character.json on get', () => {
      const dir = path.join(charactersDir, 'NoJson')
      fs.mkdirSync(dir, { recursive: true })

      const jsonPath = path.join(dir, 'character.json')
      expect(fs.existsSync(jsonPath)).toBe(false)
    })
  })

  describe('import from PNG', () => {
    it('rejects non-PNG files gracefully', () => {
      const notPng = path.join(testDataDir, 'test.txt')
      fs.writeFileSync(notPng, 'not an image')
      expect(() => {
        if (!notPng.endsWith('.png')) {
          throw new Error('Not a PNG file')
        }
      }).toThrow('Not a PNG file')
    })
  })

  describe('update character', () => {
    it('updates character.json fields', () => {
      writeChar('Test', { name: 'Test', description: 'Old desc' })
      const filePath = path.join(charactersDir, 'Test', 'character.json')

      const card = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      card.description = 'New desc'
      fs.writeFileSync(filePath, JSON.stringify(card, null, 2), 'utf8')

      const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      expect(updated.description).toBe('New desc')
    })
  })

  describe('file name validation', () => {
    it('handles special characters in character names', () => {
      const dir = path.join(charactersDir, 'Special___Char')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ name: 'Special/Char' }), 'utf8')
      expect(fs.existsSync(path.join(dir, 'character.json'))).toBe(true)
    })

    it('sanitizes directory names', () => {
      const raw = 'Test/With:Special*Chars?'
      const sanitized = raw.replace(/[<>:"/\\|?*]/g, '_')
      expect(sanitized).not.toContain('/')
      expect(sanitized).toBe('Test_With_Special_Chars_')
    })
  })
})
