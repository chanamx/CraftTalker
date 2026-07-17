import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { safePath } from '../lib/path-utils.js'
import { RunArtifactStore, runOutputArtifactRefSchema } from './run-artifact.store.js'
import { applyRunJournalEvent, projectRunJournalEvents } from './run-journal-projector.js'
import { runJournalCursorSchema } from './run-journal.store.js'
import type {
  RunJournalCursor,
  RunJournalEvent,
  RunJournalReplayResult,
  RunJournalStore,
} from './run-journal.store.js'

const operationSchema = z.enum(['generate', 'regenerate', 'continue'])
const statusSchema = z.enum(['running', 'completed', 'failed', 'canceled', 'interrupted', 'committed', 'discarded'])

const runProjectionSchema = z.object({
  runId: z.string().uuid(),
  characterName: z.string().min(1).max(255),
  chatId: z.string().min(1).max(255),
  operation: operationSchema,
  status: statusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  error: z.string().max(512).optional(),
  committedLineIndex: z.number().int().nonnegative().optional(),
  stFinalizedAt: z.string().datetime().optional(),
  partialBytes: z.number().int().nonnegative(),
  outputArtifact: runOutputArtifactRefSchema.optional(),
}).strict()

const runSummarySchema = z.object({
  runId: z.string().uuid(),
  characterName: z.string(),
  chatId: z.string(),
  operation: operationSchema,
  status: statusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  committedLineIndex: z.number().int().nonnegative().optional(),
  stFinalizedAt: z.string().datetime().optional(),
  partialBytes: z.number().int().nonnegative(),
  hasPartialContent: z.boolean(),
  lastJournalSeq: z.number().int().positive(),
}).strict()

const runProjectionIndexSchema = z.object({
  version: z.literal(1),
  lastJournalSeq: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  runs: z.array(runSummarySchema),
}).strict()

const runProjectionCheckpointSchema = runJournalCursorSchema.extend({
  version: z.literal(1),
  updatedAt: z.string().datetime(),
}).strict()

const runProjectionCursorSchema = z.object({
  version: z.literal(1),
  lastJournalSeq: z.number().int().positive(),
  runId: z.string().uuid(),
}).strict()

export type StoredRunProjection = z.infer<typeof runProjectionSchema>
export type RunProjectionSummary = z.infer<typeof runSummarySchema>
export type RunProjectionIndex = z.infer<typeof runProjectionIndexSchema>
export type RunProjectionCheckpoint = z.infer<typeof runProjectionCheckpointSchema>

export interface RunProjectionPage {
  items: RunProjectionSummary[]
  nextCursor: string | null
}

export interface RunProjectionListOptions {
  characterName?: string
  chatId?: string
  status?: RunProjectionSummary['status']
  limit: number
  cursor?: string
}

function summarizeProjection(projection: StoredRunProjection, lastJournalSeq: number) {
  return runSummarySchema.parse({
    runId: projection.runId,
    characterName: projection.characterName,
    chatId: projection.chatId,
    operation: projection.operation,
    status: projection.status,
    createdAt: projection.createdAt,
    updatedAt: projection.updatedAt,
    finishedAt: projection.finishedAt,
    committedLineIndex: projection.committedLineIndex,
    stFinalizedAt: projection.stFinalizedAt,
    partialBytes: projection.partialBytes,
    hasPartialContent: projection.partialBytes > 0,
    lastJournalSeq,
  })
}

function sortSummaries(runs: z.infer<typeof runSummarySchema>[]) {
  return runs.sort((left, right) => right.lastJournalSeq - left.lastJournalSeq || right.runId.localeCompare(left.runId))
}

function encodeCursor(summary: RunProjectionSummary): string {
  return Buffer.from(JSON.stringify({
    version: 1,
    lastJournalSeq: summary.lastJournalSeq,
    runId: summary.runId,
  }), 'utf8').toString('base64url')
}

function decodeCursor(raw: string) {
  try {
    return runProjectionCursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
  } catch {
    throw new Error('Invalid run projection cursor')
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flush: true })
    await fs.rename(tempPath, filePath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }
}

export class RunProjectionStore {
  private readonly projectionsDir: string
  private readonly indexPath: string
  private readonly checkpointPath: string
  private writerTail: Promise<void> = Promise.resolve()

