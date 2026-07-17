import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireGenerationLock,
  abortActiveGenerations,
  clearGenerationLocksForTest,
  getActiveGenerationCount,
  getQueuedGenerationCount,
  resolveGenerationSchedulerLimits,
  tryAcquireGenerationLock,
  waitForGenerationDrain,
} from '../generation-locks.js'

beforeEach(() => {
  process.env.CRAFTTALKER_GENERATION_CONCURRENCY = '1'
  process.env.CRAFTTALKER_GENERATION_QUEUE_CAPACITY = '2'
})

afterEach(() => {
  clearGenerationLocksForTest()
  delete process.env.CRAFTTALKER_GENERATION_CONCURRENCY
  delete process.env.CRAFTTALKER_GENERATION_QUEUE_CAPACITY
})

describe('generation lock lifecycle', () => {
  it('clamps scheduler environment limits and falls back on invalid values', () => {
    expect(resolveGenerationSchedulerLimits({
      CRAFTTALKER_GENERATION_CONCURRENCY: '0',
      CRAFTTALKER_GENERATION_QUEUE_CAPACITY: '5000',
    })).toEqual({ concurrency: 1, queueCapacity: 1000, perOwnerProviderConcurrency: 2 })
    expect(resolveGenerationSchedulerLimits({
      CRAFTTALKER_GENERATION_CONCURRENCY: '',
      CRAFTTALKER_GENERATION_QUEUE_CAPACITY: 'invalid',
    })).toEqual({ concurrency: 4, queueCapacity: 100, perOwnerProviderConcurrency: 2 })
  })

  it('rejects new generation acquisitions after shutdown begins', async () => {
    abortActiveGenerations('Server shutting down')

    expect(tryAcquireGenerationLock('Bot', 'chat', 'generate')).toBeNull()
    expect(getActiveGenerationCount()).toBe(0)
  })

  it('aborts active generations and waits until their locks release', async () => {
    const lock = tryAcquireGenerationLock('Bot', 'chat', 'generate')
    expect(lock).not.toBeNull()
    let abortReason: unknown
    lock?.signal.addEventListener('abort', () => { abortReason = lock.signal.reason }, { once: true })

    const drained = waitForGenerationDrain(100)
    expect(abortActiveGenerations('Server shutting down')).toBe(1)
    expect(abortReason).toBe('Server shutting down')
    expect(getActiveGenerationCount()).toBe(1)

    lock?.release()

    await expect(drained).resolves.toBe(true)
    expect(getActiveGenerationCount()).toBe(0)
  })

  it('times out when active generations do not release', async () => {
    const lock = tryAcquireGenerationLock('Bot', 'chat', 'generate')

    await expect(waitForGenerationDrain(10)).resolves.toBe(false)
    lock?.release()
  })

  it('queues different chats in FIFO order behind the global concurrency limit', async () => {
    const first = await acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-1', operation: 'generate' })
    expect(first).toMatchObject({ status: 'acquired', queued: false })

    const secondPromise = acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-2', operation: 'generate' })
    const thirdPromise = acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-3', operation: 'generate' })
    await vi.waitFor(() => expect(getQueuedGenerationCount()).toBe(2))

    if (first.status !== 'acquired') throw new Error('Expected first admission')
    first.lock.release()
    const second = await secondPromise
    expect(second).toMatchObject({ status: 'acquired', queued: true })
    expect(getQueuedGenerationCount()).toBe(1)

    if (second.status !== 'acquired') throw new Error('Expected second admission')
    second.lock.release()
    const third = await thirdPromise
    expect(third).toMatchObject({ status: 'acquired', queued: true })
    if (third.status === 'acquired') third.lock.release()
  })

  it('rejects beyond bounded queue capacity with safe retry metadata', async () => {
    process.env.CRAFTTALKER_GENERATION_QUEUE_CAPACITY = '1'
    const first = await acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-1', operation: 'generate' })
    const secondPromise = acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-2', operation: 'generate' })
    await vi.waitFor(() => expect(getQueuedGenerationCount()).toBe(1))

    await expect(acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-3', operation: 'generate' })).resolves.toMatchObject({
      status: 'rejected',
      reason: 'queue_full',
      retryAfterSeconds: 1,
    })

    if (first.status === 'acquired') first.lock.release()
    const second = await secondPromise
    if (second.status === 'acquired') second.lock.release()
  })

  it('keeps per-chat uniqueness across active and queued admissions', async () => {
    const first = await acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-1', operation: 'generate' })
    await expect(acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-1', operation: 'continue' })).resolves.toMatchObject({
      status: 'rejected',
      reason: 'duplicate',
    })

    const queued = acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-2', operation: 'generate' })
    await expect(acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-2', operation: 'regenerate' })).resolves.toMatchObject({
      status: 'rejected',
      reason: 'duplicate',
    })

    if (first.status === 'acquired') first.lock.release()
    const promoted = await queued
    if (promoted.status === 'acquired') promoted.lock.release()
  })

  it('removes client-aborted queued work and rejects queued work during shutdown', async () => {
    const first = await acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-1', operation: 'generate' })
    const client = new AbortController()
    const canceledPromise = acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-2', operation: 'generate', signal: client.signal })
    await vi.waitFor(() => expect(getQueuedGenerationCount()).toBe(1))
    client.abort('disconnect')
    await expect(canceledPromise).resolves.toMatchObject({ status: 'rejected', reason: 'client_aborted' })
    expect(getQueuedGenerationCount()).toBe(0)

    const shutdownPromise = acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-3', operation: 'generate' })
    await vi.waitFor(() => expect(getQueuedGenerationCount()).toBe(1))
    abortActiveGenerations('shutdown')
    await expect(shutdownPromise).resolves.toMatchObject({ status: 'rejected', reason: 'not_accepting' })
    expect(getQueuedGenerationCount()).toBe(0)
    if (first.status === 'acquired') first.lock.release()
  })

  it('bounds queue wait time instead of retaining a request indefinitely', async () => {
    vi.useFakeTimers()
    try {
      const first = await acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-1', operation: 'generate' })
      const queued = acquireGenerationLock({ characterName: 'Bot', chatId: 'chat-2', operation: 'generate' })
      let result: Awaited<typeof queued> | undefined
      void queued.then(value => { result = value })
      await vi.advanceTimersByTimeAsync(30_000)

      expect(result).toMatchObject({
        status: 'rejected',
        reason: 'queue_timeout',
        retryAfterSeconds: 1,
      })
      expect(getQueuedGenerationCount()).toBe(0)
      if (first.status === 'acquired') first.lock.release()
    } finally {
      vi.useRealTimers()
    }
  })

  it('caps each owner-provider group while promoting the earliest eligible queue item', async () => {
    process.env.CRAFTTALKER_GENERATION_CONCURRENCY = '4'
    const acquire = (chatId: string, providerKey: string) => acquireGenerationLock({
      characterName: 'Bot',
      chatId,
      operation: 'generate',
      ownerId: 'owner-a',
      providerKey,
    } as Parameters<typeof acquireGenerationLock>[0] & { ownerId: string; providerKey: string })

    const first = await acquire('chat-1', 'openai')
    const second = await acquire('chat-2', 'openai')
    const blocked = acquire('chat-3', 'openai')
    await vi.waitFor(() => expect(getQueuedGenerationCount()).toBe(1))

    const otherProvider = await acquire('chat-4', 'anthropic')
    expect(otherProvider).toMatchObject({ status: 'acquired', queued: false })
    expect(getActiveGenerationCount()).toBe(3)

    if (first.status === 'acquired') first.lock.release()
    const promoted = await blocked
    expect(promoted).toMatchObject({ status: 'acquired', queued: true })

    if (second.status === 'acquired') second.lock.release()
    if (otherProvider.status === 'acquired') otherProvider.lock.release()
    if (promoted.status === 'acquired') promoted.lock.release()
  })

  it('applies the owner-provider cap to legacy synchronous lock acquisition', () => {
    process.env.CRAFTTALKER_GENERATION_CONCURRENCY = '4'
    const first = tryAcquireGenerationLock('Bot', 'sync-1', 'generate')
    const second = tryAcquireGenerationLock('Bot', 'sync-2', 'generate')
    const third = tryAcquireGenerationLock('Bot', 'sync-3', 'generate')

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(third).toBeNull()
    first?.release()
    second?.release()
  })
})
