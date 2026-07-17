import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { safePath, validatePathInBase } from '../lib/path-utils.js'
import { RUN_ARTIFACT_MAX_BYTES, type RunArtifactStore } from './run-artifact.store.js'
import type { RunJournalStore } from './run-journal.store.js'
import type { RunProjectionStore } from './run-projection.store.js'

const MAX_LEGACY_RUN_FILES = 10_000
const MAX_LEGACY_RUN_FILE_BYTES = RUN_ARTIFACT_MAX_BYTES + 1024 * 1024
const MAX_ACKNOWLEDGEMENT_FILE_BYTES = 1024 * 1024
const MAX_LEGACY_INVALID_ACKNOWLEDGEMENTS = 1_000
const uuidSchema = z.string().uuid()
const legacyRunImportInvalidCodeSchema = z.enum(['file-too-large', 'invalid-json', 'invalid-record'])
const legacyRunSchema = z.object({
  runId: uuidSchema,
  characterName: z.string().min(1).max(255),
  chatId: z.string().min(1).max(255),
  operation: z.enum(['generate', 'regenerate', 'continue']),
  status: z.enum(['running', 'completed', 'failed', 'canceled', 'interrupted', 'committed', 'discarded']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  partialContent: z.string(),
  committedLineIndex: z.number().int().nonnegative().optional(),
  stFinalizedAt: z.string().datetime().optional(),
}).passthrough()

export type LegacyRunRecord = z.infer<typeof legacyRunSchema>
export type LegacyRunImportInvalidCode = z.infer<typeof legacyRunImportInvalidCodeSchema>

export interface LegacyRunImportInvalid {
  runId: string
  fileName: string
  code: LegacyRunImportInvalidCode
  bytes: number
  sha256?: string
}

export interface LegacyRunInvalidAcknowledgement {
  runId: string
  fileName: string
  code: LegacyRunImportInvalidCode
  bytes: number
  sha256: string
  acknowledgedAt: string
}

const legacyRunInvalidAcknowledgementSchema = z.object({
  runId: uuidSchema,
  fileName: z.string().regex(/^[0-9a-f-]{36}\.json$/i),
  code: legacyRunImportInvalidCodeSchema.exclude(['file-too-large']),
  bytes: z.number().int().nonnegative().max(MAX_LEGACY_RUN_FILE_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  acknowledgedAt: z.string().datetime(),
})
const legacyRunInvalidAcknowledgementManifestSchema = z.object({
  version: z.literal(1),
  entries: z.array(legacyRunInvalidAcknowledgementSchema).max(MAX_LEGACY_INVALID_ACKNOWLEDGEMENTS),
})

export interface LegacyRunImportResult {
  scanned: number
  imported: number
  skippedExisting: number
  invalid: LegacyRunImportInvalid[]
  missingLegacyRunIds: string[]
}

export interface LegacyRunInspectionResult extends Omit<LegacyRunImportResult, 'imported'> {
  validRuns: LegacyRunRecord[]
  acknowledgedInvalidRunIds: string[]
}

export interface LegacyRunImportOptions {
  runsDir: string
  existingRunIds: Set<string>
  artifacts: RunArtifactStore
  journal: RunJournalStore
  projections: RunProjectionStore
}

interface PendingLegacyRun {
  fileName: string
  raw: Buffer
  record: LegacyRunRecord
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

export async function inspectLegacyRunFiles(
  runsDirInput: string,
  existingRunIds: Set<string>,
): Promise<LegacyRunInspectionResult> {
  const runsDir = path.resolve(runsDirInput)
  const scan = await scanLegacyRunFiles(runsDir, existingRunIds, false)
  const acknowledgements = await readLegacyRunInvalidAcknowledgements(runsDir)
  const acknowledgedInvalidRunIds: string[] = []
  const invalid = scan.invalid.filter((item) => {
    const acknowledged = acknowledgements.get(item.runId)
    const matches = acknowledged !== undefined
      && item.fileName === acknowledged.fileName
      && item.code === acknowledged.code
      && item.bytes === acknowledged.bytes
      && item.sha256 === acknowledged.sha256
    if (matches) acknowledgedInvalidRunIds.push(item.runId)
    return !matches
  })
  return {
    scanned: scan.scanned,
    skippedExisting: scan.skippedExisting,
    invalid,
    missingLegacyRunIds: scan.missingLegacyRunIds,
    validRuns: scan.pending.map(item => item.record),
    acknowledgedInvalidRunIds: acknowledgedInvalidRunIds.sort(),
  }
}

export async function acknowledgeInvalidLegacyRunFile(
  runsDirInput: string,
  existingRunIds: Set<string>,
  runIdInput: string,
): Promise<LegacyRunInvalidAcknowledgement> {
  const runsDir = path.resolve(runsDirInput)
  const runId = uuidSchema.parse(runIdInput)
  if (!existingRunIds.has(runId)) {
    throw new Error(`Invalid legacy run ${runId} is not journalized; repair the source instead of acknowledging data loss`)
  }

  const scan = await scanLegacyRunFiles(runsDir, existingRunIds, false)
  const invalid = scan.invalid.find(item => item.runId === runId)
  if (!invalid) throw new Error(`Invalid legacy run ${runId} was not found`)
  if (invalid.code === 'file-too-large' || !invalid.sha256) {
    throw new Error(`Invalid legacy run ${runId} is too large to acknowledge safely`)
  }

  const acknowledgements = await readLegacyRunInvalidAcknowledgements(runsDir)
  const existing = acknowledgements.get(runId)
  if (existing
    && existing.fileName === invalid.fileName
    && existing.code === invalid.code
    && existing.bytes === invalid.bytes
    && existing.sha256 === invalid.sha256) {
    return existing
  }

  const acknowledgement = legacyRunInvalidAcknowledgementSchema.parse({
    runId,
    fileName: invalid.fileName,
    code: invalid.code,
    bytes: invalid.bytes,
    sha256: invalid.sha256,
    acknowledgedAt: new Date().toISOString(),
  })
  acknowledgements.set(runId, acknowledgement)
  await writeLegacyRunInvalidAcknowledgements(runsDir, [...acknowledgements.values()])
  return acknowledgement
}

export async function importLegacyRunFiles(options: LegacyRunImportOptions): Promise<LegacyRunImportResult> {
  const runsDir = path.resolve(options.runsDir)
  const scan = await scanLegacyRunFiles(runsDir, options.existingRunIds, true)
  let imported = 0
  for (const item of scan.pending) {
    await preserveLegacyCopy(runsDir, item.fileName, item.raw)
    const common = {
      characterName: item.record.characterName,
      chatId: item.record.chatId,
      operation: item.record.operation,
      status: item.record.status,
      createdAt: item.record.createdAt,
      updatedAt: item.record.updatedAt,
      startedAt: item.record.startedAt,
      finishedAt: item.record.finishedAt,
      committedLineIndex: item.record.committedLineIndex,
      stFinalizedAt: item.record.stFinalizedAt,
    }
    const appended = item.record.status === 'completed' || item.record.status === 'committed'
      ? await options.journal.appendWithCursor({
          runId: item.record.runId,
          type: 'run.imported',
          payload: {
            ...common,
            status: item.record.status,
            artifact: await options.artifacts.write(item.record.runId, 'final', item.record.partialContent),
            partialBytes: Buffer.byteLength(item.record.partialContent, 'utf8'),
          },
        })
      : await options.journal.appendWithCursor({
          runId: item.record.runId,
          type: 'run.imported',
          payload: {
            ...common,
            status: item.record.status,
            artifact: await options.artifacts.write(item.record.runId, 'partial', item.record.partialContent),
            partialBytes: Buffer.byteLength(item.record.partialContent, 'utf8'),
          },
        })
    await options.projections.applyOrRecover(options.journal, appended.event, appended.cursor)
    options.existingRunIds.add(item.record.runId)
    imported += 1
  }

  return {
    scanned: scan.scanned,
    imported,
    skippedExisting: scan.skippedExisting,
    invalid: scan.invalid,
    missingLegacyRunIds: scan.missingLegacyRunIds,
  }
}

async function scanLegacyRunFiles(
  runsDir: string,
  existingRunIds: Set<string>,
  skipExistingBodies: boolean,
): Promise<{
  scanned: number
  skippedExisting: number
  invalid: LegacyRunImportInvalid[]
  missingLegacyRunIds: string[]
  pending: PendingLegacyRun[]
}> {
  let entries: Array<{ name: string; isFile(): boolean }>
  try {
    entries = await fs.readdir(runsDir, { withFileTypes: true })
  } catch (error) {
    if (isMissing(error)) return {
      scanned: 0,
      skippedExisting: 0,
      invalid: [],
      missingLegacyRunIds: [...existingRunIds].sort(),
      pending: [],
    }
    throw error
  }

  const candidates = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => ({ fileName: entry.name, runId: entry.name.slice(0, -5) }))
    .filter(candidate => uuidSchema.safeParse(candidate.runId).success)
    .sort((left, right) => left.fileName.localeCompare(right.fileName))
  if (candidates.length > MAX_LEGACY_RUN_FILES) {
    throw new Error(`Legacy run inspection exceeds ${MAX_LEGACY_RUN_FILES} files; repair required`)
  }

  const candidateRunIds = new Set(candidates.map(candidate => candidate.runId))
  const missingLegacyRunIds = [...existingRunIds]
    .filter(runId => !candidateRunIds.has(runId))
    .sort()
  const invalid: LegacyRunImportResult['invalid'] = []
  const pending: PendingLegacyRun[] = []
  let skippedExisting = 0
  for (const candidate of candidates) {
    if (skipExistingBodies && existingRunIds.has(candidate.runId)) {
      skippedExisting += 1
      continue
    }

    const sourcePath = safePath(runsDir, candidate.fileName)
    const stat = await fs.stat(sourcePath)
    if (stat.size > MAX_LEGACY_RUN_FILE_BYTES) {
      invalid.push({ runId: candidate.runId, fileName: candidate.fileName, code: 'file-too-large', bytes: stat.size })
      continue
    }
    const raw = await fs.readFile(sourcePath)
    if (raw.length > MAX_LEGACY_RUN_FILE_BYTES) {
      invalid.push({ runId: candidate.runId, fileName: candidate.fileName, code: 'file-too-large', bytes: raw.length })
      continue
    }
    const fingerprint = { bytes: raw.length, sha256: crypto.createHash('sha256').update(raw).digest('hex') }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw.toString('utf8'))
    } catch {
      invalid.push({ runId: candidate.runId, fileName: candidate.fileName, code: 'invalid-json', ...fingerprint })
      continue
    }
    const validated = legacyRunSchema.safeParse(parsed)
    if (!validated.success || validated.data.runId !== candidate.runId) {
      invalid.push({ runId: candidate.runId, fileName: candidate.fileName, code: 'invalid-record', ...fingerprint })
      continue
    }
    if (Buffer.byteLength(validated.data.partialContent, 'utf8') > RUN_ARTIFACT_MAX_BYTES) {
      invalid.push({ runId: candidate.runId, fileName: candidate.fileName, code: 'file-too-large', ...fingerprint })
      continue
    }
    pending.push({ fileName: candidate.fileName, raw, record: validated.data })
  }

  pending.sort((left, right) => {
    const updated = Date.parse(left.record.updatedAt) - Date.parse(right.record.updatedAt)
    return updated || left.record.runId.localeCompare(right.record.runId)
  })
  return { scanned: candidates.length, skippedExisting, invalid, missingLegacyRunIds, pending }
}