  constructor(runsDir: string) {
    const resolvedRunsDir = path.resolve(runsDir)
    this.projectionsDir = safePath(resolvedRunsDir, 'projections')
    this.indexPath = safePath(resolvedRunsDir, 'index.json')
    this.checkpointPath = safePath(resolvedRunsDir, 'journal', 'checkpoint.json')
  }

  async rebuild(replay: RunJournalReplayResult): Promise<RunProjectionIndex> {
    const projected = projectRunJournalEvents(replay.events)
    const lastSequenceByRun = new Map<string, number>()
    for (const event of replay.events) lastSequenceByRun.set(event.runId, event.journalSeq)

    for (const projection of projected.values()) {
      const validated = runProjectionSchema.parse(projection)
      await atomicWriteJson(this.projectionPath(projection.runId), validated)
    }

    const runs = sortSummaries([...projected.values()].map(projection => summarizeProjection(
      runProjectionSchema.parse(projection),
      lastSequenceByRun.get(projection.runId)!,
    )))

    const index = runProjectionIndexSchema.parse({
      version: 1,
      lastJournalSeq: replay.lastJournalSeq,
      updatedAt: new Date().toISOString(),
      runs,
    })
    await atomicWriteJson(this.indexPath, index)
    await this.writeCheckpoint(replay.cursor)
    return index
  }

  apply(event: RunJournalEvent, cursor?: RunJournalCursor): Promise<RunProjectionIndex> {
    const result = this.writerTail.then(() => this.applyUnlocked(event, cursor))
    this.writerTail = result.then(() => undefined, () => undefined)
    return result
  }

  private async applyUnlocked(event: RunJournalEvent, cursor?: RunJournalCursor): Promise<RunProjectionIndex> {
    if (cursor && cursor.journalSeq !== event.journalSeq) {
      throw new Error('Projection checkpoint sequence does not match the journal event')
    }
    const index = await this.readIndex()
    if (!index) throw new Error('Projection index missing; rebuild required')
    if (event.journalSeq !== index.lastJournalSeq + 1) {
      throw new Error('Projection index journal sequence mismatch; rebuild required')
    }
    if (event.type === 'run.started' && index.runs.some(run => run.runId === event.runId)) {
      throw new Error(`Duplicate run.started event for ${event.runId}`)
    }

    const current = event.type === 'run.started' ? undefined : await this.readProjection(event.runId)
    if (event.type !== 'run.started' && !current) {
      throw new Error(`Projection for ${event.runId} missing; rebuild required`)
    }
    const next = runProjectionSchema.parse(applyRunJournalEvent(current ?? undefined, event))
    await atomicWriteJson(this.projectionPath(event.runId), next)

    const runs = sortSummaries([
      ...index.runs.filter(run => run.runId !== event.runId),
      summarizeProjection(next, event.journalSeq),
    ])
    const nextIndex = runProjectionIndexSchema.parse({
      version: 1,
      lastJournalSeq: event.journalSeq,
      updatedAt: new Date().toISOString(),
      runs,
    })
    await atomicWriteJson(this.indexPath, nextIndex)
    if (cursor) await this.writeCheckpoint(cursor)
    return nextIndex
  }

  async recover(journal: RunJournalStore): Promise<RunProjectionIndex> {
    let checkpoint: RunProjectionCheckpoint | null = null
    let index: RunProjectionIndex | null = null
    let cacheReadFailed = false
    try {
      checkpoint = await this.readCheckpoint()
    } catch {
      cacheReadFailed = true
    }
    try {
      index = await this.readIndex()
    } catch {
      cacheReadFailed = true
    }

    const minimumJournalSeq = Math.max(checkpoint?.journalSeq ?? 0, index?.lastJournalSeq ?? 0)
    if (cacheReadFailed || !checkpoint || !index || checkpoint.journalSeq !== index.lastJournalSeq) {
      return this.rebuildFromJournal(journal, minimumJournalSeq, cacheReadFailed)
    }

    try {
      const tail = await journal.replayTail({
        segment: checkpoint.segment,
        byteOffset: checkpoint.byteOffset,
        journalSeq: checkpoint.journalSeq,
      })
      if (tail.duplicateEventIds > 0) return this.rebuildFromJournal(journal, minimumJournalSeq)
      let recovered = index
      for (const entry of tail.entries) recovered = await this.apply(entry.event, entry.cursor)
      if (recovered.lastJournalSeq !== tail.lastJournalSeq) {
        return this.rebuildFromJournal(journal, minimumJournalSeq)
      }
      return recovered
    } catch {
      return this.rebuildFromJournal(journal, minimumJournalSeq)
    }
  }

