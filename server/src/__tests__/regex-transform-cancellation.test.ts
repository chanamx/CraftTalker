import { setImmediate as waitForImmediate } from 'node:timers/promises'
import { describe, expect, it, vi } from 'vitest'

vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  let resolveTermination!: (value: number) => void
  const termination = new Promise<number>((resolve) => { resolveTermination = resolve })
  const state = {
    terminateCalls: 0,
    resolveTermination,
  }

  return {
    Worker: class extends EventEmitter {
      terminate(): Promise<number> {
        state.terminateCalls += 1
        return termination
      }
    },
    __workerTestState: state,
  }
})

import { transformWorldInfoEntriesWithRegex } from '../lib/regex-transform.js'

describe('world-info regex cancellation cleanup', () => {
  it('waits for the regex worker to terminate before rejecting the scan', async () => {
    const workerModule = await import('node:worker_threads') as unknown as {
      __workerTestState: { terminateCalls: number; resolveTermination: (value: number) => void }
    }
    const controller = new AbortController()
    let settled = false
    const transform = transformWorldInfoEntriesWithRegex([
      { id: 'world.1', content: 'slow input' },
    ], [
      { findRegex: '/(a+)+$/g', replaceString: 'blocked', placement: [5], promptOnly: true },
    ], { timeoutMs: 2_000, signal: controller.signal })
      .catch(error => error as Error)
      .finally(() => { settled = true })

    controller.abort('request disconnected')
    await waitForImmediate()

    expect(workerModule.__workerTestState.terminateCalls).toBe(1)
    expect(settled).toBe(false)

    workerModule.__workerTestState.resolveTermination(1)
    await expect(transform).resolves.toMatchObject({ name: 'AbortError' })
  })
})
