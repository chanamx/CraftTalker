import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  appendMessage,
  createMessage,
  getChatInfo,
  parseChatTimestamp,
  readChatFile,
  updateLineAt,
  writeChatFile,
  type ChatMessage,
} from '../lib/jsonl.js'
import { addSwipe, editMessage, getChat } from '../services/chat.service.js'

const testDataDir = path.join(os.tmpdir(), `luker-chat-compat-${Date.now()}`)
const chatPath = path.join(testDataDir, 'chat.jsonl')

beforeEach(() => {
  process.env.LUKER_DATA_DIR = testDataDir
  fs.mkdirSync(testDataDir, { recursive: true })
})

afterEach(() => {
  delete process.env.LUKER_DATA_DIR
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

describe('chat JSONL compatibility', () => {
  it('creates new messages with ST-style ISO send_date strings', async () => {
    const message = createMessage('User', true, 'Hello')
    await appendMessage(chatPath, message)

    const [line] = await readChatFile(chatPath) as ChatMessage[]

    expect(typeof line.send_date).toBe('string')
    expect(Number.isNaN(Date.parse(line.send_date as string))).toBe(false)
  })

  it('parses both legacy numeric and ST string timestamps for chat sorting', async () => {
    expect(parseChatTimestamp(1710000000000)).toBe(1710000000000)
    expect(parseChatTimestamp('2026-06-09T00:00:00.000Z')).toBe(Date.parse('2026-06-09T00:00:00.000Z'))
    expect(parseChatTimestamp('not-a-date', 42)).toBe(42)
  })

  it('uses string send_date from the last JSONL line in chat info', async () => {
    const sendDate = '2026-06-09T01:02:03.000Z'
    await writeChatFile(chatPath, [
      { chat_metadata: {}, user_name: 'User', character_name: 'Bot' },
      { name: 'Bot', is_user: false, is_system: false, send_date: sendDate, mes: 'Reply', extra: {} },
    ])

    const info = await getChatInfo(chatPath)

    expect(info?.last_mes).toBe(Date.parse(sendDate))
  })

  it('preserves unknown message fields when editing a message', async () => {
    await writeChatFile(chatPath, [
      { chat_metadata: {}, user_name: 'User', character_name: 'Bot' },
      {
        name: 'Bot',
        is_user: false,
        is_system: false,
        send_date: '2026-06-09T00:00:00.000Z',
        mes: 'Old',
        extra: { bookmark: true, media: [{ type: 'image' }] },
        swipe_id: 0,
        swipes: ['Old'],
        swipe_info: [{ send_date: '2026-06-09T00:00:00.000Z', custom: 'keep' }],
        force_avatar: 'avatar.png',
        original_avatar: 'orig.png',
      },
    ])

    const updated = await updateLineAt(chatPath, 1, { mes: 'New' }) as ChatMessage

    expect(updated.mes).toBe('New')
    expect(updated.extra.media).toEqual([{ type: 'image' }])
    expect(updated.force_avatar).toBe('avatar.png')
    expect(updated.swipe_info?.[0].custom).toBe('keep')
  })

  it('chat service edit and swipe keep unknown ST fields while writing ISO dates', async () => {
    const chatId = 'session'
    const filePath = path.join(testDataDir, 'chats', 'Bot', `${chatId}.jsonl`)
    await writeChatFile(filePath, [
      { chat_metadata: {}, user_name: 'User', character_name: 'Bot' },
      {
        name: 'Bot',
        is_user: false,
        is_system: false,
        send_date: '2026-06-09T00:00:00.000Z',
        mes: 'Old',
        extra: { files: [{ name: 'note.txt' }] },
        force_avatar: 'avatar.png',
      },
    ])

    const edited = await editMessage('Bot', chatId, 1, 'Edited') as ChatMessage
    expect(edited.force_avatar).toBe('avatar.png')
    expect(typeof edited.send_date).toBe('string')

    const swiped = await addSwipe('Bot', chatId, 1, 'Alternative') as ChatMessage
    expect(swiped.extra.files).toEqual([{ name: 'note.txt' }])
    expect(swiped.force_avatar).toBe('avatar.png')
    expect(swiped.swipes).toEqual(['Edited', 'Alternative'])
    expect(typeof swiped.swipe_info?.[1].send_date).toBe('string')

    const chat = await getChat('Bot', chatId)
    const stored = chat.lines[1] as ChatMessage
    expect(stored.force_avatar).toBe('avatar.png')
    expect(stored.extra.files).toEqual([{ name: 'note.txt' }])
  })
})
