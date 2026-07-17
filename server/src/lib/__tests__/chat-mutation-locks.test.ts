import { afterEach, describe, expect, it } from 'vitest'
import { clearChatMutationLocksForTest, withChatMutationLock, withChatMutationLocks } from '../chat-mutation-locks.js'

afterEach(() => clearChatMutationLocksForTest())

describe('chat mutation locks', () => {
  it('allows the current async transaction to reenter the same chat lock', async () => {
    const nested = withChatMutationLock('Bot', 'chat-a', () =>
      withChatMutationLock('Bot', 'chat-a', async () => 'nested'),
    )
    const result = await Promise.race([
      nested,
      new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 100)),
    ])

    expect(result).toBe('nested')
  })
  it('does not let detached async descendants reuse an expired lock context', async () => {
    const events: string[] = []
    let releaseBlocker!: () => void
    const blockerReleased = new Promise<void>(resolve => { releaseBlocker = resolve })
    let resolveDetached!: () => void
    const detachedDone = new Promise<void>(resolve => { resolveDetached = resolve })

    await withChatMutationLock('Bot', 'chat-a', async () => {
      setTimeout(() => {
        void withChatMutationLock('Bot', 'chat-a', async () => {
          events.push('detached')
        }).then(resolveDetached)
      }, 20)
    })

    const blocker = withChatMutationLock('Bot', 'chat-a', async () => {
      events.push('blocker-start')
      await blockerReleased
      events.push('blocker-end')
    })

    await new Promise(resolve => setTimeout(resolve, 60))
    expect(events).toEqual(['blocker-start'])
    releaseBlocker()
    await Promise.all([blocker, detachedDone])
    expect(events).toEqual(['blocker-start', 'blocker-end', 'detached'])
  })
  it('cancels a queued waiter without letting later waiters overtake the owner', async () => {
    const events: string[] = []
    let notifyFirstStarted!: () => void
    let releaseFirst!: () => void
    const firstStarted = new Promise<void>(resolve => { notifyFirstStarted = resolve })
    const firstBlocked = new Promise<void>(resolve => { releaseFirst = resolve })
    const first = withChatMutationLock('Bot', 'chat-a', async () => {
      events.push('first-start')
      notifyFirstStarted()
      await firstBlocked
      events.push('first-end')
    })
    await firstStarted

    const controller = new AbortController()
    const second = withChatMutationLock('Bot', 'chat-a', async () => {
      events.push('second')
    }, { signal: controller.signal })
    const third = withChatMutationLock('Bot', 'chat-a', async () => {
      events.push('third')
    })

    controller.abort('request disconnected')
    releaseFirst()
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.all([first, third])
    expect(events).toEqual(['first-start', 'first-end', 'third'])
  })
  it('serializes mutations for the same chat while allowing different chats to proceed', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const firstBlocked = new Promise<void>(resolve => { releaseFirst = resolve })

    const first = withChatMutationLock('Bot', 'chat-a', async () => {
      order.push('first-start')
      await firstBlocked
      order.push('first-end')
    })
    const second = withChatMutationLock('Bot', 'chat-a', async () => {
      order.push('second')
    })
    const other = withChatMutationLock('Bot', 'chat-b', async () => {
      order.push('other')
    })

    await other
    expect(order).toEqual(['first-start', 'other'])
    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first-start', 'other', 'first-end', 'second'])
  })
})


describe('withChatMutationLocks', () => {
  it('acquires multiple keys in deterministic order without deadlock', async () => {
    const events: string[] = []
    await Promise.all([
      withChatMutationLocks([{ characterName: 'Bot', chatId: 'b' }, { characterName: 'Bot', chatId: 'a' }], async () => {
        events.push('first-start')
        await new Promise(resolve => setTimeout(resolve, 10))
        events.push('first-end')
      }),
      withChatMutationLocks([{ characterName: 'Bot', chatId: 'a' }, { characterName: 'Bot', chatId: 'b' }], async () => {
        events.push('second-start')
        events.push('second-end')
      }),
    ])
    expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end'])
  })
})
