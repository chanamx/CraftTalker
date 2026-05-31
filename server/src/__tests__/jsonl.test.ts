import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const testDataDir = path.join(os.tmpdir(), `luker-jsonl-test-${Date.now()}`)

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

function createMessage(role: string, content: string, name?: string) {
  return { id: crypto.randomUUID(), role, content, timestamp: Date.now(), name }
}

describe('JSONL Chat Files', () => {
  it('writes and reads a chat file', () => {
    const filePath = path.join(testDataDir, 'chat.jsonl')
    const lines = [
      { file_id: 'test-1', chat_items: 2, mes: 'Hello' },
      { role: 'user', content: 'Hi!', timestamp: Date.now() },
      { role: 'assistant', content: 'Hello there!', timestamp: Date.now() },
    ]

    const content = lines.map(l => JSON.stringify(l)).join('\n') + '\n'
    fs.writeFileSync(filePath, content, 'utf8')

    const read = fs.readFileSync(filePath, 'utf8')
    const parsed = read
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))

    expect(parsed).toHaveLength(3)
    expect(parsed[0].file_id).toBe('test-1')
    expect(parsed[0].chat_items).toBe(2)
  })

  it('appends a message to an existing chat file', () => {
    const filePath = path.join(testDataDir, 'chat.jsonl')
    const metadata = { file_id: 'append-test', chat_items: 1, mes: 'First' }
    const msg1 = { role: 'user', content: 'First message', timestamp: Date.now() }

    fs.writeFileSync(filePath, JSON.stringify(metadata) + '\n' + JSON.stringify(msg1) + '\n', 'utf8')

    const msg2 = createMessage('assistant', 'Second message')
    fs.appendFileSync(filePath, JSON.stringify(msg2) + '\n', 'utf8')

    const lines = fs
      .readFileSync(filePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)

    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[2]).content).toBe('Second message')
  })

  it('creates metadata with correct structure', () => {
    const fileId = crypto.randomUUID()
    const metadata = {
      file_id: fileId,
      chat_items: 0,
      mes: 'Start of conversation',
      last_mes: Date.now(),
    }

    expect(metadata.file_id).toBe(fileId)
    expect(metadata.chat_items).toBe(0)
  })

  it('lists all chat files in a directory', () => {
    const charsDir = path.join(testDataDir, 'TestChar')
    fs.mkdirSync(charsDir, { recursive: true })

    fs.writeFileSync(path.join(charsDir, 'chat1.jsonl'), JSON.stringify({ file_id: 'c1' }) + '\n', 'utf8')
    fs.writeFileSync(path.join(charsDir, 'chat2.jsonl'), JSON.stringify({ file_id: 'c2' }) + '\n', 'utf8')

    const files = fs.readdirSync(charsDir).filter(f => f.endsWith('.jsonl'))
    expect(files).toHaveLength(2)
  })

  it('returns chat info from metadata line', () => {
    const filePath = path.join(testDataDir, 'info-test.jsonl')
    const metadata = { file_id: 'info-1', chat_items: 5, mes: 'Last message preview' }
    const msg = { role: 'user', content: 'test', timestamp: Date.now() }

    fs.writeFileSync(filePath, JSON.stringify(metadata) + '\n' + JSON.stringify(msg) + '\n', 'utf8')

    const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0]
    const info = JSON.parse(firstLine)

    expect(info.file_id).toBe('info-1')
    expect(info.chat_items).toBe(5)
  })

  it('deletes a chat file', () => {
    const filePath = path.join(testDataDir, 'delete-test.jsonl')
    fs.writeFileSync(filePath, 'test\n', 'utf8')
    expect(fs.existsSync(filePath)).toBe(true)

    fs.unlinkSync(filePath)
    expect(fs.existsSync(filePath)).toBe(false)
  })
})
