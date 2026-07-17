import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { appendMessage, readChatFile, readChatFileWindow, writeChatFile } from '../lib/jsonl.js'

const testDataDir = path.join(os.tmpdir(), `luker-jsonl-test-${Date.now()}`)

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

function createMessage(role: string, content: string, name?: string) {
  return { id: crypto.randomUUID(), role, content, timestamp: Date.now(), name }
}

describe('JSONL Chat Files', () => {
  it('writes atomically and preserves unknown fields', async () => {
    const filePath = path.join(testDataDir, 'atomic.jsonl')
    const lines = [
      {
        chat_metadata: { chat_name: 'atomic', unknown_metadata: { keep: true } },
        user_name: 'user',
        character_name: 'character',
        unknown_top_level: ['preserve'],
      },
      {
        name: 'character',
        is_user: false,
        is_system: false,
        send_date: '2026-07-13T00:00:00.000Z',
        mes: 'hello',
        extra: { unknown_message_field: 'keep' },
        unknown_message_field: { nested: true },
      },
    ]

    await writeChatFile(filePath, lines as never)
    expect(await readChatFile(filePath)).toEqual(lines)
    expect(fs.readdirSync(testDataDir).filter(name => name.endsWith('.tmp'))).toEqual([])
  })
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

  it('reads bounded tail and offset windows without changing file semantics', async () => {
    const filePath = path.join(testDataDir, 'window.jsonl')
    const lines = Array.from({ length: 10 }, (_, index) => ({ name: 'character', is_user: false, is_system: false, send_date: index, mes: String(index), extra: {} }))
    await writeChatFile(filePath, lines as never)
    const tail = await readChatFileWindow(filePath, { tail: 3 })
    expect(tail.totalLines).toBe(10)
    expect(tail.offset).toBe(7)
    expect(tail.lines.map(line => 'mes' in line ? line.mes : '')).toEqual(['7', '8', '9'])
    const window = await readChatFileWindow(filePath, { offset: 2, limit: 2 })
    expect(window.lines.map(line => 'mes' in line ? line.mes : '')).toEqual(['2', '3'])
    expect(() => fs.rmSync(filePath)).not.toThrow()
  })

  it('appends atomically while preserving existing JSONL bytes', async () => {
    const filePath = path.join(testDataDir, 'atomic-append.jsonl')
    const original = '{  "chat_metadata": { "unknown": true }, "user_name": "u", "character_name": "c" }\n'
    fs.writeFileSync(filePath, original, 'utf8')
    await appendMessage(filePath, { name: 'c', is_user: false, is_system: false, send_date: '2026-07-13T00:00:00.000Z', mes: 'hello', extra: {} })
    const raw = fs.readFileSync(filePath, 'utf8')
    expect(raw.startsWith(original)).toBe(true)
    expect(JSON.parse(raw.trim().split('\n').at(-1) ?? '').mes).toBe('hello')
    expect(fs.readdirSync(testDataDir).some(name => name.includes('.tmp'))).toBe(false)
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
