import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createApp } from '../app.js'
import { setEngine, NativeEngine } from '../engine/index.js'
import { clearGenerationLocksForTest } from '../lib/generation-locks.js'
import type { Engine, EngineRequest, EngineResponse } from '../engine/types.js'
import { addMessage, getChat, updateChatMetadata } from '../services/chat.service.js'
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

async function createChat(app: ReturnType<typeof createApp>, characterName: string, userName?: string): Promise<string> {
  const res = await app.request(`/api/chats/${characterName}`, {
    method: 'POST',
    ...(userName ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName }),
    } : {}),
  })
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

  it('scans world info against ST-style speaker name prefixes during generation', async () => {
    const app = createApp()
    writeCharacter('NameScanBot')
    const charPath = path.join(testDataDir, 'characters', 'NameScanBot', 'character.json')
    fs.writeFileSync(
      charPath,
      JSON.stringify({
        name: 'NameScanBot',
        description: 'Test bot',
        extensions: { world: 'NameScanWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'NameScanWorld.json'),
      JSON.stringify({
        name: 'NameScanWorld',
        enabled: true,
        global_enabled: false,
        entries: {
          '1': {
            uid: 1,
            key: ['Alice:'],
            content: 'speaker-specific lore',
            enabled: true,
            insertion_order: 100,
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'NameScanBot')
    await addMessage('NameScanBot', chatId, true, 'hello there', 'Alice')

    const res = await streamRequest(app, 'NameScanBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.messages).toEqual([
      { role: 'user', content: 'hello there' },
    ])
    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual(['speaker-specific lore'])
  })

  it('resolves ST macros in world info scan keys during generation', async () => {
    const app = createApp()
    writeCharacter('MacroScanBot')
    const charPath = path.join(testDataDir, 'characters', 'MacroScanBot', 'character.json')
    fs.writeFileSync(
      charPath,
      JSON.stringify({
        name: 'MacroScanBot',
        description: 'Test bot',
        extensions: { world: 'MacroScanWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'MacroScanWorld.json'),
      JSON.stringify({
        name: 'MacroScanWorld',
        enabled: true,
        global_enabled: false,
        entries: {
          '1': {
            uid: 1,
            key: ['{{user}}'],
            content: 'macro-scanned lore',
            enabled: true,
            insertion_order: 100,
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'MacroScanBot', 'Alice')
    await addMessage('MacroScanBot', chatId, true, 'Alice found the sigil.', 'Alice')

    const res = await streamRequest(app, 'MacroScanBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual(['macro-scanned lore'])
  })

  it('honors ST-style world info include-name metadata during generation', async () => {
    const app = createApp()
    writeCharacter('NoNameScanBot')
    const charPath = path.join(testDataDir, 'characters', 'NoNameScanBot', 'character.json')
    fs.writeFileSync(
      charPath,
      JSON.stringify({
        name: 'NoNameScanBot',
        description: 'Test bot',
        extensions: { world: 'NoNameScanWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'NoNameScanWorld.json'),
      JSON.stringify({
        name: 'NoNameScanWorld',
        enabled: true,
        global_enabled: false,
        entries: {
          '1': {
            uid: 1,
            key: ['Alice:'],
            content: 'speaker-specific lore',
            enabled: true,
            insertion_order: 100,
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'NoNameScanBot')
    await addMessage('NoNameScanBot', chatId, true, 'hello there', 'Alice')
    await updateChatMetadata('NoNameScanBot', chatId, {
      world_info_settings: { world_info_include_names: false },
    })

    const res = await streamRequest(app, 'NoNameScanBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.messages).toEqual([
      { role: 'user', content: 'hello there' },
    ])
    expect(lastEngineRequest?.worldEntries).toBeUndefined()
  })

  it('scans extension prompts marked for world-info scanning during generation', async () => {
    const app = createApp()
    writeCharacter('ExtensionScanBot')
    const charPath = path.join(testDataDir, 'characters', 'ExtensionScanBot', 'character.json')
    fs.writeFileSync(
      charPath,
      JSON.stringify({
        name: 'ExtensionScanBot',
        description: 'Test bot',
        extensions: { world: 'ExtensionScanWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'ExtensionScanWorld.json'),
      JSON.stringify({
        name: 'ExtensionScanWorld',
        enabled: true,
        global_enabled: false,
        entries: {
          '1': {
            uid: 1,
            key: ['hidden archive'],
            content: 'extension-scanned lore',
            enabled: true,
            insertion_order: 100,
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'ExtensionScanBot')
    await addMessage('ExtensionScanBot', chatId, true, 'plain message', 'Alice')
    await updateChatMetadata('ExtensionScanBot', chatId, {
      extensionPrompts: {
        note: { scan: true, value: 'The hidden archive is open.' },
        ignored: { scan: false, value: 'This should not be scanned.' },
      },
    })

    const res = await streamRequest(app, 'ExtensionScanBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual(['extension-scanned lore'])
  })

  it('force activates vectorized world info entries from ST-compatible metadata during generation', async () => {
    const app = createApp()
    writeCharacter('ForcedVectorBot')
    const charPath = path.join(testDataDir, 'characters', 'ForcedVectorBot', 'character.json')
    fs.writeFileSync(
      charPath,
      JSON.stringify({
        name: 'ForcedVectorBot',
        description: 'Test bot',
        extensions: { world: 'ForcedVectorWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'ForcedVectorWorld.json'),
      JSON.stringify({
        name: 'ForcedVectorWorld',
        enabled: true,
        global_enabled: false,
        entries: {
          '0': {
            uid: 0,
            key: ['not in chat'],
            content: 'forced-vector lore',
            enabled: true,
            insertion_order: 100,
            vectorized: true,
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'ForcedVectorBot')
    await addMessage('ForcedVectorBot', chatId, true, 'plain message', 'Alice')
    await updateChatMetadata('ForcedVectorBot', chatId, {
      worldinfo_force_activate: [{ world: 'ForcedVectorWorld', uid: '0' }],
    })

    const res = await streamRequest(app, 'ForcedVectorBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual(['forced-vector lore'])
  })

  it('activates vectorized world info entries from vector metadata during generation', async () => {
    const app = createApp()
    writeCharacter('VectorMetadataBot')
    const charPath = path.join(testDataDir, 'characters', 'VectorMetadataBot', 'character.json')
    fs.writeFileSync(
      charPath,
      JSON.stringify({
        name: 'VectorMetadataBot',
        description: 'Test bot',
        extensions: { world: 'VectorMetadataWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'VectorMetadataWorld.json'),
      JSON.stringify({
        name: 'VectorMetadataWorld',
        enabled: true,
        global_enabled: false,
        entries: {
          '0': {
            uid: 0,
            key: ['not in chat'],
            content: 'stored-vector lore',
            enabled: true,
            insertion_order: 100,
            vectorized: true,
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'VectorMetadataBot')
    await addMessage('VectorMetadataBot', chatId, true, 'plain message', 'Alice')
    await updateChatMetadata('VectorMetadataBot', chatId, {
      worldInfoVectorActivations: [{
        world: 'VectorMetadataWorld',
        uid: '0',
        content: 'retrieved-vector lore',
        source: 'test-vector-runtime',
        score: '0.88',
      }],
    })

    const res = await streamRequest(app, 'VectorMetadataBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual(['retrieved-vector lore'])
  })

  it('clears ST-style world info buffer external activations after generation', async () => {
    const app = createApp()
    writeCharacter('BufferedVectorBot')
    const charPath = path.join(testDataDir, 'characters', 'BufferedVectorBot', 'character.json')
    fs.writeFileSync(
      charPath,
      JSON.stringify({
        name: 'BufferedVectorBot',
        description: 'Test bot',
        extensions: { world: 'BufferedVectorWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'BufferedVectorWorld.json'),
      JSON.stringify({
        name: 'BufferedVectorWorld',
        enabled: true,
        global_enabled: false,
        entries: {
          '0': {
            uid: 0,
            key: ['not in chat'],
            content: 'stored-buffer lore',
            enabled: true,
            insertion_order: 100,
            vectorized: true,
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'BufferedVectorBot')
    await addMessage('BufferedVectorBot', chatId, true, 'plain message', 'Alice')
    await updateChatMetadata('BufferedVectorBot', chatId, {
      worldInfoBuffer: {
        externalActivations: {
          'BufferedVectorWorld.0': {
            world: 'BufferedVectorWorld',
            uid: 0,
            content: 'buffer-vector lore',
          },
        },
      },
    })

    const res = await streamRequest(app, 'BufferedVectorBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual(['buffer-vector lore'])

    const chat = await getChat('BufferedVectorBot', chatId)
    const metadata = (chat.lines[0] as { chat_metadata?: { worldInfoBuffer?: Record<string, unknown> } }).chat_metadata
    expect(metadata?.worldInfoBuffer?.externalActivations).toBeUndefined()
  })

  it('loads persona lorebooks from ST-compatible chat metadata during generation', async () => {
    const app = createApp()
    writeCharacter('PersonaScanBot')
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'PersonaScanWorld.json'),
      JSON.stringify({
        name: 'PersonaScanWorld',
        enabled: true,
        global_enabled: false,
        entries: {
          '1': {
            uid: 1,
            key: ['silver mask'],
            content: 'persona-scanned lore',
            enabled: true,
            insertion_order: 100,
            extensions: { match_persona_description: true },
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'PersonaScanBot')
    await addMessage('PersonaScanBot', chatId, true, 'plain message', 'Alice')
    await updateChatMetadata('PersonaScanBot', chatId, {
      persona_description_lorebook: 'PersonaScanWorld',
      persona_description: 'The speaker carries a silver mask.',
    })

    const res = await streamRequest(app, 'PersonaScanBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual(['persona-scanned lore'])
  })

  it('does not let disabled world recursion depth suppress ST min-activation depth expansion during generation', async () => {
    const app = createApp()
    writeCharacter('MinActivationBot')
    const charPath = path.join(testDataDir, 'characters', 'MinActivationBot', 'character.json')
    fs.writeFileSync(
      charPath,
      JSON.stringify({
        name: 'MinActivationBot',
        description: 'Test bot',
        extensions: { world: 'MinActivationWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'MinActivationWorld.json'),
      JSON.stringify({
        name: 'MinActivationWorld',
        enabled: true,
        global_enabled: false,
        recursive_scanning: false,
        recursive_scanning_depth: 2,
        entries: {
          '1': {
            uid: 1,
            key: ['alpha'],
            content: 'first-depth lore',
            enabled: true,
            insertion_order: 90,
          },
          '2': {
            uid: 2,
            key: ['beta'],
            content: 'expanded-depth lore',
            enabled: true,
            insertion_order: 100,
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'MinActivationBot')
    await addMessage('MinActivationBot', chatId, true, 'beta', 'Alice')
    await addMessage('MinActivationBot', chatId, true, 'alpha', 'Alice')
    await updateChatMetadata('MinActivationBot', chatId, {
      world_info_settings: {
        world_info_depth: 1,
        world_info_min_activations: 2,
        world_info_min_activations_depth_max: 2,
        world_info_recursive: false,
      },
    })

    const res = await streamRequest(app, 'MinActivationBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual([
      'first-depth lore',
      'expanded-depth lore',
    ])
  })
})