async function readLegacyRunInvalidAcknowledgements(
  runsDir: string,
): Promise<Map<string, LegacyRunInvalidAcknowledgement>> {
  const legacyDir = safePath(runsDir, 'legacy')
  try {
    const legacyStat = await fs.lstat(legacyDir)
    if (legacyStat.isSymbolicLink() || !legacyStat.isDirectory()) {
      throw new Error('Legacy run archive directory must be a regular directory')
    }
  } catch (error) {
    if (isMissing(error)) return new Map()
    throw error
  }
  const manifestPath = safePath(legacyDir, 'invalid-acknowledgements.json')
  let stat
  try {
    stat = await fs.lstat(manifestPath)
  } catch (error) {
    if (isMissing(error)) return new Map()
    throw error
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error('Legacy invalid acknowledgement manifest must be a regular file')
  }
  if (stat.size > MAX_ACKNOWLEDGEMENT_FILE_BYTES) {
    throw new Error('Legacy invalid acknowledgement manifest is too large')
  }
  const raw = await fs.readFile(manifestPath, 'utf8')
  const manifest = legacyRunInvalidAcknowledgementManifestSchema.parse(JSON.parse(raw))
  const entries = new Map<string, LegacyRunInvalidAcknowledgement>()
  for (const entry of manifest.entries) {
    if (entries.has(entry.runId)) throw new Error(`Duplicate legacy invalid acknowledgement for ${entry.runId}`)
    entries.set(entry.runId, entry)
  }
  return entries
}

