import type { GenerationOperation } from '../lib/generation-locks.js'
import { projectRunJournalEvents } from './run-journal-projector.js'
import type { RunJournalReplayResult } from './run-journal.store.js'

export type AuditableRunStatus = 'running' | 'completed' | 'failed' | 'canceled' | 'interrupted' | 'committed' | 'discarded'

export interface AuditableRunProjection {
  runId: string
  characterName: string
  chatId: string
  operation: GenerationOperation
  status: AuditableRunStatus
  partialContent: string
  committedLineIndex?: number
  stFinalizedAt?: string
}

export interface GenerationRunJournalAuditMismatch {
  runId: string
  field: string
  journalValue: unknown
  projectionValue: unknown
}

export interface GenerationRunJournalAuditResult {
  ok: boolean
  eventCount: number
  tornTail: boolean
  duplicateEventIds: number
  mismatches: GenerationRunJournalAuditMismatch[]
  projectionOnlyRunIds: string[]
}

export function auditRunJournalProjection(
  replay: RunJournalReplayResult,
  storedRuns: AuditableRunProjection[],
): GenerationRunJournalAuditResult {
  const journalProjections = projectRunJournalEvents(replay.events)
  const storedById = new Map(storedRuns.map(run => [run.runId, run]))
  const mismatches: GenerationRunJournalAuditMismatch[] = []
  const compare = (runId: string, field: string, journalValue: unknown, projectionValue: unknown) => {
    if (!Object.is(journalValue, projectionValue)) mismatches.push({ runId, field, journalValue, projectionValue })
  }

  for (const [runId, journal] of journalProjections) {
    const projection = storedById.get(runId)
    if (!projection) {
      mismatches.push({ runId, field: 'projection', journalValue: 'present', projectionValue: 'missing' })
      continue
    }
    compare(runId, 'characterName', journal.characterName, projection.characterName)
    compare(runId, 'chatId', journal.chatId, projection.chatId)
    compare(runId, 'operation', journal.operation, projection.operation)
    compare(runId, 'status', journal.status, projection.status)
    compare(runId, 'partialBytes', journal.partialBytes, Buffer.byteLength(projection.partialContent, 'utf8'))
    compare(runId, 'committedLineIndex', journal.committedLineIndex, projection.committedLineIndex)
    compare(runId, 'stFinalized', journal.stFinalizedAt !== undefined, projection.stFinalizedAt !== undefined)
  }

  const projectionOnlyRunIds = storedRuns.filter(run => !journalProjections.has(run.runId)).map(run => run.runId).sort()
  return {
    ok: mismatches.length === 0 && projectionOnlyRunIds.length === 0 && !replay.tornTail && replay.duplicateEventIds === 0,
    eventCount: replay.events.length,
    tornTail: replay.tornTail,
    duplicateEventIds: replay.duplicateEventIds,
    mismatches,
    projectionOnlyRunIds,
  }
}