import { describe, expect, it, vi } from 'vitest'
import { createServerLifecycle, resolveShutdownGraceMs } from '../server-lifecycle.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('server lifecycle', () => {
  it('clamps shutdown grace configuration to a safe range', () => {
    expect(resolveShutdownGraceMs(undefined)).toBe(15_000)
    expect(resolveShutdownGraceMs('10')).toBe(1_000)
    expect(resolveShutdownGraceMs('999999')).toBe(120_000)
    expect(resolveShutdownGraceMs('invalid')).toBe(15_000)
  })

  it('stops accepting connections, aborts generations, drains, and disposes once', async () => {
    const closed = deferred()
    const close = vi.fn((callback: (error?: Error) => void) => {
      callback()
      closed.resolve()
    })
    const closeIdleConnections = vi.fn()
    const closeAllConnections = vi.fn()
    const abortGenerations = vi.fn(() => 1)
    const waitForDrain = vi.fn(async () => true)
    const disposeEngine = vi.fn(async () => undefined)
    const log = vi.fn()
    const lifecycle = createServerLifecycle({
      server: { close, closeIdleConnections, closeAllConnections },
      graceMs: 5_000,
      abortGenerations,
      waitForDrain,
      disposeEngine,
      log,
    })

    const first = lifecycle.shutdown('SIGTERM')
    const second = lifecycle.shutdown('SIGINT')
    await Promise.all([first, second, closed.promise])

    expect(close).toHaveBeenCalledTimes(1)
    expect(closeIdleConnections).toHaveBeenCalledTimes(1)
    expect(abortGenerations).toHaveBeenCalledWith('Server shutting down (SIGTERM)')
    expect(waitForDrain).toHaveBeenCalledWith(5_000)
    expect(disposeEngine).toHaveBeenCalledTimes(1)
    expect(closeAllConnections).not.toHaveBeenCalled()
    expect(log).toHaveBeenLastCalledWith('graceful shutdown completed')
  })

  it('force closes remaining connections when generation drain times out', async () => {
    const closeAllConnections = vi.fn()
    const lifecycle = createServerLifecycle({
      server: {
        close: (callback: (error?: Error) => void) => callback(),
        closeIdleConnections: vi.fn(),
        closeAllConnections,
      },
      graceMs: 1,
      abortGenerations: () => 1,
      waitForDrain: async () => false,
      disposeEngine: async () => undefined,
      log: vi.fn(),
    })

    await lifecycle.shutdown('SIGTERM')
    expect(closeAllConnections).toHaveBeenCalledTimes(1)
  })
})
