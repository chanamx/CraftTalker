import { getEngine } from '../engine/index.js'
import type { EngineRequest, EngineResponse } from '../engine/types.js'
import { AppError } from '../lib/errors.js'
import { GenerationStreamLifecycle } from '../lib/generation-stream-lifecycle.js'
import { commitGenerationOutput } from './generation-committer.js'
import * as runService from './run.service.js'

export interface ExecuteNonStreamGenerationInput {
  run: runService.GenerationRunRecord
  request: Omit<EngineRequest, 'signal'>
  isContinue: boolean
  clientSignal: AbortSignal
  shutdownSignal: AbortSignal
}

export async function executeNonStreamGeneration(
  input: ExecuteNonStreamGenerationInput,
): Promise<EngineResponse> {
  let partialContent = ''

  try {
    const response = await getEngine().generate({
      ...input.request,
      signal: AbortSignal.any([input.clientSignal, input.shutdownSignal]),
    })
    partialContent = response.content
    const committed = await commitGenerationOutput({
      runId: input.run.runId,
      characterName: input.run.characterName,
      chatId: input.run.chatId,
      content: response.content,
      isContinue: input.isContinue,
    })

    await runService.completeRun(input.run.runId, {
      partialContent,
      committedLineIndex: committed.lineIndex,
    }).catch(() => {})

    return response
  } catch (error) {
    if (input.shutdownSignal.aborted) {
      await runService.interruptRun(
        input.run.runId,
        'Server shutdown interrupted generation.',
      ).catch(() => {})
    } else if (input.clientSignal.aborted) {
      await runService.cancelRun(input.run.runId, {
        error: 'Client disconnected',
        partialContent,
      }).catch(() => {})
    } else {
      await runService.failRun(input.run.runId, {
        error: getErrorMessage(error),
        partialContent,
      }).catch(() => {})
    }
    throw error
  }
}

export type GenerationStreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done'; runId: string; committedLineIndex?: number }

export interface GenerationStreamExecutionInput {
  run: runService.GenerationRunRecord
  request: Omit<EngineRequest, 'signal'>
  isContinue: boolean
  clientSignal: AbortSignal
  shutdownSignal: AbortSignal
}

export class GenerationStreamExecution {
  private readonly lifecycle: GenerationStreamLifecycle
  private readonly generator: AsyncGenerator<string, void, unknown>
  private readonly chunks: string[] = []
  private canceled = false
  private saved = false
  private terminalRunStarted = false
  private lastPartialFlushAt = 0
  private committedLineIndex: number | undefined

  constructor(private readonly input: GenerationStreamExecutionInput) {
    this.lifecycle = new GenerationStreamLifecycle(
      AbortSignal.any([input.clientSignal, input.shutdownSignal]),
    )
    this.generator = getEngine().generateStream({
      ...input.request,
      signal: this.lifecycle.signal,
    })
  }

  async *events(): AsyncGenerator<GenerationStreamEvent, void, unknown> {
    try {
      for await (const chunk of this.generator) {
        if (this.canceled) break
        this.chunks.push(chunk)
        yield { type: 'chunk', content: chunk }
        await this.flushPartial()
      }
      if (this.canceled || await this.handleAbort()) return

      await this.flushPartial(true)
      this.committedLineIndex = await this.saveGeneratedContent()
      await this.completeRun()
      yield {
        type: 'done',
        runId: this.input.run.runId,
        ...(this.committedLineIndex !== undefined
          ? { committedLineIndex: this.committedLineIndex }
          : {}),
      }
    } catch (error) {
      if (!this.canceled && !await this.handleAbort()) {
        await this.handleError(error)
        throw error
      }
    }
  }

  async cancel(reason?: unknown): Promise<void> {
    this.canceled = true
    if (this.startTerminalRun()) {
      await runService.cancelRun(this.input.run.runId, {
        partialContent: this.fullContent(),
        error: 'Client disconnected',
      }).catch(() => {})
    }
    await this.lifecycle.cancelGenerator(this.generator, reason)
  }

  private async handleAbort(): Promise<boolean> {
    if (!this.input.shutdownSignal.aborted && !this.input.clientSignal.aborted) return false
    if (!this.startTerminalRun()) return true

    if (this.input.shutdownSignal.aborted) {
      await runService.interruptRun(
        this.input.run.runId,
        'Server shutdown interrupted generation.',
      ).catch(() => {})
    } else {
      await runService.cancelRun(this.input.run.runId, {
        partialContent: this.fullContent(),
        error: 'Client disconnected',
      }).catch(() => {})
    }
    return true
  }

  private async saveGeneratedContent(): Promise<number | undefined> {
    if (this.saved) return this.committedLineIndex

    const committed = await commitGenerationOutput({
      runId: this.input.run.runId,
      characterName: this.input.run.characterName,
      chatId: this.input.run.chatId,
      content: this.fullContent(),
      isContinue: this.input.isContinue,
    })
    this.committedLineIndex = committed.lineIndex
    this.saved = true
    return this.committedLineIndex
  }

  private async flushPartial(force = false): Promise<void> {
    const now = Date.now()
    if (!force && now - this.lastPartialFlushAt < 500) return
    this.lastPartialFlushAt = now
    await runService.updateRunPartial(this.input.run.runId, this.fullContent()).catch(() => {})
  }

  private async completeRun(): Promise<void> {
    if (!this.startTerminalRun()) return
    await runService.completeRun(this.input.run.runId, {
      partialContent: this.fullContent(),
      committedLineIndex: this.committedLineIndex,
    }).catch(() => {})
  }

  private async handleError(error: unknown): Promise<void> {
    if (!(error instanceof AppError)) {
      this.committedLineIndex = await this.saveGeneratedContent().catch(() => this.committedLineIndex)
    }
    if (!this.startTerminalRun()) return
    await runService.failRun(this.input.run.runId, {
      error: getErrorMessage(error),
      partialContent: this.fullContent(),
      committedLineIndex: this.committedLineIndex,
    }).catch(() => {})
  }

  private startTerminalRun(): boolean {
    if (this.terminalRunStarted) return false
    this.terminalRunStarted = true
    return true
  }

  private fullContent(): string {
    return this.chunks.join('')
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
