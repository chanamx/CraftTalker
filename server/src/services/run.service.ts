import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { safePath } from '../lib/path-utils.js'
import type { GenerationOperation } from '../lib/generation-locks.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')

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
}

export interface CreateGenerationRunInput {
  characterName: string
  chatId: string
  operation: GenerationOperation
}

function getDataDir() { return process.env.LUKER_DATA_DIR ?? DEFAULT_DATA_DIR }
function getRunsDir() { return path.join(getDataDir(), 'runs') }

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
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.rename(tmpPath, filePath)
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
  return writeRun({
    runId: crypto.randomUUID(),
    characterName: input.characterName,
    chatId: input.chatId,
    operation: input.operation,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    partialContent: '',
  })
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
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

async function updateGenerationRun(
  runId: string,
  updates: Partial<Omit<GenerationRunRecord, 'runId' | 'createdAt' | 'startedAt'>>,
): Promise<GenerationRunRecord | null> {
  const existing = await getGenerationRun(runId)
  if (!existing) return null

  const next: GenerationRunRecord = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  return writeRun(next)
}

export async function updateRunPartial(runId: string, partialContent: string): Promise<GenerationRunRecord | null> {
  return updateGenerationRun(runId, { partialContent })
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
  })
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
  })
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
  })
}

export async function interruptRun(
  runId: string,
  error = 'Server restarted or previous generation was abandoned before completion.',
): Promise<GenerationRunRecord | null> {
  return updateGenerationRun(runId, {
    status: 'interrupted',
    finishedAt: new Date().toISOString(),
    error,
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
  })
}

export async function discardRun(runId: string): Promise<GenerationRunRecord | null> {
  return updateGenerationRun(runId, {
    status: 'discarded',
    finishedAt: new Date().toISOString(),
  })
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
