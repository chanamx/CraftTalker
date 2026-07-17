import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NativeEngine, setEngine } from '../engine/index.js'
import type { Engine, EngineRequest, EngineResponse } from '../engine/types.js'
import { createError, ErrorCode } from '../lib/errors.js'
import { createChat, getChat } from '../services/chat.service.js'
import {
  executeNonStreamGeneration,
  GenerationStreamExecution,
  type GenerationStreamEvent,
} from '../services/generation-executor.js'
import {
  clearRunJournalStoresForTest,
  createGenerationRun,
  getGenerationRun,
} from '../services/run.service.js'

const dataDir = path.join(os.tmpdir(), `crafttalker-generation-executor-${crypto.randomUUID()}`)

class TestEngine implements Engine {
  readonly name = 'generation-executor-test'

  constructor(private readonly result: EngineResponse | Error) {}

  async generate(request: EngineRequest): Promise<EngineResponse> {
    if (request.signal?.aborted) throw new Error('generation aborted')
    if (this.result instanceof Error) throw this.result
    return this.result
  }

  async *generateStream(): AsyncGenerator<string, void, unknown> {}

  async testConnection(): Promise<boolean> {
    return true
  }
}

class StreamTestEngine implements Engine {
  readonly name = 'generation-stream-executor-test'

  constructor(
    private readonly stream: (request: EngineRequest) => AsyncGenerator<string, void, unknown>,
  ) {}

  async generate(): Promise<EngineResponse> {
    return { content: '', finishReason: 'stop' }
  }

  generateStream(request: EngineRequest): AsyncGenerator<string, void, unknown> {
    return this.stream(request)
  }

  async testConnection(): Promise<boolean> {
    return true
  }
}

beforeEach(() => {
  process.env.LUKER_DATA_DIR = dataDir
})

afterEach(async () => {
  setEngine(new NativeEngine())
  clearRunJournalStoresForTest()
  delete process.env.LUKER_DATA_DIR
  await fs.rm(dataDir, { recursive: true, force: true })
})

function engineRequest(): Omit<EngineRequest, 'signal'> {
  return {
    messages: [],
    character: { name: 'ExecutorBot' },
    preset: {},
    config: { provider: 'openai', model: 'test' },
  } as unknown as Omit<EngineRequest, 'signal'>
}

