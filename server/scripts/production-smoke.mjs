import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyReleaseManifest } from './release-manifest.mjs'

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(serverDir, 'dist')
const entryPath = path.join(distDir, 'index.js')

if (!fs.existsSync(entryPath)) {
  throw new Error('Production server entry is missing. Run npm run build before npm run smoke:production.')
}
await verifyReleaseManifest(distDir)

const port = await reservePort()
const child = spawn(process.execPath, [entryPath], {
  cwd: serverDir,
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    CRAFTTALKER_RUNTIME_MODE: 'local',
    CRAFTTALKER_SHUTDOWN_GRACE_MS: '5000',
  },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
})

let output = ''
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })

try {
  await waitForListening(child, port)
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`Production health check failed with HTTP ${response.status}.`)
  const body = await response.json()
  if (body?.status !== 'ok') throw new Error('Production health check returned an unexpected payload.')

  if (process.platform === 'win32') child.send({ type: 'shutdown' })
  else child.kill('SIGTERM')
  const { code, signal } = await waitForExit(child, 10_000)
  if (code !== 0 || signal !== null) {
    throw new Error(`Production server did not exit cleanly (code=${code}, signal=${signal}).\n${output}`)
  }
  if (!output.includes('[lifecycle] graceful shutdown completed')) {
    throw new Error(`Production server did not report graceful shutdown completion.\n${output}`)
  }
  console.log(`Production server smoke passed on 127.0.0.1:${port}.`)
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await waitForExit(child, 2_000).catch(() => {})
  }
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve a production smoke port.')))
        return
      }
      const { port } = address
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

function waitForListening(processHandle, port) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Production server did not start within 10 seconds.\n${output}`))
    }, 10_000)
    const poll = setInterval(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`)
        if (response.ok) {
          cleanup()
          resolve()
        }
      } catch { /* server is not listening yet */ }
    }, 100)
    const onExit = (code, signal) => {
      cleanup()
      reject(new Error(`Production server exited before listening (code=${code}, signal=${signal}).\n${output}`))
    }
    const cleanup = () => {
      clearTimeout(timeout)
      clearInterval(poll)
      processHandle.off('exit', onExit)
    }
    processHandle.once('exit', onExit)
  })
}

function waitForExit(processHandle, timeoutMs) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
    return Promise.resolve({ code: processHandle.exitCode, signal: processHandle.signalCode })
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      processHandle.off('exit', onExit)
      reject(new Error(`Production server did not exit within ${timeoutMs}ms.\n${output}`))
    }, timeoutMs)
    const onExit = (code, signal) => {
      clearTimeout(timeout)
      resolve({ code, signal })
    }
    processHandle.once('exit', onExit)
  })
}