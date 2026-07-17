import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createApp } from '../app.js'
import { setEngine, NativeEngine } from '../engine/index.js'
import { abortActiveGenerations, clearGenerationLocksForTest } from '../lib/generation-locks.js'
import type { Engine, EngineRequest, EngineResponse } from '../engine/types.js'
import { addMessage, getChat, updateChatMetadata } from '../services/chat.service.js'
import { clearRunJournalStoresForTest, listGenerationRuns } from '../services/run.service.js'
import { clearLlmKeySessionsForTest } from '../services/llm-session.service.js'

let testDataDir = ''
let lastEngineRequest: EngineRequest | null = null

class SlowStreamEngine implements Engine {
  readonly name = 'slow-test'

  async generate(request: EngineRequest): Promise<EngineResponse> {
    lastEngineRequest = request
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

class EmptyGenerateEngine extends SlowStreamEngine {
  async generate(request: EngineRequest): Promise<EngineResponse> {
    lastEngineRequest = request
    return { content: '', finishReason: 'stop' }
  }
}

class FailingGenerateEngine extends SlowStreamEngine {
  async generate(request: EngineRequest): Promise<EngineResponse> {
    lastEngineRequest = request
    throw new Error('test generation failed')
  }
}

class FailingStreamEngine extends SlowStreamEngine {
  async *generateStream(request: EngineRequest): AsyncGenerator<string, void, unknown> {
    lastEngineRequest = request
    yield 'partial'
    throw new Error('test stream failed')
  }
}

class AbortAwareStreamEngine extends SlowStreamEngine {
  aborted = false
  finalized = false

  async *generateStream(request: EngineRequest): AsyncGenerator<string, void, unknown> {
    lastEngineRequest = request
    try {
      yield 'started'
      await new Promise<void>((resolve) => {
        if (request.signal?.aborted) {
          this.aborted = true
          resolve()
          return
        }
        request.signal?.addEventListener('abort', () => {
          this.aborted = true
          resolve()
        }, { once: true })
      })
    } finally {
      this.finalized = true
    }
  }
}

class AbortAwareGenerateEngine extends SlowStreamEngine {
  aborted = false

  async generate(request: EngineRequest): Promise<EngineResponse> {
    lastEngineRequest = request
    await new Promise<void>((resolve) => {
      if (request.signal?.aborted) {
        this.aborted = true
        resolve()
        return
      }
      request.signal?.addEventListener('abort', () => {
        this.aborted = true
        resolve()
      }, { once: true })
    })
    throw new Error('generation aborted')
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
  clearRunJournalStoresForTest()
  clearLlmKeySessionsForTest()
  setEngine(new NativeEngine())
  delete process.env.LUKER_DATA_DIR
  delete process.env.CRAFTTALKER_GENERATION_CONCURRENCY
  delete process.env.CRAFTTALKER_GENERATION_QUEUE_CAPACITY
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

function streamRequest(
  app: ReturnType<typeof createApp>,
  characterName: string,
  chatId: string,
  signal?: AbortSignal,
) {
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
    signal,
  })
}

function generationBody(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    config: {
      apiUrl: 'http://localhost:1234/v1',
      apiKey: '',
      model: 'test-model',
      type: 'openai',
    },
    ...extra,
  })
}

