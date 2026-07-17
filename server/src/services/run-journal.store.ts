import fs from 'node:fs/promises'
import { z } from 'zod'
import { safePath } from '../lib/path-utils.js'
import {
  finalRunOutputArtifactRefSchema,
  partialRunOutputArtifactRefSchema,
} from './run-artifact.store.js'

export const RUN_JOURNAL_MAX_EVENT_BYTES = 64 * 1024
export const RUN_JOURNAL_MAX_REPLAY_BYTES = 64 * 1024 * 1024
export const RUN_JOURNAL_SEGMENT_NAME = '00000001.jsonl'
const boundedString = z.string().min(1).max(255)
const boundedCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const committedLineIndex = boundedCount.optional()

const envelopeSchema = {
  version: z.literal(1),
  journalSeq: z.number().int().positive(),
  eventId: z.string().uuid(),
  runId: z.string().min(1).max(255),
  at: z.string().datetime(),
}

const startedPayloadSchema = z.object({
  characterName: boundedString,
  chatId: boundedString,
  operation: z.enum(['generate', 'regenerate', 'continue']),
}).strict()
const partialPayloadSchema = z.object({
  partialBytes: boundedCount,
  artifact: partialRunOutputArtifactRefSchema.optional(),
}).strict()
const providerCompletedPayloadSchema = z.object({
  partialBytes: boundedCount,
  committedLineIndex,
  artifact: finalRunOutputArtifactRefSchema.optional(),
}).strict()
const failedOutputPayloadSchema = z.object({
  partialBytes: boundedCount,
  committedLineIndex,
  artifact: partialRunOutputArtifactRefSchema.optional(),
  errorMessage: z.string().min(1).max(512).optional(),
}).strict()
const committedPayloadSchema = z.object({
  committedLineIndex: boundedCount,
}).strict()
const finalizedPayloadSchema = z.object({
  partialBytes: boundedCount,
  committedLineIndex: boundedCount,
  artifact: finalRunOutputArtifactRefSchema.optional(),
}).strict()
const emptyPayloadSchema = z.object({}).strict()
const importedPayloadBase = {
  characterName: boundedString,
  chatId: boundedString,
  operation: z.enum(['generate', 'regenerate', 'continue']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  committedLineIndex,
  stFinalizedAt: z.string().datetime().optional(),
  partialBytes: boundedCount,
}
const importedPayloadSchema = z.discriminatedUnion('status', [
  z.object({ ...importedPayloadBase, status: z.literal('running'), artifact: partialRunOutputArtifactRefSchema.optional() }).strict(),
  z.object({ ...importedPayloadBase, status: z.literal('completed'), artifact: finalRunOutputArtifactRefSchema.optional() }).strict(),
  z.object({ ...importedPayloadBase, status: z.literal('failed'), artifact: partialRunOutputArtifactRefSchema.optional() }).strict(),
  z.object({ ...importedPayloadBase, status: z.literal('canceled'), artifact: partialRunOutputArtifactRefSchema.optional() }).strict(),
  z.object({ ...importedPayloadBase, status: z.literal('interrupted'), artifact: partialRunOutputArtifactRefSchema.optional() }).strict(),
  z.object({ ...importedPayloadBase, status: z.literal('committed'), artifact: finalRunOutputArtifactRefSchema.optional() }).strict(),
  z.object({ ...importedPayloadBase, status: z.literal('discarded'), artifact: partialRunOutputArtifactRefSchema.optional() }).strict(),
])

export const runJournalEventSchema = z.discriminatedUnion('type', [
  z.object({ ...envelopeSchema, type: z.literal('run.imported'), payload: importedPayloadSchema }).strict(),
  z.object({ ...envelopeSchema, type: z.literal('run.started'), payload: startedPayloadSchema }).strict(),
  z.object({ ...envelopeSchema, type: z.literal('run.partial_checkpointed'), payload: partialPayloadSchema }).strict(),
  z.object({ ...envelopeSchema, type: z.literal('run.provider_completed'), payload: providerCompletedPayloadSchema }).strict(),
  z.object({ ...envelopeSchema, type: z.literal('run.failed'), payload: failedOutputPayloadSchema }).strict(),
  z.object({ ...envelopeSchema, type: z.literal('run.canceled'), payload: failedOutputPayloadSchema }).strict(),
  z.object({ ...envelopeSchema, type: z.literal('run.interrupted'), payload: failedOutputPayloadSchema }).strict(),
  z.object({ ...envelopeSchema, type: z.literal('run.committed'), payload: committedPayloadSchema }).strict(),
  z.object({ ...envelopeSchema, type: z.literal('run.st_output_finalized'), payload: finalizedPayloadSchema }).strict(),
  z.object({ ...envelopeSchema, type: z.literal('run.discarded'), payload: emptyPayloadSchema }).strict(),
])

export const runJournalCursorSchema = z.object({
  segment: z.literal(RUN_JOURNAL_SEGMENT_NAME),
  byteOffset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  journalSeq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict()

export type RunJournalEvent = z.infer<typeof runJournalEventSchema>
export type RunJournalCursor = z.infer<typeof runJournalCursorSchema>
type AppendInput<T> = T extends RunJournalEvent
  ? Pick<T, 'runId' | 'type' | 'payload'>
  : never
export type RunJournalAppendInput = AppendInput<RunJournalEvent>

export interface RunJournalAppendResult {
  event: RunJournalEvent
  cursor: RunJournalCursor
}

export interface RunJournalReplayEntry {
  event: RunJournalEvent
  cursor: RunJournalCursor
}

export interface RunJournalReplayResult {
  events: RunJournalEvent[]
  lastJournalSeq: number
  duplicateEventIds: number
  tornTail: boolean
  validBytes: number
  cursor: RunJournalCursor
}

export interface RunJournalTailReplayResult {
  entries: RunJournalReplayEntry[]
  lastJournalSeq: number
  duplicateEventIds: number
  tornTail: boolean
  validBytes: number
  cursor: RunJournalCursor
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function isCriticalEvent(type: RunJournalEvent['type']): boolean {
  return type !== 'run.partial_checkpointed'
}

function emptyReplay(cursor: RunJournalCursor): RunJournalTailReplayResult {
  return {
    entries: [],
    lastJournalSeq: cursor.journalSeq,
    duplicateEventIds: 0,
    tornTail: false,
    validBytes: cursor.byteOffset,
    cursor,
  }
}

function parseJournalBuffer(
  raw: Buffer,
  baseOffset: number,
  initialJournalSeq: number,
): RunJournalTailReplayResult {
  const lastNewline = raw.lastIndexOf(0x0a)
  const validLength = raw.length === 0
    ? 0
    : raw[raw.length - 1] === 0x0a
      ? raw.length
      : lastNewline + 1
  const tornTail = validLength < raw.length
  const entries: RunJournalReplayEntry[] = []
  const eventIds = new Set<string>()
  let duplicateEventIds = 0
  let expectedSeq = initialJournalSeq
  let lineStart = 0

  while (lineStart < validLength) {
    const newline = raw.indexOf(0x0a, lineStart)
    const lineNumber = expectedSeq
    let line = raw.subarray(lineStart, newline)
    if (line.length > 0 && line[line.length - 1] === 0x0d) line = line.subarray(0, -1)
    if (newline - lineStart + 1 > RUN_JOURNAL_MAX_EVENT_BYTES) {
      throw new Error(`Run journal line ${lineNumber} exceeds ${RUN_JOURNAL_MAX_EVENT_BYTES} bytes`)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(line.toString('utf8'))
    } catch {
      throw new Error(`Invalid run journal JSON at line ${lineNumber}`)
    }

    const validated = runJournalEventSchema.safeParse(parsed)
    if (!validated.success) throw new Error(`Invalid run journal event at line ${lineNumber}`)
    if (validated.data.journalSeq !== expectedSeq) {
      throw new Error(`Invalid run journal sequence at line ${lineNumber}`)
    }

    const cursor = runJournalCursorSchema.parse({
      segment: RUN_JOURNAL_SEGMENT_NAME,
      byteOffset: baseOffset + newline + 1,
      journalSeq: expectedSeq,
    })
    expectedSeq += 1
    lineStart = newline + 1

    if (eventIds.has(validated.data.eventId)) {
      duplicateEventIds += 1
      continue
    }
    eventIds.add(validated.data.eventId)
    entries.push({ event: validated.data, cursor })
  }

  const cursor = runJournalCursorSchema.parse({
    segment: RUN_JOURNAL_SEGMENT_NAME,
    byteOffset: baseOffset + validLength,
    journalSeq: expectedSeq - 1,
  })
  return {
    entries,
    lastJournalSeq: cursor.journalSeq,
    duplicateEventIds,
    tornTail,
    validBytes: cursor.byteOffset,
    cursor,
  }
}

export class RunJournalStore {
  private readonly journalDir: string
  private readonly segmentPath: string
  private writerTail: Promise<void> = Promise.resolve()
  private nextJournalSeq: number | undefined
  private nextByteOffset: number | undefined

  constructor(runsDir: string) {
    this.journalDir = safePath(runsDir, 'journal')
    this.segmentPath = safePath(this.journalDir, RUN_JOURNAL_SEGMENT_NAME)
  }

  append(input: RunJournalAppendInput): Promise<RunJournalEvent> {
    return this.appendWithCursor(input).then(result => result.event)
  }

  appendWithCursor(input: RunJournalAppendInput): Promise<RunJournalAppendResult> {
    const result = this.writerTail.then(() => this.appendUnlocked(input))
    this.writerTail = result.then(() => undefined, () => undefined)
    return result
  }

  async flush(): Promise<void> {
    await this.writerTail
  }

  async replay(): Promise<RunJournalReplayResult> {
    await this.writerTail
    return this.readReplay()
  }

  async replayTail(cursorInput: RunJournalCursor): Promise<RunJournalTailReplayResult> {
    await this.writerTail
    const cursor = runJournalCursorSchema.parse(cursorInput)
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined
    try {
      handle = await fs.open(this.segmentPath, 'r')
      const stat = await handle.stat()
      if (cursor.byteOffset > stat.size) throw new Error('Run journal checkpoint is beyond the segment end')
      if (cursor.byteOffset > 0) {
        const previous = Buffer.allocUnsafe(1)
        const { bytesRead } = await handle.read(previous, 0, 1, cursor.byteOffset - 1)
        if (bytesRead !== 1 || previous[0] !== 0x0a) {
          throw new Error('Run journal checkpoint is not aligned to a complete line')
        }
      }

      const tailBytes = stat.size - cursor.byteOffset
      if (tailBytes > RUN_JOURNAL_MAX_REPLAY_BYTES) {
        throw new Error(`Run journal tail exceeds ${RUN_JOURNAL_MAX_REPLAY_BYTES} bytes; repair required`)
      }
      if (tailBytes === 0) return emptyReplay(cursor)

      const raw = Buffer.allocUnsafe(tailBytes)
      let total = 0
      while (total < tailBytes) {
        const { bytesRead } = await handle.read(raw, total, tailBytes - total, cursor.byteOffset + total)
        if (bytesRead === 0) break
        total += bytesRead
      }
      if (total !== tailBytes) throw new Error('Run journal segment changed during tail replay')
      return parseJournalBuffer(raw, cursor.byteOffset, cursor.journalSeq + 1)
    } catch (error) {
      if (isMissingFile(error) && cursor.byteOffset === 0 && cursor.journalSeq === 0) return emptyReplay(cursor)
      throw error
    } finally {
      await handle?.close()
    }
  }

  private async readReplay(): Promise<RunJournalReplayResult> {
    let raw: Buffer
    try {
      const stat = await fs.stat(this.segmentPath)
      if (stat.size > RUN_JOURNAL_MAX_REPLAY_BYTES) {
        throw new Error(`Run journal exceeds ${RUN_JOURNAL_MAX_REPLAY_BYTES} bytes; repair required`)
      }
      raw = await fs.readFile(this.segmentPath)
      if (raw.length > RUN_JOURNAL_MAX_REPLAY_BYTES) {
        throw new Error(`Run journal exceeds ${RUN_JOURNAL_MAX_REPLAY_BYTES} bytes; repair required`)
      }
    } catch (error) {
      if (isMissingFile(error)) {
        const cursor = runJournalCursorSchema.parse({
          segment: RUN_JOURNAL_SEGMENT_NAME,
          byteOffset: 0,
          journalSeq: 0,
        })
        return { ...emptyReplay(cursor), events: [] }
      }
      throw error
    }

    const parsed = parseJournalBuffer(raw, 0, 1)
    return {
      events: parsed.entries.map(entry => entry.event),
      lastJournalSeq: parsed.lastJournalSeq,
      duplicateEventIds: parsed.duplicateEventIds,
      tornTail: parsed.tornTail,
      validBytes: parsed.validBytes,
      cursor: parsed.cursor,
    }
  }

  private async appendUnlocked(input: RunJournalAppendInput): Promise<RunJournalAppendResult> {
    if (this.nextJournalSeq !== undefined && this.nextJournalSeq > 1) {
      try {
        await fs.access(this.segmentPath)
      } catch (error) {
        if (!isMissingFile(error)) throw error
        throw new Error('Run journal segment disappeared after initialization')
      }
    }

    if (this.nextJournalSeq === undefined || this.nextByteOffset === undefined) {
      const replay = await this.readReplay()
      if (replay.tornTail) await fs.truncate(this.segmentPath, replay.validBytes)
      this.nextJournalSeq = replay.lastJournalSeq + 1
      this.nextByteOffset = replay.validBytes
    }

    const candidate: unknown = {
      version: 1,
      journalSeq: this.nextJournalSeq,
      eventId: crypto.randomUUID(),
      runId: input.runId,
      at: new Date().toISOString(),
      type: input.type,
      payload: input.payload,
    }
    const validated = runJournalEventSchema.safeParse(candidate)
    if (!validated.success) throw new Error('Invalid run journal event')

    const line = `${JSON.stringify(validated.data)}\n`
    const lineBytes = Buffer.byteLength(line, 'utf8')
    if (lineBytes > RUN_JOURNAL_MAX_EVENT_BYTES) {
      throw new Error(`Run journal event exceeds ${RUN_JOURNAL_MAX_EVENT_BYTES} bytes`)
    }

    await fs.mkdir(this.journalDir, { recursive: true })
    await fs.appendFile(this.segmentPath, line, {
      encoding: 'utf8',
      flush: isCriticalEvent(validated.data.type),
    })
    this.nextJournalSeq += 1
    this.nextByteOffset += lineBytes
    return {
      event: validated.data,
      cursor: runJournalCursorSchema.parse({
        segment: RUN_JOURNAL_SEGMENT_NAME,
        byteOffset: this.nextByteOffset,
        journalSeq: validated.data.journalSeq,
      }),
    }
  }
}
