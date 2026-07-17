export interface ShutdownServer {
  close(callback: (error?: Error) => void): void
  closeIdleConnections?: () => void
  closeAllConnections?: () => void
}

interface ServerLifecycleOptions {
  server: ShutdownServer
  graceMs: number
  abortGenerations: (reason: unknown) => number
  waitForDrain: (timeoutMs: number) => Promise<boolean>
  disposeEngine: () => Promise<void>
  log?: (message: string) => void
}

const DEFAULT_SHUTDOWN_GRACE_MS = 15_000

export function resolveShutdownGraceMs(raw: string | undefined): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_SHUTDOWN_GRACE_MS
  return Math.min(120_000, Math.max(1_000, Math.floor(parsed)))
}

export function createServerLifecycle(options: ServerLifecycleOptions) {
  let shutdownPromise: Promise<void> | null = null

  return {
    shutdown(signal: NodeJS.Signals | string): Promise<void> {
      shutdownPromise ??= performShutdown(options, signal)
      return shutdownPromise
    },
  }
}

async function performShutdown(options: ServerLifecycleOptions, signal: string): Promise<void> {
  options.log?.(`graceful shutdown started (${signal})`)
  const serverClosed = closeServer(options.server)
  options.server.closeIdleConnections?.()
  options.abortGenerations(`Server shutting down (${signal})`)

  const drained = await options.waitForDrain(options.graceMs)
  if (!drained) {
    options.log?.('generation drain timed out; force closing connections')
    options.server.closeAllConnections?.()
  }

  await options.disposeEngine()
  await serverClosed
  options.log?.('graceful shutdown completed')
}

function closeServer(server: ShutdownServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}
