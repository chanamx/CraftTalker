import type { GenerationOperation } from '../lib/generation-locks.js'
import type { RunArtifactStore, RunOutputArtifactRef } from './run-artifact.store.js'
import type { RunJournalEvent } from './run-journal.store.js'

export type RunJournalProjectedStatus = 'running' | 'completed' | 'failed' | 'canceled' | 'interrupted' | 'committed' | 'discarded'

export interface RunJournalProjection {
  runId: string
  characterName: string
  chatId: string
  operation: GenerationOperation
  status: RunJournalProjectedStatus
  createdAt: string
  updatedAt: string
  startedAt: string
  finishedAt?: string
  error?: string
  committedLineIndex?: number
  stFinalizedAt?: string
  partialBytes: number
  outputArtifact?: RunOutputArtifactRef
}

function checkedArtifact(partialBytes: number, artifact?: RunOutputArtifactRef): RunOutputArtifactRef | undefined {
  if (artifact && artifact.bytes !== partialBytes) throw new Error('Run journal artifact byte count mismatch')
  return artifact
}

export function applyRunJournalEvent(
  current: RunJournalProjection | undefined,
  event: RunJournalEvent,
): RunJournalProjection {
  if (event.type === 'run.imported') {
    if (current) throw new Error(`Duplicate run.imported event for ${event.runId}`)
    return {
      runId: event.runId,
      characterName: event.payload.characterName,
      chatId: event.payload.chatId,
      operation: event.payload.operation,
      status: event.payload.status,
      createdAt: event.payload.createdAt,
      updatedAt: event.payload.updatedAt,
      startedAt: event.payload.startedAt,
      finishedAt: event.payload.finishedAt,
      committedLineIndex: event.payload.committedLineIndex,
      stFinalizedAt: event.payload.stFinalizedAt,
      partialBytes: event.payload.partialBytes,
      outputArtifact: checkedArtifact(event.payload.partialBytes, event.payload.artifact),
      error: event.payload.status === 'failed'
        ? 'Generation failed.'
        : event.payload.status === 'canceled'
          ? 'Generation canceled.'
          : event.payload.status === 'interrupted'
            ? 'Generation interrupted.'
            : undefined,
    }
  }

  if (event.type === 'run.started') {
    if (current) throw new Error(`Duplicate run.started event for ${event.runId}`)
    return {
      runId: event.runId,
      characterName: event.payload.characterName,
      chatId: event.payload.chatId,
      operation: event.payload.operation,
      status: 'running',
      createdAt: event.at,
      updatedAt: event.at,
      startedAt: event.at,
      partialBytes: 0,
    }
  }

  if (!current) throw new Error(`Run journal event ${event.type} precedes run.started for ${event.runId}`)
  switch (event.type) {
    case 'run.partial_checkpointed':
      return {
        ...current,
        updatedAt: event.at,
        partialBytes: event.payload.partialBytes,
        outputArtifact: checkedArtifact(event.payload.partialBytes, event.payload.artifact),
      }
    case 'run.provider_completed':
      return {
        ...current,
        status: 'completed',
        updatedAt: event.at,
        finishedAt: event.at,
        partialBytes: event.payload.partialBytes,
        outputArtifact: checkedArtifact(event.payload.partialBytes, event.payload.artifact),
        committedLineIndex: event.payload.committedLineIndex,
      }
    case 'run.failed':
    case 'run.canceled':
    case 'run.interrupted':
      return {
        ...current,
        status: event.type === 'run.failed' ? 'failed' : event.type === 'run.canceled' ? 'canceled' : 'interrupted',
        updatedAt: event.at,
        finishedAt: event.at,
        partialBytes: event.payload.partialBytes,
        outputArtifact: checkedArtifact(event.payload.partialBytes, event.payload.artifact),
        committedLineIndex: event.payload.committedLineIndex,
        error: event.payload.errorMessage ?? (event.type === 'run.failed'
          ? 'Generation failed.'
          : event.type === 'run.canceled'
            ? 'Generation canceled.'
            : 'Generation interrupted.'),
      }
    case 'run.committed':
      if (current.status === 'committed' && current.committedLineIndex !== undefined) {
        if (current.committedLineIndex !== event.payload.committedLineIndex) {
          throw new Error('Run journal repeated commit targets a different chat line')
        }
        return current
      }
      return {
        ...current,
        status: 'committed',
        updatedAt: event.at,
        finishedAt: event.at,
        committedLineIndex: event.payload.committedLineIndex,
      }
    case 'run.st_output_finalized':
      return {
        ...current,
        updatedAt: event.at,
        stFinalizedAt: event.at,
        partialBytes: event.payload.partialBytes,
        outputArtifact: checkedArtifact(event.payload.partialBytes, event.payload.artifact),
        committedLineIndex: event.payload.committedLineIndex,
      }
    case 'run.discarded':
      return { ...current, status: 'discarded', updatedAt: event.at, finishedAt: event.at }
  }
}

export function projectRunJournalEvents(events: RunJournalEvent[]): Map<string, RunJournalProjection> {
  const projections = new Map<string, RunJournalProjection>()
  for (const event of events) {
    projections.set(event.runId, applyRunJournalEvent(projections.get(event.runId), event))
  }
  return projections
}

export async function materializeRunJournalProjection(
  projection: RunJournalProjection,
  artifacts: RunArtifactStore,
): Promise<RunJournalProjection & { partialContent: string }> {
  return {
    ...projection,
    partialContent: projection.outputArtifact ? await artifacts.read(projection.outputArtifact) : '',
  }
}