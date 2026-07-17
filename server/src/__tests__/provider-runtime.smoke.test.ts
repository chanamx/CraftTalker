import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createApp } from '../app.js'
import { NativeEngine } from '../engine/native.js'
import { setEngine } from '../engine/index.js'
import { getChat } from '../services/chat.service.js'
import { clearRunJournalStoresForTest } from '../services/run.service.js'

let mockServer: http.Server
let mockPort = 0
let mode: 'complete' | 'hold' = 'complete'
let providerClosed = false
let dataDir = ''

beforeAll(async () => {
  dataDir = path.join(os.tmpdir(), `crafttalker-provider-runtime-${crypto.randomUUID()}`)
  mockServer = http.createServer((request, response) => {
    request.on('close', () => { providerClosed = true })
    if (mode === 'hold') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')
      return
    }

    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end([
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join(''))
  })
  await new Promise<void>(resolve => mockServer.listen(0, '127.0.0.1', resolve))
  mockPort = (mockServer.address() as { port: number }).port
})

beforeEach(() => {
  process.env.NODE_ENV = 'test'
  process.env.LUKER_DATA_DIR = dataDir
  clearRunJournalStoresForTest()
  fs.rmSync(dataDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dataDir, 'characters'), { recursive: true })
  fs.mkdirSync(path.join(dataDir, 'chats'), { recursive: true })
  setEngine(new NativeEngine())
  mode = 'complete'
  providerClosed = false
})

afterAll(async () => {
  clearRunJournalStoresForTest()
  delete process.env.LUKER_DATA_DIR
  fs.rmSync(dataDir, { recursive: true, force: true })
  await new Promise<void>(resolve => mockServer.close(() => resolve()))
})

describe('real local provider runtime smoke', () => {
  it('streams through the actual Hono route and persists the assistant message', async () => {
    const app = createApp()
    await createCharacter(app, 'RuntimeBot')
    const chatId = await createChat(app, 'RuntimeBot')

    const response = await stream(app, 'RuntimeBot', chatId)
    expect(response.status).toBe(200)
    const streamBody = await response.text()
    expect(streamBody).toContain('"content":"hello"')
    expect(streamBody).toContain('"content":" world"')

    const chat = await getChat('RuntimeBot', chatId)
    expect(chat.lines.some(line => 'mes' in line && line.mes === 'hello world')).toBe(true)
  })

  it('cancels the real provider connection when the client cancels the stream', async () => {
    mode = 'hold'
    const app = createApp()
    await createCharacter(app, 'CancelRuntimeBot')
    const chatId = await createChat(app, 'CancelRuntimeBot')

    const response = await stream(app, 'CancelRuntimeBot', chatId)
    const reader = response.body?.getReader()
    expect((await reader?.read())?.done).toBe(false)
    await reader?.cancel('runtime smoke disconnect')

    await vi.waitFor(() => expect(providerClosed).toBe(true), { timeout: 5_000 })
  })
})

async function createCharacter(app: ReturnType<typeof createApp>, name: string): Promise<void> {
  const response = await app.request(`/api/characters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: 'Runtime smoke character' }),
  })
  expect(response.status).toBe(201)
}

async function createChat(app: ReturnType<typeof createApp>, characterName: string): Promise<string> {
  const response = await app.request(`/api/chats/${characterName}`, { method: 'POST' })
  expect(response.status).toBe(201)
  return (await response.json() as { chatId: string }).chatId
}

async function stream(app: ReturnType<typeof createApp>, characterName: string, chatId: string): Promise<Response> {
  return app.request(`/api/chats/${characterName}/${chatId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        apiUrl: `http://127.0.0.1:${mockPort}/v1`,
        apiKey: '',
        model: 'runtime-smoke-model',
        type: 'openai',
        source: 'lmstudio',
      },
    }),
  })
}
