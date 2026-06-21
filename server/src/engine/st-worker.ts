import { parentPort, workerData } from 'node:worker_threads'
import { buildSTPrompt } from '../lib/prompt-builder.js'
import type { EngineRequest } from './types.js'

const { stPath: _stPath } = workerData as { stPath: string | null }
if (!parentPort) {
  throw new Error('ST worker must be started from a worker thread')
}
const workerPort = parentPort

interface WorkerMsg {
  id: string
  type: string
  payload: unknown
}

workerPort.on('message', async (msg: WorkerMsg) => {
  const { id, type, payload } = msg

  try {
    switch (type) {
      case 'build-prompt': {
        const req = payload as EngineRequest
        const { messages } = buildSTPrompt({
          character: req.character,
          messages: req.messages,
          userName: req.userName,
          worldInfo: req.worldEntries?.map(entry => entry.content),
        })
        workerPort.postMessage({ id, type: 'result', payload: messages })
        break
      }

      default:
        workerPort.postMessage({ id, type: 'error', payload: `未知请求类型: ${type}` })
    }
  } catch (err) {
    workerPort.postMessage({ id, type: 'error', payload: String(err) })
  }
})