  private async rebuildFromJournal(
    journal: RunJournalStore,
    minimumJournalSeq: number,
    rejectEmptyAfterCacheError = false,
  ): Promise<RunProjectionIndex> {
    const replay = await journal.replay()
    if (replay.lastJournalSeq < minimumJournalSeq || (rejectEmptyAfterCacheError && replay.lastJournalSeq === 0)) {
      throw new Error('Run journal is behind the projection checkpoint; repair required')
    }
    return this.rebuild(replay)
  }

  async applyOrRecover(
    journal: RunJournalStore,
    event: RunJournalEvent,
    cursor: RunJournalCursor,
  ): Promise<RunProjectionIndex> {
    try {
      return await this.apply(event, cursor)
    } catch {
      return this.recover(journal)
    }
  }

  async listSummaries(options: RunProjectionListOptions): Promise<RunProjectionPage> {
    let index: RunProjectionIndex | null
    try {
      index = await this.readIndex()
    } catch {
      throw new Error('Run projection summary requires repair')
    }
    if (!index) throw new Error('Run projection summary requires repair')
    const filtered = index.runs.filter(run =>
      (!options.characterName || run.characterName === options.characterName)
      && (!options.chatId || run.chatId === options.chatId)
      && (!options.status || run.status === options.status)
    )

    let start = 0
    if (options.cursor) {
      const cursor = decodeCursor(options.cursor)
      const cursorIndex = filtered.findIndex(run =>
        run.runId === cursor.runId && run.lastJournalSeq === cursor.lastJournalSeq
      )
      if (cursorIndex < 0) throw new Error('Invalid run projection cursor')
      start = cursorIndex + 1
    }

    const items = filtered.slice(start, start + options.limit)
    const hasMore = start + items.length < filtered.length
    return {
      items,
      nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null,
    }
  }

  async readDetail(
    runId: string,
    artifacts: RunArtifactStore,
  ): Promise<StoredRunProjection & { partialContent: string } | null> {
    let projection: StoredRunProjection | null
    try {
      projection = await this.readProjection(runId)
    } catch {
      throw new Error('Run projection detail requires repair')
    }
    if (!projection) {
      let index: RunProjectionIndex | null
      try {
        index = await this.readIndex()
      } catch {
        throw new Error('Run projection detail requires repair')
      }
      if (!index || index.runs.some(run => run.runId === runId)) {
        throw new Error('Run projection detail requires repair')
      }
      return null
    }
    if (projection.partialBytes > 0 && !projection.outputArtifact) {
      throw new Error('Run projection detail requires repair')
    }
    let partialContent = ''
    try {
      partialContent = projection.outputArtifact ? await artifacts.read(projection.outputArtifact) : ''
    } catch {
      throw new Error('Run projection detail requires repair')
    }
    return { ...projection, partialContent }
  }

  async readProjection(runId: string): Promise<StoredRunProjection | null> {
    try {
      return runProjectionSchema.parse(JSON.parse(await fs.readFile(this.projectionPath(runId), 'utf8')))
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  async readIndex(): Promise<RunProjectionIndex | null> {
    try {
      return runProjectionIndexSchema.parse(JSON.parse(await fs.readFile(this.indexPath, 'utf8')))
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  async readCheckpoint(): Promise<RunProjectionCheckpoint | null> {
    try {
      return runProjectionCheckpointSchema.parse(JSON.parse(await fs.readFile(this.checkpointPath, 'utf8')))
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  private async writeCheckpoint(cursor: RunJournalCursor): Promise<void> {
    await atomicWriteJson(this.checkpointPath, runProjectionCheckpointSchema.parse({
      ...cursor,
      version: 1,
      updatedAt: new Date().toISOString(),
    }))
  }

  private projectionPath(runId: string): string {
    return safePath(this.projectionsDir, `${runId}.json`)
  }
}
