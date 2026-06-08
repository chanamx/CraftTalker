import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createApp } from '../app.js'
import { setEngine, NativeEngine } from '../engine/index.js'
import { clearGenerationLocksForTest } from '../lib/generation-locks.js'
import type { Engine, EngineRequest, EngineResponse } from '../engine/types.js'
import { addMessage, getChat } from '../services/chat.service.js'
import { listGenerationRuns } from '../services/run.service.js'
import { clearLlmKeySessionsForTest } from '../services/llm-session.service.js'

let testDataDir = ''
let lastEngineRequest: EngineRequest | null = null

class SlowStreamEngine implements Engine {
  readonly name = 'slow-test'

  async generate(): Promise<EngineResponse> {
    await new Promise(resolve => setTimeout(resolve, 50))
    return { content: 'full', finishReason: 'stop' }
  }

  async *generateStream(request: EngineRequest): AsyncGenerator<string, void, unknown> {
    lastEngineRequest = request
    yield 'part-1'
    await new Promise(resolve => setTimeout(resolve, 5))
    yield 'part-2'
  }

  async testConnection(): Promise<boolean> {
    return true
  }
}

beforeEach(() => {
  process.env.NODE_ENV = 'test'
  testDataDir = path.join(os.tmpdir(), `luker-generation-locks-${crypto.randomUUID()}`)
  process.env.LUKER_DATA_DIR = testDataDir
  fs.mkdirSync(path.join(testDataDir, 'characters'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'chats'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'worlds'), { recursive: true })
  setEngine(new SlowStreamEngine())
  clearGenerationLocksForTest()
  clearLlmKeySessionsForTest()
  lastEngineRequest = null
})

afterEach(() => {
  clearGenerationLocksForTest()
  clearLlmKeySessionsForTest()
  setEngine(new NativeEngine())
  delete process.env.LUKER_DATA_DIR
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

function writeCharacter(name: string) {
  const charDir = path.join(testDataDir, 'characters', name)
  fs.mkdirSync(charDir, { recursive: true })
  fs.writeFileSync(
    path.join(charDir, 'character.json'),
    JSON.stringify({ name, description: 'Test bot' }),
    'utf8',
  )
}

async function createChat(app: ReturnType<typeof createApp>, characterName: string): Promise<string> {
  const res = await app.request(`/api/chats/${characterName}`, { method: 'POST' })
  expect(res.status).toBe(201)
  const body = await res.json() as { chatId: string }
  return body.chatId
}

function streamRequest(app: ReturnType<typeof createApp>, characterName: string, chatId: string) {
  return app.request(`/api/chats/${characterName}/${chatId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        apiUrl: 'http://localhost:1234/v1',
        apiKey: '',
        model: 'test-model',
        type: 'openai',
      },
    }),
  })
}

function regenerateRequest(app: ReturnType<typeof createApp>, characterName: string, chatId: string) {
  return app.request(`/api/chats/${characterName}/${chatId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        apiUrl: 'http://localhost:1234/v1',
        apiKey: '',
        model: 'test-model',
        type: 'openai',
      },
    }),
  })
}

async function drain(res: Response) {
  await res.text()
}

describe('generation locks', () => {
  it('rejects concurrent generation for the same chat but allows other chats', async () => {
    const app = createApp()
    writeCharacter('LockBot')
    const chatA = await createChat(app, 'LockBot')
    const chatB = await createChat(app, 'LockBot')

    const first = await streamRequest(app, 'LockBot', chatA)
    expect(first.status).toBe(200)

    const duplicate = await streamRequest(app, 'LockBot', chatA)
    expect(duplicate.status).toBe(409)
    const duplicateBody = await duplicate.json() as { code: number; details?: { operation?: string } }
    expect(duplicateBody.code).toBe(5000)
    expect(duplicateBody.details?.operation).toBe('generate')

    const otherChat = await streamRequest(app, 'LockBot', chatB)
    expect(otherChat.status).toBe(200)

    await drain(first)
    await drain(otherChat)

    const runs = await listGenerationRuns()
    expect(runs.filter(run => run.chatId === chatA && run.status === 'completed')).toHaveLength(1)
    expect(runs.find(run => run.chatId === chatA)?.partialContent).toBe('part-1part-2')

    const afterComplete = await streamRequest(app, 'LockBot', chatA)
    expect(afterComplete.status).toBe(200)
    await drain(afterComplete)
  })

  it('keeps regenerate deletion inside the generation lock', async () => {
    const app = createApp()
    writeCharacter('RegenBot')
    const chatId = await createChat(app, 'RegenBot')
    await addMessage('RegenBot', chatId, true, 'Hello')
    await addMessage('RegenBot', chatId, false, 'Old reply')

    const first = await regenerateRequest(app, 'RegenBot', chatId)
    expect(first.status).toBe(200)

    const duplicate = await regenerateRequest(app, 'RegenBot', chatId)
    expect(duplicate.status).toBe(409)

    const during = await getChat('RegenBot', chatId)
    expect(during.lines.filter(line => 'mes' in line && !line.is_user)).toHaveLength(0)

    await drain(first)

    const after = await getChat('RegenBot', chatId)
    const assistantLines = after.lines.filter(line => 'mes' in line && !line.is_user)
    expect(assistantLines).toHaveLength(1)
    expect(assistantLines[0]?.mes).toBe('part-1part-2')

    const runs = await listGenerationRuns()
    const completed = runs.find(run => run.characterName === 'RegenBot' && run.chatId === chatId && run.status === 'completed')
    expect(completed?.operation).toBe('regenerate')
    expect(completed?.committedLineIndex).toBe(2)
  })

  it('resolves server-side API key sessions before generation without persisting secrets in run records', async () => {
    const app = createApp()
    writeCharacter('SessionBot')
    const chatId = await createChat(app, 'SessionBot')

    const sessionRes = await app.request('/api/llm-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-session-secret', label: 'test' }),
    })
    const session = await sessionRes.json() as { sessionId: string }

    const res = await app.request(`/api/chats/SessionBot/${chatId}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          apiUrl: 'http://localhost:1234/v1',
          apiKey: '',
          apiKeySessionId: session.sessionId,
          model: 'test-model',
          type: 'openai',
        },
      }),
    })

    expect(res.status).toBe(200)
    await drain(res)
    expect(lastEngineRequest?.config.apiKey).toBe('sk-session-secret')

    const runs = await listGenerationRuns()
    expect(JSON.stringify(runs)).not.toContain('sk-session-secret')
    expect(JSON.stringify(runs)).not.toContain(session.sessionId)
  })
})
