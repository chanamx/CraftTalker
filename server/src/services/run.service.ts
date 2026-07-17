import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { safePath } from '../lib/path-utils.js'
import type { GenerationOperation } from '../lib/generation-locks.js'
import { RunArtifactStore } from './run-artifact.store.js'
import {
  acknowledgeInvalidLegacyRunFile,
  importLegacyRunFiles,
  inspectLegacyRunFiles,
} from './run-legacy-importer.js'
import { auditRunAuthority, type GenerationRunAuthorityAuditResult } from './run-authority-audit.js'
import { RunProjectionStore } from './run-projection.store.js'
import {
  RunJournalStore,
  type RunJournalAppendInput,
  type RunJournalReplayResult,
} from './run-journal.store.js'
import {
  auditRunJournalProjection,
  type GenerationRunJournalAuditResult,
} from './run-journal-audit.js'
export type {
  GenerationRunJournalAuditMismatch,
  GenerationRunJournalAuditResult,
} from './run-journal-audit.js'
export type { GenerationRunAuthorityAuditResult } from './run-authority-audit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')
const MAX_STARTUP_RUNNING_RUNS = 1_000

export type GenerationRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'interrupted'
  | 'committed'
  | 'discarded'

export interface GenerationRunRecord {
  runId: string
  characterName: string
  chatId: string
  operation: GenerationOperation
  status: GenerationRunStatus
  createdAt: string
  updatedAt: string
  startedAt: string
  finishedAt?: string
  partialContent: string
  error?: string
  committedLineIndex?: number
  stFinalizedAt?: string
}

export interface CreateGenerationRunInput {
  characterName: string
  chatId: string
  operation: GenerationOperation
}

function getDataDir() { return process.env.LUKER_DATA_DIR ?? DEFAULT_DATA_DIR }
function getRunsDir() { return path.join(getDataDir(), 'runs') }

const runJournalStores = new Map<string, RunJournalStore>()
const runArtifactStores = new Map<string, RunArtifactStore>()
const runProjectionStores = new Map<string, RunProjectionStore>()
let runLifecycleTail: Promise<void> = Promise.resolve()
let runProjectionReadiness: {
  invalidLegacyCount: number
  missingLegacyCount: number
  recoveredAt: string
} | null = null

function getRunJournalStore(): RunJournalStore {
  const runsDir = path.resolve(getRunsDir())
  let store = runJournalStores.get(runsDir)
  if (!store) {
    store = new RunJournalStore(runsDir)
    runJournalStores.set(runsDir, store)
  }
  return store
}

function getRunArtifactStore(): RunArtifactStore {
  const runsDir = path.resolve(getRunsDir())
  let store = runArtifactStores.get(runsDir)
  if (!store) {
    store = new RunArtifactStore(runsDir)
    runArtifactStores.set(runsDir, store)
  }
  return store
}

function getRunProjectionStore(): RunProjectionStore {
  const runsDir = path.resolve(getRunsDir())
  let store = runProjectionStores.get(runsDir)
  if (!store) {
    store = new RunProjectionStore(runsDir)
    runProjectionStores.set(runsDir, store)
  }
  return store
}

function appendAndProjectRunEvent(input: RunJournalAppendInput) {
  const result = runLifecycleTail.then(async () => {
    const journal = getRunJournalStore()
    const appended = await journal.appendWithCursor(input)
    await getRunProjectionStore().applyOrRecover(journal, appended.event, appended.cursor)
    return appended.event
  })
  runLifecycleTail = result.then(() => undefined, () => undefined)
  return result
}

export function clearRunJournalStoresForTest(): void {
  if (process.env.NODE_ENV === 'test') {
    runJournalStores.clear()
    runArtifactStores.clear()
    runProjectionStores.clear()
    runLifecycleTail = Promise.resolve()
    runProjectionReadiness = null
  }
}


async function partialEventPayload(record: GenerationRunRecord, errorMessage?: string) {
  const artifact = await getRunArtifactStore().write(record.runId, 'partial', record.partialContent)
  return {
    partialBytes: artifact.bytes,
    artifact,
    ...(record.committedLineIndex !== undefined && { committedLineIndex: record.committedLineIndex }),
    ...(errorMessage !== undefined && { errorMessage }),
  }
}