describe('generation executor', () => {
  it('executes and commits a non-stream generation without a Hono context', async () => {
    setEngine(new TestEngine({ content: 'executor reply', finishReason: 'stop' }))
    const chat = await createChat('ExecutorBot')
    const run = await createGenerationRun({
      characterName: 'ExecutorBot',
      chatId: chat.chatId,
      operation: 'generate',
    })

    const response = await executeNonStreamGeneration({
      run,
      request: engineRequest(),
      isContinue: false,
      clientSignal: new AbortController().signal,
      shutdownSignal: new AbortController().signal,
    })

    expect(response).toMatchObject({ content: 'executor reply', finishReason: 'stop' })
    expect(await getGenerationRun(run.runId)).toMatchObject({
      status: 'completed',
      partialContent: 'executor reply',
      committedLineIndex: 1,
    })
    expect((await getChat('ExecutorBot', chat.chatId)).lines[1]).toMatchObject({
      mes: 'executor reply',
      extra: { crafttalker: { run_ids: [run.runId] } },
    })
  })

  it('classifies a shutdown abort as interrupted', async () => {
    setEngine(new TestEngine(new Error('should be classified by signal')))
    const chat = await createChat('ExecutorShutdownBot')
    const run = await createGenerationRun({
      characterName: 'ExecutorShutdownBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    const shutdown = new AbortController()
    shutdown.abort('shutdown')

    await expect(executeNonStreamGeneration({
      run,
      request: engineRequest(),
      isContinue: false,
      clientSignal: new AbortController().signal,
      shutdownSignal: shutdown.signal,
    })).rejects.toThrow('generation aborted')
    expect(await getGenerationRun(run.runId)).toMatchObject({ status: 'interrupted' })
  })

  it('classifies a client abort as canceled', async () => {
    setEngine(new TestEngine(new Error('should be classified by signal')))
    const chat = await createChat('ExecutorCancelBot')
    const run = await createGenerationRun({
      characterName: 'ExecutorCancelBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    const client = new AbortController()
    client.abort('disconnect')

    await expect(executeNonStreamGeneration({
      run,
      request: engineRequest(),
      isContinue: false,
      clientSignal: client.signal,
      shutdownSignal: new AbortController().signal,
    })).rejects.toThrow('generation aborted')
    expect(await getGenerationRun(run.runId)).toMatchObject({
      status: 'canceled',
      error: 'Client disconnected',
    })
  })

  it('classifies an ordinary engine error as failed', async () => {
    setEngine(new TestEngine(new Error('provider failed')))
    const chat = await createChat('ExecutorFailBot')
    const run = await createGenerationRun({
      characterName: 'ExecutorFailBot',
      chatId: chat.chatId,
      operation: 'generate',
    })

    await expect(executeNonStreamGeneration({
      run,
      request: engineRequest(),
      isContinue: false,
      clientSignal: new AbortController().signal,
      shutdownSignal: new AbortController().signal,
    })).rejects.toThrow('provider failed')
    expect(await getGenerationRun(run.runId)).toMatchObject({
      status: 'failed',
      error: 'provider failed',
      partialContent: '',
    })
  })

  it('streams transport-neutral chunk and done events before committing the run', async () => {
    setEngine(new StreamTestEngine(async function* () {
      yield 'stream '
      yield 'reply'
    }))
    const chat = await createChat('StreamExecutorBot')
    const run = await createGenerationRun({
      characterName: 'StreamExecutorBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    const execution = new GenerationStreamExecution({
      run,
      request: engineRequest(),
      isContinue: false,
      clientSignal: new AbortController().signal,
      shutdownSignal: new AbortController().signal,
    })

    const events: GenerationStreamEvent[] = []
    for await (const event of execution.events()) events.push(event)

    expect(events).toEqual([
      { type: 'chunk', content: 'stream ' },
      { type: 'chunk', content: 'reply' },
      { type: 'done', runId: run.runId, committedLineIndex: 1 },
    ])
    expect(await getGenerationRun(run.runId)).toMatchObject({
      status: 'completed',
      partialContent: 'stream reply',
      committedLineIndex: 1,
    })
    expect((await getChat('StreamExecutorBot', chat.chatId)).lines[1]).toMatchObject({
      mes: 'stream reply',
      extra: { crafttalker: { run_ids: [run.runId] } },
    })
  })

  it('commits ordinary partial stream output before recording failure', async () => {
    setEngine(new StreamTestEngine(async function* () {
      yield 'partial'
      throw new Error('stream provider failed')
    }))
    const chat = await createChat('StreamFailExecutorBot')
    const run = await createGenerationRun({
      characterName: 'StreamFailExecutorBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    const execution = new GenerationStreamExecution({
      run,
      request: engineRequest(),
      isContinue: false,
      clientSignal: new AbortController().signal,
      shutdownSignal: new AbortController().signal,
    })

    await expect(async () => {
      for await (const _event of execution.events()) { /* drain */ }
    }).rejects.toThrow('stream provider failed')

    expect(await getGenerationRun(run.runId)).toMatchObject({
      status: 'failed',
      partialContent: 'partial',
      committedLineIndex: 1,
    })
    expect((await getChat('StreamFailExecutorBot', chat.chatId)).lines[1]).toMatchObject({ mes: 'partial' })
  })

  it('does not commit partial output for an AppError stream failure', async () => {
    setEngine(new StreamTestEngine(async function* () {
      yield 'must not commit'
      throw createError(ErrorCode.VALIDATION_ERROR, 'invalid stream request')
    }))
    const chat = await createChat('StreamAppErrorExecutorBot')
    const run = await createGenerationRun({
      characterName: 'StreamAppErrorExecutorBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    const execution = new GenerationStreamExecution({
      run,
      request: engineRequest(),
      isContinue: false,
      clientSignal: new AbortController().signal,
      shutdownSignal: new AbortController().signal,
    })

    await expect(async () => {
      for await (const _event of execution.events()) { /* drain */ }
    }).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR })

    const failedRun = await getGenerationRun(run.runId)
    expect(failedRun).toMatchObject({
      status: 'failed',
      partialContent: 'must not commit',
    })
    expect(failedRun?.committedLineIndex).toBeUndefined()
    expect((await getChat('StreamAppErrorExecutorBot', chat.chatId)).lines).toHaveLength(1)
  })

  it('interrupts an active stream without committing partial output on shutdown', async () => {
    let finalized = false
    setEngine(new StreamTestEngine(async function* (request) {
      try {
        yield 'started'
        if (request.signal?.aborted) return
        await new Promise<void>(resolve => request.signal?.addEventListener('abort', () => resolve(), { once: true }))
      } finally {
        finalized = true
      }
    }))
    const chat = await createChat('StreamShutdownExecutorBot')
    const run = await createGenerationRun({
      characterName: 'StreamShutdownExecutorBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    const shutdown = new AbortController()
    const execution = new GenerationStreamExecution({
      run,
      request: engineRequest(),
      isContinue: false,
      clientSignal: new AbortController().signal,
      shutdownSignal: shutdown.signal,
    })
    const events = execution.events()

    expect(await events.next()).toMatchObject({ value: { type: 'chunk', content: 'started' }, done: false })
    shutdown.abort('shutdown')
    expect((await events.next()).done).toBe(true)

    expect(finalized).toBe(true)
    expect(await getGenerationRun(run.runId)).toMatchObject({ status: 'interrupted' })
    expect((await getChat('StreamShutdownExecutorBot', chat.chatId)).lines).toHaveLength(1)
  })

  it('cancels the generator and records partial content without committing it', async () => {
    let finalized = false
    setEngine(new StreamTestEngine(async function* (request) {
      try {
        yield 'started'
        if (request.signal?.aborted) return
        await new Promise<void>(resolve => request.signal?.addEventListener('abort', () => resolve(), { once: true }))
      } finally {
        finalized = true
      }
    }))
    const chat = await createChat('StreamCancelExecutorBot')
    const run = await createGenerationRun({
      characterName: 'StreamCancelExecutorBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    const execution = new GenerationStreamExecution({
      run,
      request: engineRequest(),
      isContinue: false,
      clientSignal: new AbortController().signal,
      shutdownSignal: new AbortController().signal,
    })
    const events = execution.events()

    expect(await events.next()).toMatchObject({ value: { type: 'chunk', content: 'started' }, done: false })
    await execution.cancel('disconnect')
    expect((await events.next()).done).toBe(true)

    expect(finalized).toBe(true)
    expect(await getGenerationRun(run.runId)).toMatchObject({
      status: 'canceled',
      partialContent: 'started',
      error: 'Client disconnected',
    })
    expect((await getChat('StreamCancelExecutorBot', chat.chatId)).lines).toHaveLength(1)
  })
})
