import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NativeEngine } from './native.js'
import type { EngineRequest, EngineMessage } from './types.js'
import { buildSTPrompt } from '../lib/prompt-builder.js'
import type { MacroEnv } from '../lib/macros.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface WorkerMessage {
  id: string
  type: 'generate' | 'stream-chunk' | 'stream-end' | 'result' | 'error' | 'test'
  payload?: unknown
}

/**
 * ST Engine compatibility shell.
 *
 * It keeps the public "sillytavern" engine entry point for plugins and
 * compatibility code, while delegating all provider transport to NativeEngine.
 * The worker remains available for future isolated ST runtime work, but it no
 * longer owns LLM networking.
 */
export class STEngine extends NativeEngine {
  readonly name = 'sillytavern'
  private worker: Worker | null = null
  private stPath: string | null = null
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    chunks?: string[]
    onChunk?: (chunk: string) => void
  }>()

  constructor(stPath?: string) {
    super()
    this.stPath = stPath ?? null
  }

  async initialize(stPath: string): Promise<void> {
    this.stPath = stPath
    await this.ensureWorker()
  }

  private async ensureWorker(): Promise<Worker> {
    if (this.worker) return this.worker

    const workerPath = path.join(__dirname, 'st-worker.js')
    this.worker = new Worker(workerPath, {
      workerData: { stPath: this.stPath },
    })

    this.worker.on('message', (msg: WorkerMessage) => {
      const pending = this.pendingRequests.get(msg.id)
      if (!pending) return

      switch (msg.type) {
        case 'result':
          pending.resolve(msg.payload)
          this.pendingRequests.delete(msg.id)
          break
        case 'stream-chunk':
          pending.onChunk?.(msg.payload as string)
          break
        case 'stream-end':
          pending.resolve(undefined)
          this.pendingRequests.delete(msg.id)
          break
        case 'error':
          pending.reject(new Error(msg.payload as string))
          this.pendingRequests.delete(msg.id)
          break
      }
    })

    this.worker.on('error', (err) => {
      for (const [, pending] of this.pendingRequests) {
        pending.reject(err)
      }
      this.pendingRequests.clear()
      this.worker = null
    })

    return this.worker
  }

  private sendRequest<T>(type: string, payload: unknown): Promise<T> {
    const id = crypto.randomUUID()
    return new Promise(async (resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value) => { resolve(value as T) },
        reject,
      })
      const worker = await this.ensureWorker()
      worker.postMessage({ id, type, payload })
    })
  }

  protected override buildPromptInput(request: EngineRequest, macroEnv: MacroEnv): {
    chatMessages: EngineMessage[]
    prompt: string
  } {
    const { messages } = buildSTPrompt({
      character: request.character,
      messages: request.messages,
      userName: macroEnv.user,
      worldInfo: request.worldEntries?.map(entry => entry.content),
      promptAnchors: request.promptAnchors,
    })
    return {
      chatMessages: messages,
      prompt: messages.map(message => message.content).join('\n\n'),
    }
  }

  async buildCompatPrompt(request: EngineRequest): Promise<EngineMessage[]> {
    if (this.worker) {
      return this.sendRequest<EngineMessage[]>('build-prompt', request)
    }
    return this.buildPromptInput(request, { user: request.userName || 'User', char: request.character.name }).chatMessages
  }

  async dispose(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
    }
  }
}
