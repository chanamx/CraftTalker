import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { addMessage, createChat, getChat, renameChat, updateChatMetadata, updateMessageVariables } from '../services/chat.service.js'
import { AppError, ErrorCode } from '../lib/errors.js'

const dataDir = path.join(os.tmpdir(), `crafttalker-chat-mutation-${process.pid}`)

describe('chat mutation consistency', () => {
  beforeEach(async () => {
    process.env.LUKER_DATA_DIR = dataDir
    await fs.rm(dataDir, { recursive: true, force: true })
  })

  afterEach(async () => {
    delete process.env.LUKER_DATA_DIR
    await fs.rm(dataDir, { recursive: true, force: true })
  })

  it('preserves concurrent metadata and message-variable updates', async () => {
    const created = await createChat('MutationBot', 'User')
    await addMessage('MutationBot', created.chatId, true, 'hello')

    await Promise.all([
      updateChatMetadata('MutationBot', created.chatId, { scene: 'kitchen', preserved: { yes: true } }),
      updateMessageVariables('MutationBot', created.chatId, [{ lineIndex: 1, variables: { mood: 'calm' }, variables_initialized: true }]),
    ])

    const chat = await getChat('MutationBot', created.chatId)
    expect(chat.lines[0]).toMatchObject({ chat_metadata: { scene: 'kitchen', preserved: { yes: true } } })
    expect(chat.lines[1]).toMatchObject({ variables: { mood: 'calm' }, variables_initialized: true })
  })

  it('serializes concurrent appends without losing messages', async () => {
    const created = await createChat('AppendBot')
    await Promise.all([
      addMessage('AppendBot', created.chatId, true, 'one'),
      addMessage('AppendBot', created.chatId, true, 'two'),
    ])
    const chat = await getChat('AppendBot', created.chatId)
    expect(chat.lines).toHaveLength(3)
    expect(chat.lines.slice(1).map(line => 'mes' in line ? line.mes : '')).toEqual(expect.arrayContaining(['one', 'two']))
  })
})


describe('chat rename consistency', () => {
  beforeEach(async () => {
    process.env.LUKER_DATA_DIR = dataDir
    await fs.rm(dataDir, { recursive: true, force: true })
  })
  afterEach(async () => {
    delete process.env.LUKER_DATA_DIR
    await fs.rm(dataDir, { recursive: true, force: true })
  })
  it('rejects rename over an existing chat', async () => {
    const source = await createChat('RenameBot')
    const target = await createChat('RenameBot')
    const targetId = target.chatId
    await expect(renameChat('RenameBot', source.chatId, targetId)).rejects.toSatisfy(error => error instanceof AppError && error.code === ErrorCode.CONFLICT)
  })
})