async function writeLegacyRunInvalidAcknowledgements(
  runsDir: string,
  entries: LegacyRunInvalidAcknowledgement[],
): Promise<void> {
  const legacyDir = await ensureLegacyDir(runsDir)
  const manifestPath = safePath(legacyDir, 'invalid-acknowledgements.json')
  try {
    const targetStat = await fs.lstat(manifestPath)
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
      throw new Error('Legacy invalid acknowledgement manifest must be a regular file')
    }
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  const manifest = legacyRunInvalidAcknowledgementManifestSchema.parse({
    version: 1,
    entries: [...entries].sort((left, right) => left.runId.localeCompare(right.runId)),
  })
  const body = `${JSON.stringify(manifest, null, 2)}\n`
  if (Buffer.byteLength(body, 'utf8') > MAX_ACKNOWLEDGEMENT_FILE_BYTES) {
    throw new Error('Legacy invalid acknowledgement manifest is too large')
  }
  const tempPath = validatePathInBase(
    path.join(legacyDir, `.invalid-acknowledgements.${crypto.randomUUID()}.tmp`),
    legacyDir,
  )
  try {
    await fs.writeFile(tempPath, body, { encoding: 'utf8', flush: true })
    await fs.rename(tempPath, manifestPath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }
}

async function ensureLegacyDir(runsDir: string): Promise<string> {
  const legacyDir = safePath(runsDir, 'legacy')
  await fs.mkdir(legacyDir, { recursive: true })
  if ((await fs.lstat(legacyDir)).isSymbolicLink()) {
    throw new Error('Legacy run archive directory must not be a symbolic link')
  }
  return legacyDir
}

async function preserveLegacyCopy(runsDir: string, fileName: string, raw: Buffer): Promise<void> {
  const legacyDir = await ensureLegacyDir(runsDir)

  const targetPath = safePath(legacyDir, fileName)
  try {
    const targetStat = await fs.lstat(targetPath)
    if (targetStat.isSymbolicLink()) throw new Error('Legacy run archive file must not be a symbolic link')
    if (!(await fs.readFile(targetPath)).equals(raw)) throw new Error(`Legacy run archive conflict for ${fileName}`)
    return
  } catch (error) {
    if (!isMissing(error)) throw error
  }

  const tempPath = validatePathInBase(path.join(legacyDir, `.${fileName}.${crypto.randomUUID()}.tmp`), legacyDir)
  try {
    await fs.writeFile(tempPath, raw, { flush: true })
    await fs.rename(tempPath, targetPath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }
}