function generateRequest(
  app: ReturnType<typeof createApp>,
  characterName: string,
  chatId: string,
  extra: Record<string, unknown> = {},
  signal?: AbortSignal,
) {
  return app.request(`/api/chats/${characterName}/${chatId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: generationBody(extra),
    signal,
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

function continueRequest(app: ReturnType<typeof createApp>, characterName: string, chatId: string) {
  return app.request(`/api/chats/${characterName}/${chatId}/continue`, {
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
  it('saves non-stream generation content and completes the run', async () => {
    const app = createApp()
    writeCharacter('FullBot')
    const chatId = await createChat(app, 'FullBot')

    const res = await generateRequest(app, 'FullBot', chatId)
    expect(res.status).toBe(200)
    const body = await res.json() as { content: string; finishReason: string }
    expect(body.content).toBe('full')
    expect(body.finishReason).toBe('stop')

    const chat = await getChat('FullBot', chatId)
    const assistantLines = chat.lines.filter(line => 'mes' in line && !line.is_user)
    expect(assistantLines).toHaveLength(1)
    expect(assistantLines[0]?.mes).toBe('full')

    const runs = await listGenerationRuns()
    const completed = runs.find(run => run.characterName === 'FullBot' && run.chatId === chatId)
    expect(completed).toMatchObject({
      operation: 'generate',
      status: 'completed',
      partialContent: 'full',
      committedLineIndex: 1,
    })
  })

  it('does not save an empty non-stream generation message', async () => {
    setEngine(new EmptyGenerateEngine())
    const app = createApp()
    writeCharacter('EmptyBot')
    const chatId = await createChat(app, 'EmptyBot')

    const res = await generateRequest(app, 'EmptyBot', chatId)
    expect(res.status).toBe(200)
    const body = await res.json() as { content: string }
    expect(body.content).toBe('')

    const chat = await getChat('EmptyBot', chatId)
    expect(chat.lines.filter(line => 'mes' in line && !line.is_user)).toHaveLength(0)

    const runs = await listGenerationRuns()
    const completed = runs.find(run => run.characterName === 'EmptyBot' && run.chatId === chatId)
    expect(completed).toMatchObject({
      status: 'completed',
      partialContent: '',
    })
    expect(completed?.committedLineIndex).toBeUndefined()
  })

  it('uses ST-compatible chat overrides only for the current generation request', async () => {
    const app = createApp()
    writeCharacter('OverrideBot')
    const chatId = await createChat(app, 'OverrideBot')
    await addMessage('OverrideBot', chatId, true, 'Draw this <lwb-artifact>hidden</lwb-artifact> scene')

    const res = await generateRequest(app, 'OverrideBot', chatId, {
      stCompatChatOverride: [
        {
          name: 'User',
          is_user: true,
          is_system: false,
          mes: 'Draw this clean scene',
        },
      ],
    })

    expect(res.status).toBe(200)
    await res.json()

    expect(lastEngineRequest?.messages).toEqual([
      { role: 'user', content: 'Draw this clean scene' },
    ])

    const chat = await getChat('OverrideBot', chatId)
    const userLine = chat.lines.find(line => line.is_user === true)
    expect(userLine?.mes).toBe('Draw this <lwb-artifact>hidden</lwb-artifact> scene')
  })

  it('uses ST-compatible extension prompts only for the current generation request', async () => {
    const app = createApp()
    writeCharacter('ExtensionPromptBot')
    const chatId = await createChat(app, 'ExtensionPromptBot')
    await addMessage('ExtensionPromptBot', chatId, true, 'What should I remember?')

    const res = await generateRequest(app, 'ExtensionPromptBot', chatId, {
      stCompatExtensionPrompts: [
        {
          key: 'plugin-system-note',
          value: 'Remember the plugin-provided rule.',
          position: 0,
          role: 0,
        },
      ],
    })

    expect(res.status).toBe(200)
    await res.json()

    expect(lastEngineRequest?.promptAnchors).toEqual({
      beforeMain: [],
      afterMain: [{ role: 'system', content: 'Remember the plugin-provided rule.' }],
    })
    expect(lastEngineRequest?.messages).toEqual([
      { role: 'user', content: 'What should I remember?' },
    ])

    const chat = await getChat('ExtensionPromptBot', chatId)
    expect(chat.lines.some(line => line.mes === 'Remember the plugin-provided rule.')).toBe(false)
  })

  it('applies ST-compatible in-chat extension prompts by role and depth', async () => {
    const app = createApp()
    writeCharacter('ExtensionDepthBot')
    const chatId = await createChat(app, 'ExtensionDepthBot')
    await addMessage('ExtensionDepthBot', chatId, true, 'First')
    await addMessage('ExtensionDepthBot', chatId, false, 'Second')
    await addMessage('ExtensionDepthBot', chatId, true, 'Third')

    const res = await generateRequest(app, 'ExtensionDepthBot', chatId, {
      stCompatExtensionPrompts: [
        {
          key: 'plugin-depth-note',
          value: 'Assistant-side injected note.',
          position: 1,
          depth: 1,
          role: 2,
        },
      ],
    })

    expect(res.status).toBe(200)
    await res.json()

    expect(lastEngineRequest?.messages).toEqual([
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'assistant', content: 'Assistant-side injected note.' },
      { role: 'user', content: 'Third' },
    ])
  })

  it('sorts and groups ST in-chat prompts against the original chat depth', async () => {
    const app = createApp()
    writeCharacter('GroupedDepthBot')
    const chatId = await createChat(app, 'GroupedDepthBot')
    await addMessage('GroupedDepthBot', chatId, true, 'First')
    await addMessage('GroupedDepthBot', chatId, false, 'Second')
    await addMessage('GroupedDepthBot', chatId, true, 'Third')

    const res = await generateRequest(app, 'GroupedDepthBot', chatId, {
      stCompatExtensionPrompts: [
        { key: 'z-system', value: '  Z system  ', position: 1, depth: 1, role: 0 },
        { key: 'a-system', value: 'A system', position: 1, depth: 1, role: 0 },
        { key: 'm-user', value: 'User note', position: 1, depth: 1, role: 1 },
        { key: 'b-assistant', value: 'Assistant note', position: 1, depth: 1, role: 2 },
        { key: 'tail-system', value: 'Tail note', position: 1, depth: 0, role: 0 },
        { key: 'deep-system', value: 'Deep note', position: 1, depth: 2, role: 0 },
      ],
    })

    expect(res.status).toBe(200)
    await res.json()
    expect(lastEngineRequest?.messages).toEqual([
      { role: 'user', content: 'First' },
      { role: 'system', content: 'Deep note' },
      { role: 'assistant', content: 'Second' },
      { role: 'assistant', content: 'Assistant note' },
      { role: 'user', content: 'User note' },
      { role: 'system', content: 'A system\nZ system' },
      { role: 'user', content: 'Third' },
      { role: 'system', content: 'Tail note' },
    ])
  })

  it('keeps ST NONE extension prompts out of generation messages', async () => {
    const app = createApp()
    writeCharacter('NonePromptBot')
    const chatId = await createChat(app, 'NonePromptBot')
    await addMessage('NonePromptBot', chatId, true, 'Hello')

    const res = await generateRequest(app, 'NonePromptBot', chatId, {
      stCompatExtensionPrompts: [
        {
          key: 'scan-only-note',
          value: 'This must not enter the final prompt.',
          position: -1,
          scan: false,
          role: 0,
        },
      ],
    })

    expect(res.status).toBe(200)
    await res.json()
    expect(lastEngineRequest?.messages).toEqual([
      { role: 'user', content: 'Hello' },
    ])
  })

  it('uses ST-compatible prompt messages after frontend generation lifecycle hooks only for the current request', async () => {
    const app = createApp()
    writeCharacter('PromptHookBot')
    const chatId = await createChat(app, 'PromptHookBot')
    await addMessage('PromptHookBot', chatId, true, 'Hello {{macro_like}}')

    const res = await generateRequest(app, 'PromptHookBot', chatId, {
      stCompatChatOverride: [
        {
          name: 'User',
          is_user: true,
          is_system: false,
          mes: 'Hello {{macro_like}}',
        },
      ],
      stCompatExtensionPrompts: [
        {
          key: 'plugin-system-note',
          value: 'This prompt is already inside promptMessages.',
          position: 0,
          role: 0,
        },
      ],
      stCompatPromptMessages: [
        { role: 'system', content: 'This prompt is already inside promptMessages.' },
        { role: 'user', content: 'Hello after lifecycle hook' },
      ],
    })

    expect(res.status).toBe(200)
    await res.json()

    expect(lastEngineRequest?.messages).toEqual([
      { role: 'system', content: 'This prompt is already inside promptMessages.' },
      { role: 'user', content: 'Hello after lifecycle hook' },
    ])

    const chat = await getChat('PromptHookBot', chatId)
    const userLine = chat.lines.find(line => line.is_user === true)
    expect(userLine?.mes).toBe('Hello {{macro_like}}')
  })

  it('maps ST absolute extension prompts to typed native main-prompt anchors', async () => {
    const app = createApp()
    writeCharacter('PromptAnchorBot')
    const chatId = await createChat(app, 'PromptAnchorBot')
    await addMessage('PromptAnchorBot', chatId, true, 'Hello')

    const res = await generateRequest(app, 'PromptAnchorBot', chatId, {
      stCompatExtensionPrompts: [
        { key: 'before-main', value: 'Before main', position: 2, role: 1 },
        { key: 'after-main', value: 'After main', position: 0, role: 2 },
        { key: 'in-chat', value: 'In chat', position: 1, depth: 0, role: 0 },
      ],
    })

    expect(res.status).toBe(200)
    await res.json()
    expect(lastEngineRequest?.promptAnchors).toEqual({
      beforeMain: [{ role: 'user', content: 'Before main' }],
      afterMain: [{ role: 'assistant', content: 'After main' }],
    })
    expect(lastEngineRequest?.messages).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'system', content: 'In chat' },
    ])
  })

  it('rejects unsafe fields in ST-compatible generation overrides', async () => {
    const app = createApp()
    writeCharacter('UnsafeOverrideBot')
    const chatId = await createChat(app, 'UnsafeOverrideBot')

    const res = await generateRequest(app, 'UnsafeOverrideBot', chatId, {
      stCompatChatOverride: [
        {
          name: 'User',
          is_user: true,
          is_system: false,
          mes: 'hello',
          domNode: '<button>unsafe</button>',
        },
      ],
    })

    expect(res.status).toBe(400)
    expect(lastEngineRequest).toBeNull()
  })

  it('rejects unsafe fields in ST-compatible prompt message overrides', async () => {
    const app = createApp()
    writeCharacter('UnsafePromptHookBot')
    const chatId = await createChat(app, 'UnsafePromptHookBot')

    const res = await generateRequest(app, 'UnsafePromptHookBot', chatId, {
      stCompatPromptMessages: [
        {
          role: 'user',
          content: 'hello',
          fetchOptions: { credentials: 'include' },
        },
      ],
    })

    expect(res.status).toBe(400)
    expect(lastEngineRequest).toBeNull()
  })

  it('marks non-stream generation failures and releases the chat lock', async () => {
    setEngine(new FailingGenerateEngine())
    const app = createApp()
    writeCharacter('FailBot')
    const chatId = await createChat(app, 'FailBot')

    const failed = await generateRequest(app, 'FailBot', chatId)
    expect(failed.status).toBe(500)
    const failedBody = await failed.json() as { error: string }
    expect(failedBody.error).toBe('服务器内部错误')

    const runs = await listGenerationRuns()
    const failedRun = runs.find(run => run.characterName === 'FailBot' && run.chatId === chatId)
    expect(failedRun).toMatchObject({
      status: 'failed',
      error: 'test generation failed',
      partialContent: '',
    })

    setEngine(new SlowStreamEngine())
    const afterFailure = await streamRequest(app, 'FailBot', chatId)
    expect(afterFailure.status).toBe(200)
    await drain(afterFailure)
  })

  it('appends streamed continue output to the last assistant message', async () => {
    const app = createApp()
    writeCharacter('ContinueBot')
    const chatId = await createChat(app, 'ContinueBot')
    await addMessage('ContinueBot', chatId, true, 'Prompt')
    await addMessage('ContinueBot', chatId, false, 'First half')

    const res = await continueRequest(app, 'ContinueBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    const chat = await getChat('ContinueBot', chatId)
    const assistantLines = chat.lines.filter(line => 'mes' in line && !line.is_user)
    expect(assistantLines).toHaveLength(1)
    expect(assistantLines[0]?.mes).toBe('First halfpart-1part-2')

    const runs = await listGenerationRuns()
    const completed = runs.find(run => run.characterName === 'ContinueBot' && run.chatId === chatId)
    expect(completed).toMatchObject({
      operation: 'continue',
      status: 'completed',
      partialContent: 'part-1part-2',
      committedLineIndex: 2,
    })
  })

  it('includes committed line metadata in streamed terminal SSE events', async () => {
    const app = createApp()
    writeCharacter('StreamMetaBot')
    const chatId = await createChat(app, 'StreamMetaBot')
    await addMessage('StreamMetaBot', chatId, true, 'Prompt')

    const res = await streamRequest(app, 'StreamMetaBot', chatId)
    expect(res.status).toBe(200)
    const text = await res.text()
    const [run] = (await listGenerationRuns()).filter(item => item.characterName === 'StreamMetaBot' && item.chatId === chatId)
    const stored = await getChat('StreamMetaBot', chatId)

    expect(text).toContain(`data: {"done":true,"runId":"${run?.runId}","committedLineIndex":2}`)
    expect(text.trimEnd()).toContain('data: [DONE]')
    expect(stored.lines[2]).toMatchObject({
      extra: { crafttalker: { run_ids: [run?.runId] } },
    })
  })

  it('maps stream executor failures to SSE and releases the chat lock', async () => {
    setEngine(new FailingStreamEngine())
    const app = createApp()
    writeCharacter('StreamFailureBot')
    const chatId = await createChat(app, 'StreamFailureBot')

    const failed = await streamRequest(app, 'StreamFailureBot', chatId)
    expect(failed.status).toBe(200)
    const text = await failed.text()
    expect(text).toContain('data: {"content":"partial"}')
    expect(text).toContain('"code":1000')
    expect(text).not.toContain('data: [DONE]')

    const runs = await listGenerationRuns()
    expect(runs.find(run => run.characterName === 'StreamFailureBot' && run.chatId === chatId)).toMatchObject({
      status: 'failed',
      error: 'test stream failed',
      partialContent: 'partial',
      committedLineIndex: 1,
    })
    expect((await getChat('StreamFailureBot', chatId)).lines[1]).toMatchObject({ mes: 'partial' })

    setEngine(new SlowStreamEngine())
    const retried = await streamRequest(app, 'StreamFailureBot', chatId)
    expect(retried.status).toBe(200)
    await drain(retried)
  })

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
  }, 10_000)

  it('queues different chats up to capacity and returns bounded 429 beyond it', async () => {
    process.env.CRAFTTALKER_GENERATION_CONCURRENCY = '1'
    process.env.CRAFTTALKER_GENERATION_QUEUE_CAPACITY = '1'
    const engine = new AbortAwareStreamEngine()
    setEngine(engine)
    const app = createApp()
    writeCharacter('QueueBot')
    const chatA = await createChat(app, 'QueueBot')
    const chatB = await createChat(app, 'QueueBot')
    const chatC = await createChat(app, 'QueueBot')

    const first = await streamRequest(app, 'QueueBot', chatA)
    const firstReader = first.body?.getReader()
    expect((await firstReader?.read())?.done).toBe(false)

    let secondSettled = false
    const secondPromise = Promise.resolve(streamRequest(app, 'QueueBot', chatB)).then(response => {
      secondSettled = true
      return response
    })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(secondSettled).toBe(false)

    const full = await streamRequest(app, 'QueueBot', chatC)
    expect(full.status).toBe(429)
    expect(full.headers.get('Retry-After')).toBe('1')
    expect(await full.json()).toMatchObject({ code: 5003 })

    await firstReader?.cancel('release queue')
    const second = await secondPromise
    expect(second.status).toBe(200)
    const secondReader = second.body?.getReader()
    expect((await secondReader?.read())?.done).toBe(false)
    await secondReader?.cancel('cleanup')

    const runs = await listGenerationRuns()
    expect(runs.some(run => run.chatId === chatC)).toBe(false)
  })

  it('aborts and closes the upstream generator when the client cancels a stream', async () => {
    const engine = new AbortAwareStreamEngine()
    setEngine(engine)
    const app = createApp()
    writeCharacter('CancelBot')
    const chatId = await createChat(app, 'CancelBot')

    const response = await streamRequest(app, 'CancelBot', chatId)
    const reader = response.body?.getReader()
    expect(reader).toBeDefined()
    expect((await reader?.read())?.done).toBe(false)

    await reader?.cancel('test disconnect')
    await vi.waitFor(() => {
      expect(engine.aborted).toBe(true)
      expect(engine.finalized).toBe(true)
    })

    const runs = await listGenerationRuns()
    expect(runs.find(run => run.characterName === 'CancelBot' && run.chatId === chatId)?.status).toBe('canceled')
  })

  it('propagates client cancellation to non-stream generation', async () => {
    const engine = new AbortAwareGenerateEngine()
    setEngine(engine)
    const app = createApp()
    writeCharacter('CancelFullBot')
    const chatId = await createChat(app, 'CancelFullBot')
    const controller = new AbortController()

    const request = generateRequest(app, 'CancelFullBot', chatId, {}, controller.signal)
    await vi.waitFor(() => expect(lastEngineRequest).not.toBeNull())
    controller.abort('test disconnect')
    await Promise.resolve(request).catch(() => undefined)

    expect(engine.aborted).toBe(true)
  })

  it('rejects new generations with 503 after shutdown starts', async () => {
    const app = createApp()
    writeCharacter('ShutdownRejectBot')
    const chatId = await createChat(app, 'ShutdownRejectBot')
    abortActiveGenerations('test shutdown')

    const response = await generateRequest(app, 'ShutdownRejectBot', chatId)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 5002 })
  })

  it('interrupts an active stream without committing partial content during shutdown', async () => {
    const engine = new AbortAwareStreamEngine()
    setEngine(engine)
    const app = createApp()
    writeCharacter('ShutdownStreamBot')
    const chatId = await createChat(app, 'ShutdownStreamBot')

    const response = await streamRequest(app, 'ShutdownStreamBot', chatId)
    const reader = response.body?.getReader()
    expect((await reader?.read())?.done).toBe(false)
    abortActiveGenerations('test shutdown')
    await vi.waitFor(() => expect(engine.finalized).toBe(true))
    await reader?.read()

    const runs = await listGenerationRuns()
    expect(runs.find(run => run.characterName === 'ShutdownStreamBot' && run.chatId === chatId)?.status).toBe('interrupted')
    expect((await getChat('ShutdownStreamBot', chatId)).lines).toHaveLength(1)
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

  it('loads enabled global world books during generation without character binding', async () => {
    const app = createApp()
    writeCharacter('GlobalScanBot')
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'GlobalScanWorld.json'),
      JSON.stringify({
        name: 'GlobalScanWorld',
        enabled: true,
        global_enabled: true,
        entries: {
          '1': {
            uid: 1,
            key: ['global sigil'],
            content: 'global lore',
            enabled: true,
            insertion_order: 100,
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'GlobalScanBot')
    await addMessage('GlobalScanBot', chatId, true, 'The global sigil is visible.', 'Alice')

    const res = await streamRequest(app, 'GlobalScanBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual(['global lore'])
  })

  it('loads legacy unbound world books without global_enabled as global during generation', async () => {
    const app = createApp()
    writeCharacter('LegacyGlobalScanBot')
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'LegacyGlobalScanWorld.json'),
      JSON.stringify({
        name: 'LegacyGlobalScanWorld',
        enabled: true,
        entries: {
          '1': {
            uid: 1,
            key: ['legacy sigil'],
            content: 'legacy global lore',
            enabled: true,
            insertion_order: 100,
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'LegacyGlobalScanBot')
    await addMessage('LegacyGlobalScanBot', chatId, true, 'The legacy sigil is visible.', 'Alice')

    const res = await streamRequest(app, 'LegacyGlobalScanBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual(['legacy global lore'])
  })

  it('does not load closed global world books during generation', async () => {
    const app = createApp()
    writeCharacter('ClosedGlobalScanBot')
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'ClosedGlobalScanWorld.json'),
      JSON.stringify({
        name: 'ClosedGlobalScanWorld',
        enabled: false,
        global_enabled: true,
        entries: {
          '1': {
            uid: 1,
            key: ['closed sigil'],
            content: 'closed global lore',
            enabled: true,
            insertion_order: 100,
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'ClosedGlobalScanBot')
    await addMessage('ClosedGlobalScanBot', chatId, true, 'The closed sigil is visible.', 'Alice')

    const res = await streamRequest(app, 'ClosedGlobalScanBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

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

  it('isolates world-info scanning from non-scan prompts and generation-after-data messages', async () => {
    const app = createApp()
    writeCharacter('ExtensionScanIsolationBot')
    const charPath = path.join(testDataDir, 'characters', 'ExtensionScanIsolationBot', 'character.json')
    fs.writeFileSync(
      charPath,
      JSON.stringify({
        name: 'ExtensionScanIsolationBot',
        description: 'Test bot',
        extensions: { world: 'ExtensionScanIsolationWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'ExtensionScanIsolationWorld.json'),
      JSON.stringify({
        name: 'ExtensionScanIsolationWorld',
        enabled: true,
        global_enabled: false,
        entries: {
          '1': { uid: 1, key: ['scan signal'], content: 'scan-enabled lore', enabled: true, insertion_order: 100 },
          '2': { uid: 2, key: ['display signal'], content: 'display-only lore', enabled: true, insertion_order: 90 },
          '3': { uid: 3, key: ['hook signal'], content: 'hook-only lore', enabled: true, insertion_order: 80 },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'ExtensionScanIsolationBot')
    await addMessage('ExtensionScanIsolationBot', chatId, true, 'plain message', 'Alice')

    const res = await generateRequest(app, 'ExtensionScanIsolationBot', chatId, {
      stCompatChatOverride: [
        { name: 'Alice', is_user: true, is_system: false, mes: 'plain message' },
      ],
      stCompatExtensionPrompts: [
        { key: 'scan-only', value: 'scan signal', position: -1, scan: true, role: 0 },
        { key: 'display-only', value: 'display signal', position: 0, scan: false, role: 0 },
      ],
      stCompatPromptMessages: [
        { role: 'system', content: 'display signal' },
        { role: 'system', content: 'hook signal' },
        { role: 'user', content: 'plain message' },
      ],
    })

    expect(res.status).toBe(200)
    await res.json()
    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual(['scan-enabled lore'])
    expect(lastEngineRequest?.messages).toEqual([
      { role: 'system', content: 'display signal' },
      { role: 'system', content: 'hook signal' },
      { role: 'user', content: 'plain message' },
    ])
  })

  it('uses the native generation operation for ST world-info trigger filters', async () => {
    const app = createApp()
    writeCharacter('ContinueTriggerBot')
    const charPath = path.join(testDataDir, 'characters', 'ContinueTriggerBot', 'character.json')
    fs.writeFileSync(
      charPath,
      JSON.stringify({
        name: 'ContinueTriggerBot',
        description: 'Test bot',
        extensions: { world: 'ContinueTriggerWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'ContinueTriggerWorld.json'),
      JSON.stringify({
        name: 'ContinueTriggerWorld',
        enabled: true,
        global_enabled: false,
        entries: {
          '1': {
            uid: 1,
            key: ['sealed gate'],
            content: 'continue-only lore',
            enabled: true,
            insertion_order: 100,
            triggers: ['continue'],
          },
          '2': {
            uid: 2,
            key: ['sealed gate'],
            content: 'regenerate-only lore',
            enabled: true,
            insertion_order: 90,
            triggers: ['regenerate'],
          },
        },
      }),
      'utf8',
    )

    const chatId = await createChat(app, 'ContinueTriggerBot')
    await addMessage('ContinueTriggerBot', chatId, true, 'The sealed gate remains.', 'Alice')
    await addMessage('ContinueTriggerBot', chatId, false, 'Existing reply.', 'ContinueTriggerBot')

    const res = await continueRequest(app, 'ContinueTriggerBot', chatId)
    expect(res.status).toBe(200)
    await drain(res)

    expect(lastEngineRequest?.worldEntries?.map(entry => entry.content)).toEqual(['continue-only lore'])
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
