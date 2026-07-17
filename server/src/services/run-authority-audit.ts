import { auditRunJournalProjection, type AuditableRunProjection } from './run-journal-audit.js'
import { projectRunJournalEvents, type RunJournalProjection } from './run-journal-projector.js'
import type { RunArtifactStore } from './run-artifact.store.js'
import type { RunJournalReplayResult } from './run-journal.store.js'
import type { RunProjectionStore, StoredRunProjection } from './run-projection.store.js'

export interface RunAuthorityCacheMismatch {
  runId?: string
  field: string
  journalValue: unknown
  cacheValue: unknown
}

export interface RunAuthorityArtifactFailure {
  runId: string
  code: 'missing-ref' | 'integrity'
}

export type RunAuthorityIssue =
  | { code: 'journal-torn-tail' }
  | { code: 'journal-duplicate-event-id'; count: number }
  | { code: 'invalid-legacy'; count: number }
  | { code: 'legacy-missing' | 'legacy-only'; runId: string }
  | { code: 'legacy-drift' | 'cache-drift'; runId?: string; field: string }
  | { code: 'artifact-missing-ref' | 'artifact-integrity'; runId: string }

export interface GenerationRunAuthorityAuditResult {
  ok: boolean
  eventCount: number
  tornTail: boolean
  duplicateEventIds: number
  journalSeq: number
  indexSeq: number | null
  checkpointSeq: number | null
  invalidLegacyCount: number
  acknowledgedInvalidLegacyRunIds: string[]
  journalRuns: number
  indexRuns: number
  legacyRuns: number
  missingLegacyRunIds: string[]
  legacyOnlyRunIds: string[]
  legacyMismatches: GenerationRunAuthorityAuditResultLegacyMismatch[]
  cacheMismatches: RunAuthorityCacheMismatch[]
  artifactFailures: RunAuthorityArtifactFailure[]
  issues: RunAuthorityIssue[]
  truncated: boolean
}

type GenerationRunAuthorityAuditResultLegacyMismatch = ReturnType<typeof auditRunJournalProjection>['mismatches'][number]

const MAX_RETURNED_AUDIT_ITEMS = 1_000

