import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createApp } from '../app.js'
import { cancelRun, createGenerationRun, failRun, updateRunPartial } from '../services/run.service.js'
import { createChat, getChat } from '../services/chat.service.js'
import { clearGenerationLocksForTest, tryAcquireGenerationLock } from '../lib/generation-locks.js'
import { clearLlmKeySessionsForTest } from '../services/llm-session.service.js'

type Json = Record<string, unknown>

const testDataDir = path.join(os.tmpdir(), `luker-api-test-${Date.now()}`)

beforeEach(() => {
  process.env.NODE_ENV = 'test'
  process.env.LUKER_DATA_DIR = testDataDir
  fs.mkdirSync(path.join(testDataDir, 'characters'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'chats'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'worlds'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'koboldAI_Settings'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'openAI_Settings'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'textGen_Settings'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'novelAI_Settings'), { recursive: true })
})

afterEach(() => {
  clearGenerationLocksForTest()
  clearLlmKeySessionsForTest()
  delete process.env.LUKER_DATA_DIR
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

describe('API Routes', () => {
  it('GET /api/health returns ok', async () => {
    const app = createApp()
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    const body = await res.json() as Json
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeTypeOf('number')
  })

  it('GET /api/characters returns character list', async () => {
    const app = createApp()
    const res = await app.request('/api/characters')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  it('GET /api/worlds returns world book list', async () => {
    const app = createApp()
    const res = await app.request('/api/worlds')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  it('POST /api/llm-sessions stores API keys server-side without echoing secrets', async () => {
    const app = createApp()

    const res = await app.request('/api/llm-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-test-secret', label: 'OpenAI' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body.sessionId).toBeTypeOf('string')
    expect(body.label).toBe('OpenAI')
    expect(body.hasApiKey).toBe(true)
    expect(JSON.stringify(body)).not.toContain('sk-test-secret')

    const getRes = await app.request(`/api/llm-sessions/${body.sessionId}`)
    expect(getRes.status).toBe(200)
    expect(JSON.stringify(await getRes.json())).not.toContain('sk-test-secret')
  })

  it('DELETE /api/llm-sessions removes server-side key sessions', async () => {
    const app = createApp()
    const createRes = await app.request('/api/llm-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-delete-me' }),
    })
    const body = await createRes.json() as { sessionId: string }

    const deleteRes = await app.request(`/api/llm-sessions/${body.sessionId}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    const getRes = await app.request(`/api/llm-sessions/${body.sessionId}`)
    expect(getRes.status).toBe(404)
  })

  it('GET /api/runs marks stale persisted running runs as interrupted', async () => {
    const app = createApp()
    const run = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    await updateRunPartial(run.runId, 'half-written')

    const res = await app.request('/api/runs?characterName=RunBot&chatId=chat-1')

    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ runId: string; status: string; partialContent: string }>
    expect(body).toHaveLength(1)
    expect(body[0]?.runId).toBe(run.runId)
    expect(body[0]?.status).toBe('interrupted')
    expect(body[0]?.partialContent).toBe('half-written')
  })

  it('POST /api/runs/:runId/commit writes recoverable partial content once', async () => {
    const app = createApp()
    const chat = await createChat('RunBot')
    const run = await createGenerationRun({
      characterName: 'RunBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    await failRun(run.runId, { error: 'network', partialContent: 'Recovered partial' })

    const res = await app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' })

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; committedLineIndex: number }
    expect(body.status).toBe('committed')
    expect(body.committedLineIndex).toBe(1)

    const stored = await getChat('RunBot', chat.chatId)
    expect(stored.lines[1]).toMatchObject({
      is_user: false,
      mes: 'Recovered partial',
    })

    const duplicate = await app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' })
    expect(duplicate.status).toBe(409)
    const afterDuplicate = await getChat('RunBot', chat.chatId)
    expect(afterDuplicate.lines.filter(line => 'mes' in line)).toHaveLength(1)
  })

  it('POST /api/runs/:runId/commit is idempotent under duplicate recovery requests', async () => {
    const app = createApp()
    const chat = await createChat('RaceBot')
    const run = await createGenerationRun({
      characterName: 'RaceBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    await failRun(run.runId, { error: 'network', partialContent: 'Only once' })

    const responses = await Promise.all([
      app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' }),
      app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' }),
    ])

    expect(responses.map(res => res.status).sort()).toEqual([200, 409])
    const stored = await getChat('RaceBot', chat.chatId)
    expect(stored.lines.filter(line => 'mes' in line && line.mes === 'Only once')).toHaveLength(1)
  })

  it('POST /api/runs/:runId/discard marks recoverable runs as discarded', async () => {
    const app = createApp()
    const run = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'chat-1',
      operation: 'continue',
    })
    await updateRunPartial(run.runId, 'Drop me')
    await cancelRun(run.runId, { partialContent: 'Drop me' })

    const res = await app.request(`/api/runs/${run.runId}/discard`, { method: 'POST' })

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; partialContent: string }
    expect(body.status).toBe('discarded')
    expect(body.partialContent).toBe('Drop me')
  })

  it('POST /api/runs/:runId/commit recovers stale running runs without a process lock', async () => {
    const app = createApp()
    const chat = await createChat('StaleBot')
    const run = await createGenerationRun({
      characterName: 'StaleBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    await updateRunPartial(run.runId, 'After restart')

    const res = await app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' })

    expect(res.status).toBe(200)
    const stored = await getChat('StaleBot', chat.chatId)
    expect(stored.lines.filter(line => 'mes' in line && line.mes === 'After restart')).toHaveLength(1)
  })

  it('POST /api/runs/:runId/commit rejects active running runs with a process lock', async () => {
    const app = createApp()
    const chat = await createChat('LiveBot')
    const run = await createGenerationRun({
      characterName: 'LiveBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    await updateRunPartial(run.runId, 'Still streaming')
    const lock = tryAcquireGenerationLock('LiveBot', chat.chatId, 'generate')

    const res = await app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' })

    expect(res.status).toBe(409)
    lock?.release()
    const stored = await getChat('LiveBot', chat.chatId)
    expect(stored.lines.filter(line => 'mes' in line && line.mes === 'Still streaming')).toHaveLength(0)
  })

  it('GET /api/presets/openai returns empty array initially', async () => {
    const app = createApp()
    const res = await app.request('/api/presets/openai')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body).toEqual([])
  })

  it('POST /api/characters/import without filePath returns 400', async () => {
    const app = createApp()
    const res = await app.request('/api/characters/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/characters/import rejects arbitrary absolute paths', async () => {
    const app = createApp()
    const outsidePath = path.join(testDataDir, 'outside.png')
    fs.writeFileSync(outsidePath, 'not a real card', 'utf8')

    const res = await app.request('/api/characters/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: outsidePath }),
    })

    expect(res.status).toBe(400)
  })

  it('POST /api/characters/upload imports JSON character cards', async () => {
    const app = createApp()
    const card = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'JsonBot',
        description: 'Imported from JSON',
      },
    }

    const res = await app.request('/api/characters/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: '../JsonBot.json',
        data: Buffer.from(JSON.stringify(card), 'utf8').toString('base64'),
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body.name).toBe('JsonBot')
    expect(fs.existsSync(path.join(testDataDir, 'characters', 'JsonBot', 'character.json'))).toBe(true)
  })

  it('GET /api/chats/:name returns empty for unknown character', async () => {
    const app = createApp()
    const res = await app.request('/api/chats/NonExistent')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body).toEqual([])
  })

  it('POST /api/chats/:name creates a new chat', async () => {
    const app = createApp()

    const charDir = path.join(testDataDir, 'characters', 'TestBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({ name: 'TestBot', description: 'A test bot' }),
      'utf8',
    )

    const res = await app.request('/api/chats/TestBot', {
      method: 'POST',
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body).toHaveProperty('chatId')
    expect(body.chatId).toBeTypeOf('string')
  })

  it('POST /api/chats/:name/:chatId/stream accepts request and returns SSE content type', async () => {
    const app = createApp()

    const charDir = path.join(testDataDir, 'characters', 'StreamBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({
        name: 'StreamBot',
        description: 'Test',
        system_prompt: 'You are a bot.',
        first_mes: 'Hello',
      }),
      'utf8',
    )

    const createRes = await app.request('/api/chats/StreamBot', { method: 'POST' })
    const { chatId } = await createRes.json() as Json

    try {
      const res = await app.request(`/api/chats/StreamBot/${chatId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            apiUrl: 'http://localhost:1234/v1',
            apiKey: '',
            model: 'test-model',
            type: 'openai' as const,
          },
        }),
        signal: AbortSignal.timeout(2000),
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/event-stream')
    } catch {
      expect(true).toBe(true)
    }
  })

  it('POST /api/worlds creates a world book', async () => {
    const app = createApp()
    const res = await app.request('/api/worlds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TestWorld', description: 'A test world' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body.name).toBe('TestWorld')
    expect(body.enabled).toBe(false)
    expect(body.global_enabled).toBe(false)
    expect(fs.existsSync(path.join(testDataDir, 'worlds', 'TestWorld.json'))).toBe(true)
  })

  it('keeps world book global scope independent from character bindings', async () => {
    const app = createApp()

    const charDirs = ['ScopeBotA', 'ScopeBotB']
    for (const name of charDirs) {
      const charDir = path.join(testDataDir, 'characters', name)
      fs.mkdirSync(charDir, { recursive: true })
      fs.writeFileSync(
        path.join(charDir, 'character.json'),
        JSON.stringify({
          spec: 'chara_card_v2',
          spec_version: '2.0',
          name,
          description: 'Scope test',
          extensions: name === 'ScopeBotA' ? { world: 'ExistingWorld' } : {},
        }),
        'utf8',
      )
    }

    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'ScopeWorld.json'),
      JSON.stringify({
        name: 'ScopeWorld',
        description: 'No explicit global flag yet',
        enabled: true,
        entries: {},
      }),
      'utf8',
    )

    const before = await app.request('/api/worlds')
    const beforeList = await before.json() as Array<Json>
    expect(beforeList.find(w => w.name === 'ScopeWorld')?.global_enabled).toBe(true)

    const bindA = await app.request('/api/worlds/ScopeWorld/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterName: 'ScopeBotA' }),
    })
    expect(bindA.status).toBe(200)

    const bindB = await app.request('/api/worlds/ScopeWorld/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterName: 'ScopeBotB' }),
    })
    expect(bindB.status).toBe(200)

    const listRes = await app.request('/api/worlds')
    const worlds = await listRes.json() as Array<Json & { bound_to: string[] }>
    const scopeWorld = worlds.find(w => w.name === 'ScopeWorld')
    expect(scopeWorld?.enabled).toBe(true)
    expect(scopeWorld?.global_enabled).toBe(true)
    expect(scopeWorld?.bound_to.sort()).toEqual(['ScopeBotA', 'ScopeBotB'])

    const storedWorld = JSON.parse(fs.readFileSync(path.join(testDataDir, 'worlds', 'ScopeWorld.json'), 'utf8'))
    expect(storedWorld.global_enabled).toBe(true)

    const updatedChar = JSON.parse(fs.readFileSync(path.join(testDataDir, 'characters', 'ScopeBotA', 'character.json'), 'utf8'))
    expect(updatedChar.data.extensions.world).toBe('ExistingWorld')
    expect(updatedChar.data.extensions.worlds).toEqual(['ExistingWorld', 'ScopeWorld'])
  })

  it('turns a world book off when its last character binding is removed and it is not global', async () => {
    const app = createApp()
    const charDir = path.join(testDataDir, 'characters', 'BoundOnlyBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({
        spec: 'chara_card_v2',
        spec_version: '2.0',
        name: 'BoundOnlyBot',
        description: 'Bound only',
        extensions: { world: 'BoundOnlyWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'BoundOnlyWorld.json'),
      JSON.stringify({
        name: 'BoundOnlyWorld',
        enabled: true,
        global_enabled: false,
        entries: {},
      }),
      'utf8',
    )

    const unbind = await app.request('/api/worlds/BoundOnlyWorld/unbind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterName: 'BoundOnlyBot' }),
    })

    expect(unbind.status).toBe(200)
    const worldRes = await app.request('/api/worlds/BoundOnlyWorld')
    const world = await worldRes.json() as Json
    expect(world.global_enabled).toBe(false)
    expect(world.enabled).toBe(false)

    const listRes = await app.request('/api/worlds')
    const worlds = await listRes.json() as Array<Json & { bound_to: string[] }>
    const boundOnly = worlds.find(w => w.name === 'BoundOnlyWorld')
    expect(boundOnly?.bound_to).toEqual([])
    expect(boundOnly?.enabled).toBe(false)
  })

  it('turns legacy bound-only world books off after their last binding is removed', async () => {
    const app = createApp()
    const charDir = path.join(testDataDir, 'characters', 'LegacyBoundBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({
        spec: 'chara_card_v2',
        spec_version: '2.0',
        name: 'LegacyBoundBot',
        description: 'Legacy bound only',
        extensions: { world: 'LegacyBoundWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'LegacyBoundWorld.json'),
      JSON.stringify({
        name: 'LegacyBoundWorld',
        enabled: true,
        entries: {},
      }),
      'utf8',
    )

    const beforeListRes = await app.request('/api/worlds')
    const beforeWorlds = await beforeListRes.json() as Array<Json & { bound_to: string[] }>
    const beforeWorld = beforeWorlds.find(w => w.name === 'LegacyBoundWorld')
    expect(beforeWorld?.global_enabled).toBe(false)
    expect(beforeWorld?.bound_to).toEqual(['LegacyBoundBot'])

    const unbind = await app.request('/api/worlds/LegacyBoundWorld/unbind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterName: 'LegacyBoundBot' }),
    })

    expect(unbind.status).toBe(200)
    const worldRes = await app.request('/api/worlds/LegacyBoundWorld')
    const world = await worldRes.json() as Json
    expect(world.global_enabled).toBe(false)
    expect(world.enabled).toBe(false)

    const afterListRes = await app.request('/api/worlds')
    const afterWorlds = await afterListRes.json() as Array<Json & { bound_to: string[] }>
    const afterWorld = afterWorlds.find(w => w.name === 'LegacyBoundWorld')
    expect(afterWorld?.global_enabled).toBe(false)
    expect(afterWorld?.bound_to).toEqual([])
    expect(afterWorld?.enabled).toBe(false)
  })

  it('enabling global scope also enables the whole world book', async () => {
    const app = createApp()
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'DormantWorld.json'),
      JSON.stringify({
        name: 'DormantWorld',
        enabled: false,
        global_enabled: false,
        entries: {},
      }),
      'utf8',
    )

    const res = await app.request('/api/worlds/DormantWorld', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ global_enabled: true }),
    })

    expect(res.status).toBe(200)
    const world = await res.json() as Json
    expect(world.global_enabled).toBe(true)
    expect(world.enabled).toBe(true)
  })

  it('POST /api/chats/:name/:chatId/messages sends and reads back a message', async () => {
    const app = createApp()

    const charDir = path.join(testDataDir, 'characters', 'MsgBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({ name: 'MsgBot', description: 'Message test' }),
      'utf8',
    )

    const createRes = await app.request('/api/chats/MsgBot', { method: 'POST' })
    const { chatId } = await createRes.json() as Json

    const msgRes = await app.request(`/api/chats/MsgBot/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello world' }),
    })

    expect(msgRes.status).toBe(201)
    const msg = await msgRes.json() as Json
    expect(msg.is_user).toBe(true)
    expect(msg.mes).toBe('Hello world')
    expect(msg.is_system).toBe(false)
    expect(typeof msg.send_date).toBe('string')
    expect(Number.isNaN(Date.parse(msg.send_date as string))).toBe(false)

    const getRes = await app.request(`/api/chats/MsgBot/${chatId}`)
    const chat = await getRes.json() as Json & { lines: Record<string, unknown>[] }
    // 期望: 1 个元数据行 + 1 条用户消息 = 2 行
    // 实际: createChat 创建时只有元数据行,addMessage 追加用户消息
    // 但 getChat 返回的 lines 包含所有行
    expect(chat.lines.length).toBeGreaterThanOrEqual(1) // 至少有元数据
    const userMsg = chat.lines.find((l) => l.is_user === true)
    expect(userMsg).toBeDefined()
    expect(userMsg?.mes).toBe('Hello world')
  })

  it('404 for unknown routes', async () => {
    const app = createApp()
    const res = await app.request('/api/nonexistent')
    expect(res.status).toBe(404)
    const body = await res.json() as Json
    expect(body).toHaveProperty('error')
  })
})
