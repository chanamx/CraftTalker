import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Engine, EngineRequest, EngineResponse } from './types.js'
import type { LLMConfig } from '../services/llm.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface WorkerMessage {
  id: string
  type: 'generate' | 'stream-chunk' | 'stream-end' | 'result' | 'error' | 'test'
  payload?: unknown
}

/**
 * ST Engine - 通过 Worker Thread 加载 SillyTavern 的 prompt 构建逻辑
 * 目前为骨架实现，后续将加载 ST 的 JS 模块
 */
export class STEngine implements Engine {
  readonly name = 'sillytavern'
  private worker: Worker | null = null
  private stPath: string | null = null
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void
    reject: (error: Error) => void
    chunks?: string[]
    onChunk?: (chunk: string) => void
  }>()

  constructor(stPath?: string) {
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
      this.pendingRequests.set(id, { resolve, reject })
      const worker = await this.ensureWorker()
      worker.postMessage({ id, type, payload })
    })
  }

  async generate(request: EngineRequest): Promise<EngineResponse> {
    return this.sendRequest<EngineResponse>('generate', request)
  }

  async *generateStream(request: EngineRequest): AsyncGenerator<string, void, unknown> {
    const id = crypto.randomUUID()
    const chunks: string[] = []
    let done = false
    let error: Error | null = null
    let resolver: (() => void) | null = null

    this.pendingRequests.set(id, {
      resolve: () => { done = true; resolver?.() },
      reject: (err) => { error = err; done = true; resolver?.() },
      onChunk: (chunk) => { chunks.push(chunk); resolver?.() },
    })

    const worker = await this.ensureWorker()
    worker.postMessage({ id, type: 'stream', payload: request })

    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!
      } else if (!done) {
        await new Promise<void>((r) => { resolver = r })
      }
    }

    this.pendingRequests.delete(id)
    if (error) throw error
  }

  async testConnection(config: LLMConfig): Promise<boolean> {
    try {
      return await this.sendRequest<boolean>('test', config)
    } catch {
      return false
    }
  }

  async dispose(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
    }
  }
}
