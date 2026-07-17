import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { resolveRuntimeConfig } from './config/runtime.js'
import { getEngine } from './engine/index.js'
import { abortActiveGenerations, waitForGenerationDrain } from './lib/generation-locks.js'
import { createServerLifecycle, resolveShutdownGraceMs } from './server-lifecycle.js'
import { recoverGenerationRunProjectionCache } from './services/run.service.js'

const port = parseInt(process.env.PORT ?? '3000', 10)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}
const runtimeConfig = resolveRuntimeConfig()
const runRecovery = await recoverGenerationRunProjectionCache()
if (runRecovery.legacyImport.invalid.length > 0) {
  console.warn(`[runs] skipped ${runRecovery.legacyImport.invalid.length} invalid legacy run file(s)`)
}
if (runRecovery.legacyImport.missingLegacyRunIds.length > 0) {
  console.warn(`[runs] ${runRecovery.legacyImport.missingLegacyRunIds.length} journalized run(s) lack legacy fallback files`)
}
const app = createApp()

console.log(`CraftTalker server starting in ${runtimeConfig.mode} mode on http://${runtimeConfig.hostname}:${port}`)

const server = serve({
  fetch: app.fetch,
  port,
  hostname: runtimeConfig.hostname,
  serverOptions: {
    headersTimeout: 15_000,
    requestTimeout: 30_000,
    keepAliveTimeout: 5_000,
  },
}, (info) => {
  console.log(`Server listening on http://${runtimeConfig.hostname}:${info.port}`)
})

const lifecycle = createServerLifecycle({
  server,
  graceMs: resolveShutdownGraceMs(process.env.CRAFTTALKER_SHUTDOWN_GRACE_MS),
  abortGenerations: abortActiveGenerations,
  waitForDrain: waitForGenerationDrain,
  disposeEngine: async () => { await getEngine().dispose?.() },
  log: message => console.log(`[lifecycle] ${message}`),
})

function requestShutdown(reason: NodeJS.Signals | 'IPC'): void {
  void lifecycle.shutdown(reason).catch(error => {
    process.exitCode = 1
    console.error(`[lifecycle] graceful shutdown failed: ${error instanceof Error ? error.message : String(error)}`)
  }).finally(() => {
    if (process.connected) process.disconnect()
  })
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => requestShutdown(signal))
}

process.on('message', message => {
  if (message && typeof message === 'object' && (message as { type?: unknown }).type === 'shutdown') {
    requestShutdown('IPC')
  }
})