async function finalEventPayload(record: GenerationRunRecord) {
  const artifact = await getRunArtifactStore().write(record.runId, 'final', record.partialContent)
  return {
    partialBytes: artifact.bytes,
    artifact,
    ...(record.committedLineIndex !== undefined && { committedLineIndex: record.committedLineIndex }),
  }
}

const runMutationTails = new Map<string, Promise<void>>()

async function withRunMutation<T>(runId: string, operation: () => Promise<T>): Promise<T> {
  const previous = runMutationTails.get(runId) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve })
  runMutationTails.set(runId, current)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (runMutationTails.get(runId) === current) runMutationTails.delete(runId)
  }
}

function getRunPath(runId: string): string {
  return safePath(getRunsDir(), `${runId}.json`)
}

function isGenerationRunRecord(value: unknown): value is GenerationRunRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<GenerationRunRecord>
  return typeof record.runId === 'string'
    && typeof record.characterName === 'string'
    && typeof record.chatId === 'string'
    && typeof record.operation === 'string'
    && typeof record.status === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string'
    && typeof record.startedAt === 'string'
    && typeof record.partialContent === 'string'
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`
  try {
    await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flush: true })
    await fs.rename(tmpPath, filePath)
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => {})
    throw error
  }
}

async function readRunFile(filePath: string): Promise<GenerationRunRecord | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return isGenerationRunRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function writeRun(record: GenerationRunRecord): Promise<GenerationRunRecord> {
  await atomicWriteJson(getRunPath(record.runId), record)
  return record
}

export async function createGenerationRun(input: CreateGenerationRunInput): Promise<GenerationRunRecord> {
  const now = new Date().toISOString()
  const record: GenerationRunRecord = {
    runId: crypto.randomUUID(),
    characterName: input.characterName,
    chatId: input.chatId,
    operation: input.operation,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    partialContent: '',
  }
  await appendAndProjectRunEvent({
    runId: record.runId,
    type: 'run.started',
    payload: {
      characterName: record.characterName,
      chatId: record.chatId,
      operation: record.operation,
    },
  })
  return writeRun(record)
}

export async function getGenerationRun(runId: string): Promise<GenerationRunRecord | null> {
  const filePath = getRunPath(runId)
  if (!existsSync(filePath)) return null
  return readRunFile(filePath)
}

export async function listGenerationRuns(): Promise<GenerationRunRecord[]> {
  const runsDir = getRunsDir()
  if (!existsSync(runsDir)) return []

  const entries = await fs.readdir(runsDir)
  const records = await Promise.all(
    entries
      .filter(entry => entry.endsWith('.json'))
      .map(entry => readRunFile(safePath(runsDir, entry))),
  )

  return records
    .filter((record): record is GenerationRunRecord => record !== null)
    .sort((a, b) => {
      const updatedOrder = Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      if (updatedOrder !== 0) return updatedOrder
      const createdOrder = Date.parse(b.createdAt) - Date.parse(a.createdAt)
      if (createdOrder !== 0) return createdOrder
      return b.runId.localeCompare(a.runId)
    })
}

type RunJournalEventFactory = (record: GenerationRunRecord) => RunJournalAppendInput | Promise<RunJournalAppendInput>

async function updateGenerationRun(
  runId: string,
  updates: Partial<Omit<GenerationRunRecord, 'runId' | 'createdAt' | 'startedAt'>>,
  journalEvent: RunJournalEventFactory,
): Promise<GenerationRunRecord | null> {
  return withRunMutation(runId, async () => {
    const existing = await getGenerationRun(runId)
    if (!existing) return null

    const next: GenerationRunRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    await appendAndProjectRunEvent(await journalEvent(next))
    return writeRun(next)
  })
}

export async function updateRunPartial(runId: string, partialContent: string): Promise<GenerationRunRecord | null> {
  return updateGenerationRun(
    runId,
    { partialContent },
    async record => ({
      runId: record.runId,
      type: 'run.partial_checkpointed',
      payload: await partialEventPayload(record),
    }),
  )
}

export async function completeRun(
  runId: string,
  input: { partialContent: string; committedLineIndex?: number },
): Promise<GenerationRunRecord | null> {
  return updateGenerationRun(runId, {
    status: 'completed',
    finishedAt: new Date().toISOString(),
    partialContent: input.partialContent,
    committedLineIndex: input.committedLineIndex,
  }, async record => ({
    runId: record.runId,
    type: 'run.provider_completed',
    payload: await finalEventPayload(record),
  }))
}

export async function failRun(
  runId: string,
  input: { error: string; partialContent?: string; committedLineIndex?: number },
): Promise<GenerationRunRecord | null> {
  return updateGenerationRun(runId, {
    status: 'failed',
    finishedAt: new Date().toISOString(),
    error: input.error,
    ...(input.partialContent !== undefined && { partialContent: input.partialContent }),
    ...(input.committedLineIndex !== undefined && { committedLineIndex: input.committedLineIndex }),
  }, async record => ({
    runId: record.runId,
    type: 'run.failed',
    payload: await partialEventPayload(record, 'Generation failed.'),
  }))
}

export async function cancelRun(
  runId: string,
  input: { partialContent?: string; error?: string } = {},
): Promise<GenerationRunRecord | null> {
  return updateGenerationRun(runId, {
    status: 'canceled',
    finishedAt: new Date().toISOString(),
    error: input.error,
    ...(input.partialContent !== undefined && { partialContent: input.partialContent }),
  }, async record => ({
    runId: record.runId,
    type: 'run.canceled',
    payload: await partialEventPayload(record, 'Generation canceled.'),
  }))
}

export async function interruptRun(
  runId: string,
  error = 'Server restarted or previous generation was abandoned before completion.',
): Promise<GenerationRunRecord | null> {
  return updateGenerationRun(runId, {
    status: 'interrupted',
    finishedAt: new Date().toISOString(),
    error,
  }, async record => ({
    runId: record.runId,
    type: 'run.interrupted',
    payload: await partialEventPayload(record, 'Generation interrupted.'),
  }))
}

async function interruptProjectedRun(
  runId: string,
  error = 'Server restarted or previous generation was abandoned before completion.',
): Promise<GenerationRunRecord | null> {
  return withRunMutation(runId, async () => {
    const projected = await getRunProjectionStore().readDetail(runId, getRunArtifactStore())
    if (!projected || projected.status !== 'running') return null
    const existing = await getGenerationRun(runId)
    const finishedAt = new Date().toISOString()
    const next: GenerationRunRecord = {
      ...(existing ?? {}),
      runId: projected.runId,
      characterName: projected.characterName,
      chatId: projected.chatId,
      operation: projected.operation,
      status: 'interrupted',
      createdAt: projected.createdAt,
      updatedAt: finishedAt,
      startedAt: projected.startedAt,
      finishedAt,
      partialContent: projected.partialContent,
      error,
      committedLineIndex: projected.committedLineIndex,
      stFinalizedAt: projected.stFinalizedAt,
    }
    await appendAndProjectRunEvent({
      runId,
      type: 'run.interrupted',
      payload: await partialEventPayload(next, 'Generation interrupted.'),
    })
    return writeRun(next)
  })
}

export async function markRunCommitted(
  runId: string,
  input: { committedLineIndex: number },
): Promise<GenerationRunRecord | null> {
  return updateGenerationRun(runId, {
    status: 'committed',
    finishedAt: new Date().toISOString(),
    committedLineIndex: input.committedLineIndex,
  }, record => ({
    runId: record.runId,
    type: 'run.committed',
    payload: { committedLineIndex: record.committedLineIndex ?? input.committedLineIndex },
  }))
}

export async function finalizeStRunOutput(
  runId: string,
  input: { partialContent: string; committedLineIndex: number },
): Promise<GenerationRunRecord | null> {
  return updateGenerationRun(runId, {
    partialContent: input.partialContent,
    committedLineIndex: input.committedLineIndex,
    stFinalizedAt: new Date().toISOString(),
  }, async record => ({
    runId: record.runId,
    type: 'run.st_output_finalized',
    payload: {
      ...await finalEventPayload(record),
      committedLineIndex: record.committedLineIndex ?? input.committedLineIndex,
    },
  }))
}

export async function discardRun(runId: string): Promise<GenerationRunRecord | null> {
  return updateGenerationRun(runId, {
    status: 'discarded',
    finishedAt: new Date().toISOString(),
  }, record => ({
    runId: record.runId,
    type: 'run.discarded',
    payload: {},
  }))
}

export function replayGenerationRunJournal(): Promise<RunJournalReplayResult> {
  return getRunJournalStore().replay()
}

export async function recoverGenerationRunProjectionCache() {
  await runLifecycleTail
  const journal = getRunJournalStore()
  const projections = getRunProjectionStore()
  const index = await projections.recover(journal)
  const legacyImport = await importLegacyRunFiles({
    runsDir: getRunsDir(),
    existingRunIds: new Set(index.runs.map(run => run.runId)),
    artifacts: getRunArtifactStore(),
    journal,
    projections,
  })
  let recoveredIndex = await projections.readIndex() ?? index
  const runningRuns = recoveredIndex.runs.filter(run => run.status === 'running')
  if (runningRuns.length > MAX_STARTUP_RUNNING_RUNS) {
    throw new Error(`Startup run recovery exceeds ${MAX_STARTUP_RUNNING_RUNS} active runs; repair required`)
  }
  const repairedMissingLegacyRunIds = new Set<string>()
  for (const run of runningRuns) {
    if (!await interruptProjectedRun(run.runId)) {
      throw new Error(`Projected run ${run.runId} changed during startup recovery; repair required`)
    }
    repairedMissingLegacyRunIds.add(run.runId)
  }
  if (runningRuns.length > 0) recoveredIndex = await projections.readIndex() ?? recoveredIndex
  const recoveredLegacyImport = {
    ...legacyImport,
    missingLegacyRunIds: legacyImport.missingLegacyRunIds.filter(runId => !repairedMissingLegacyRunIds.has(runId)),
  }

  runProjectionReadiness = {
    invalidLegacyCount: recoveredLegacyImport.invalid.length,
    missingLegacyCount: recoveredLegacyImport.missingLegacyRunIds.length,
    recoveredAt: new Date().toISOString(),
  }
  return { index: recoveredIndex, legacyImport: recoveredLegacyImport }
}

export function getRunProjectionReadiness() {
  return runProjectionReadiness
    ? {
        ready: runProjectionReadiness.invalidLegacyCount === 0 && runProjectionReadiness.missingLegacyCount === 0,
        ...runProjectionReadiness,
      }
    : { ready: false, invalidLegacyCount: 0, missingLegacyCount: 0, recoveredAt: null }
}

export function listGenerationRunProjectionSummaries(options: {
  characterName?: string
  chatId?: string
  status?: GenerationRunStatus
  limit: number
  cursor?: string
}) {
  return getRunProjectionStore().listSummaries(options)
}

export function getGenerationRunProjectionDetail(runId: string) {
  return getRunProjectionStore().readDetail(runId, getRunArtifactStore())
}

export async function auditGenerationRunJournal(): Promise<GenerationRunJournalAuditResult> {
  const replay = await replayGenerationRunJournal()
  return auditRunJournalProjection(replay, await listGenerationRuns())
}

export async function auditGenerationRunAuthority(): Promise<GenerationRunAuthorityAuditResult> {
  const replay = await replayGenerationRunJournal()
  const legacyInspection = await inspectLegacyRunFiles(
    getRunsDir(),
    new Set(replay.events.map(event => event.runId)),
  )
  return auditRunAuthority({
    replay,
    legacyRuns: legacyInspection.validRuns,
    projections: getRunProjectionStore(),
    artifacts: getRunArtifactStore(),
    invalidLegacyCount: legacyInspection.invalid.length,
    acknowledgedInvalidLegacyRunIds: legacyInspection.acknowledgedInvalidRunIds,
  })
}

export async function acknowledgeGenerationRunInvalidLegacy(runId: string) {
  await runLifecycleTail
  const replay = await replayGenerationRunJournal()
  return acknowledgeInvalidLegacyRunFile(
    getRunsDir(),
    new Set(replay.events.map(event => event.runId)),
    runId,
  )
}
export async function interruptActiveRunsForChat(
  characterName: string,
  chatId: string,
  error = 'Server restarted or previous generation was abandoned before completion.',
): Promise<GenerationRunRecord[]> {
  const runs = await listGenerationRuns()
  const active = runs.filter(run =>
    run.characterName === characterName
    && run.chatId === chatId
    && run.status === 'running'
  )

  const interrupted = await Promise.all(active.map(run =>
    interruptRun(run.runId, error)
  ))

  return interrupted.filter((run): run is GenerationRunRecord => run !== null)
}