export async function auditRunAuthority(options: {
  replay: RunJournalReplayResult
  legacyRuns: AuditableRunProjection[]
  projections: RunProjectionStore
  artifacts: RunArtifactStore
  invalidLegacyCount: number
  acknowledgedInvalidLegacyRunIds?: string[]
}): Promise<GenerationRunAuthorityAuditResult> {
  const journalProjections = projectRunJournalEvents(options.replay.events)
  const journalRunIds = [...journalProjections.keys()].sort()
  const acknowledgedInvalidLegacyRunIds = [...new Set(options.acknowledgedInvalidLegacyRunIds ?? [])]
    .filter(runId => journalProjections.has(runId))
    .sort()
  const acknowledgedInvalidLegacyRunIdSet = new Set(acknowledgedInvalidLegacyRunIds)
  const legacyRunIds = new Set(options.legacyRuns.map(run => run.runId))
  const missingLegacyRunIds = journalRunIds.filter(runId =>
    !legacyRunIds.has(runId) && !acknowledgedInvalidLegacyRunIdSet.has(runId))
  const legacyOnlyRunIds = options.legacyRuns
    .filter(run => !journalProjections.has(run.runId))
    .map(run => run.runId)
    .sort()
  const legacyAudit = auditRunJournalProjection(options.replay, options.legacyRuns)
  const legacyMismatches = legacyAudit.mismatches.filter(mismatch =>
    !(mismatch.field === 'projection' && acknowledgedInvalidLegacyRunIdSet.has(mismatch.runId)))
  const index = await options.projections.readIndex()
  const checkpoint = await options.projections.readCheckpoint()
  const cacheMismatches: RunAuthorityCacheMismatch[] = []
  const artifactFailures: RunAuthorityArtifactFailure[] = []
  const compare = (runId: string | undefined, field: string, journalValue: unknown, cacheValue: unknown) => {
    if (!Object.is(journalValue, cacheValue)) cacheMismatches.push({ runId, field, journalValue, cacheValue })
  }

  compare(undefined, 'index.lastJournalSeq', options.replay.lastJournalSeq, index?.lastJournalSeq ?? null)
  compare(undefined, 'checkpoint.journalSeq', options.replay.lastJournalSeq, checkpoint?.journalSeq ?? null)
  compare(undefined, 'checkpoint.byteOffset', options.replay.cursor.byteOffset, checkpoint?.byteOffset ?? null)

  const indexById = new Map(index?.runs.map(run => [run.runId, run]) ?? [])
  const lastSequenceByRun = new Map<string, number>()
  for (const event of options.replay.events) lastSequenceByRun.set(event.runId, event.journalSeq)
  for (const [runId, journal] of journalProjections) {
    const summary = indexById.get(runId)
    if (!summary) {
      cacheMismatches.push({ runId, field: 'index', journalValue: 'present', cacheValue: 'missing' })
    } else {
      compare(runId, 'index.status', journal.status, summary.status)
      compare(runId, 'index.partialBytes', journal.partialBytes, summary.partialBytes)
      compare(runId, 'index.lastJournalSeq', lastSequenceByRun.get(runId), summary.lastJournalSeq)
    }

    const projection = await options.projections.readProjection(runId)
    if (!projection) {
      cacheMismatches.push({ runId, field: 'projection', journalValue: 'present', cacheValue: 'missing' })
      continue
    }
    compareProjection(runId, journal, projection, compare)
    if (projection.partialBytes > 0 && !projection.outputArtifact) {
      artifactFailures.push({ runId, code: 'missing-ref' })
    } else if (projection.outputArtifact) {
      try {
        await options.artifacts.read(projection.outputArtifact)
      } catch {
        artifactFailures.push({ runId, code: 'integrity' })
      }
    }
  }
  for (const runId of indexById.keys()) {
    if (!journalProjections.has(runId)) {
      cacheMismatches.push({ runId, field: 'index', journalValue: 'missing', cacheValue: 'present' })
    }
  }

  const issues: RunAuthorityIssue[] = []
  if (options.replay.tornTail) issues.push({ code: 'journal-torn-tail' })
  if (options.replay.duplicateEventIds > 0) {
    issues.push({ code: 'journal-duplicate-event-id', count: options.replay.duplicateEventIds })
  }
  if (options.invalidLegacyCount > 0) issues.push({ code: 'invalid-legacy', count: options.invalidLegacyCount })
  for (const runId of missingLegacyRunIds) issues.push({ code: 'legacy-missing', runId })
  for (const runId of legacyOnlyRunIds) issues.push({ code: 'legacy-only', runId })
  for (const mismatch of legacyMismatches) {
    if (mismatch.field !== 'projection') {
      issues.push({ code: 'legacy-drift', runId: mismatch.runId, field: mismatch.field })
    }
  }
  for (const mismatch of cacheMismatches) {
    issues.push({
      code: 'cache-drift',
      ...(mismatch.runId !== undefined && { runId: mismatch.runId }),
      field: mismatch.field,
    })
  }
  for (const failure of artifactFailures) {
    issues.push({
      code: failure.code === 'missing-ref' ? 'artifact-missing-ref' : 'artifact-integrity',
      runId: failure.runId,
    })
  }

  const truncated = issues.length > MAX_RETURNED_AUDIT_ITEMS
    || legacyMismatches.length > MAX_RETURNED_AUDIT_ITEMS
    || cacheMismatches.length > MAX_RETURNED_AUDIT_ITEMS
    || artifactFailures.length > MAX_RETURNED_AUDIT_ITEMS
    || missingLegacyRunIds.length > MAX_RETURNED_AUDIT_ITEMS
    || legacyOnlyRunIds.length > MAX_RETURNED_AUDIT_ITEMS
  return {
    ok: legacyMismatches.length === 0
      && legacyAudit.projectionOnlyRunIds.length === 0
      && !legacyAudit.tornTail
      && legacyAudit.duplicateEventIds === 0
      && cacheMismatches.length === 0
      && artifactFailures.length === 0
      && options.invalidLegacyCount === 0,
    eventCount: options.replay.events.length,
    tornTail: options.replay.tornTail,
    duplicateEventIds: options.replay.duplicateEventIds,
    journalSeq: options.replay.lastJournalSeq,
    indexSeq: index?.lastJournalSeq ?? null,
    checkpointSeq: checkpoint?.journalSeq ?? null,
    invalidLegacyCount: options.invalidLegacyCount,
    acknowledgedInvalidLegacyRunIds,
    journalRuns: journalRunIds.length,
    indexRuns: indexById.size,
    legacyRuns: options.legacyRuns.length,
    missingLegacyRunIds: missingLegacyRunIds.slice(0, MAX_RETURNED_AUDIT_ITEMS),
    legacyOnlyRunIds: legacyOnlyRunIds.slice(0, MAX_RETURNED_AUDIT_ITEMS),
    legacyMismatches: legacyMismatches.slice(0, MAX_RETURNED_AUDIT_ITEMS),
    cacheMismatches: cacheMismatches.slice(0, MAX_RETURNED_AUDIT_ITEMS),
    artifactFailures: artifactFailures.slice(0, MAX_RETURNED_AUDIT_ITEMS),
    issues: issues.slice(0, MAX_RETURNED_AUDIT_ITEMS),
    truncated,
  }
}

function compareProjection(
  runId: string,
  journal: RunJournalProjection,
  projection: StoredRunProjection,
  compare: (runId: string, field: string, journalValue: unknown, cacheValue: unknown) => void,
): void {
  compare(runId, 'projection.characterName', journal.characterName, projection.characterName)
  compare(runId, 'projection.chatId', journal.chatId, projection.chatId)
  compare(runId, 'projection.operation', journal.operation, projection.operation)
  compare(runId, 'projection.status', journal.status, projection.status)
  compare(runId, 'projection.createdAt', journal.createdAt, projection.createdAt)
  compare(runId, 'projection.updatedAt', journal.updatedAt, projection.updatedAt)
  compare(runId, 'projection.finishedAt', journal.finishedAt, projection.finishedAt)
  compare(runId, 'projection.partialBytes', journal.partialBytes, projection.partialBytes)
  compare(runId, 'projection.committedLineIndex', journal.committedLineIndex, projection.committedLineIndex)
  compare(runId, 'projection.stFinalizedAt', journal.stFinalizedAt, projection.stFinalizedAt)
}
