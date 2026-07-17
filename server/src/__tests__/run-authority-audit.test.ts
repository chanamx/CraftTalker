import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  acknowledgeGenerationRunInvalidLegacy,
  auditGenerationRunAuthority,
  clearRunJournalStoresForTest,
  createGenerationRun,
  failRun,
  recoverGenerationRunProjectionCache,
} from '../services/run.service.js'

let dataDir = ''
let runsDir = ''

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crafttalker-run-authority-audit-'))
  runsDir = path.join(dataDir, 'runs')
  process.env.LUKER_DATA_DIR = dataDir
})

afterEach(() => {
  clearRunJournalStoresForTest()
  delete process.env.LUKER_DATA_DIR
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('run authority audit', () => {
  it('verifies a synchronized journal, cache, artifact, and legacy root run', async () => {
    const run = await createGenerationRun({ characterName: 'AuditBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'provider detail', partialContent: 'audited partial' })
    await recoverGenerationRunProjectionCache()

    const audit = await auditGenerationRunAuthority()

    expect(audit).toMatchObject({
      ok: true,
      journalSeq: 2,
      indexSeq: 2,
      checkpointSeq: 2,
      journalRuns: 1,
      indexRuns: 1,
      legacyRuns: 1,
      issues: [],
      truncated: false,
    })
  })

  it('reports a torn journal tail as an explicit authority blocker', async () => {
    const run = await createGenerationRun({ characterName: 'TornTailBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'failed', partialContent: 'safe prefix' })
    await recoverGenerationRunProjectionCache()
    fs.appendFileSync(path.join(runsDir, 'journal', '00000001.jsonl'), '{version:1', 'utf8')

    const audit = await auditGenerationRunAuthority()

    expect(audit.ok).toBe(false)
    expect(audit.tornTail).toBe(true)
    expect(audit.issues).toContainEqual({ code: 'journal-torn-tail' })
  })

  it('reports duplicate journal event IDs as an explicit authority blocker', async () => {
    const run = await createGenerationRun({ characterName: 'DuplicateEventBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'failed', partialContent: 'duplicate event' })
    await recoverGenerationRunProjectionCache()
    const journalPath = path.join(runsDir, 'journal', '00000001.jsonl')
    const events = fs.readFileSync(journalPath, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line))
    events[1].eventId = events[0].eventId
    fs.writeFileSync(journalPath, `${events.map(event => JSON.stringify(event)).join('\n')}\n`, 'utf8')

    const audit = await auditGenerationRunAuthority()

    expect(audit.ok).toBe(false)
    expect(audit.duplicateEventIds).toBe(1)
    expect(audit.issues).toContainEqual({ code: 'journal-duplicate-event-id', count: 1 })
  })

  it('reports artifact corruption without exposing artifact content or paths', async () => {
    const run = await createGenerationRun({ characterName: 'ArtifactAuditBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'provider detail', partialContent: 'corrupt me' })
    await recoverGenerationRunProjectionCache()
    const projection = JSON.parse(fs.readFileSync(path.join(runsDir, 'projections', `${run.runId}.json`), 'utf8'))
    fs.writeFileSync(path.join(runsDir, ...String(projection.outputArtifact.relativePath).split('/')), 'tampered', 'utf8')

    const audit = await auditGenerationRunAuthority()

    expect(audit.ok).toBe(false)
    expect(audit.issues).toContainEqual({ code: 'artifact-integrity', runId: run.runId })
    expect(JSON.stringify(audit)).not.toContain('tampered')
    expect(JSON.stringify(audit)).not.toContain('relativePath')
  })

  it('reports a missing artifact reference without exposing artifact metadata', async () => {
    const run = await createGenerationRun({ characterName: 'MissingRefBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'provider detail', partialContent: 'has output' })
    await recoverGenerationRunProjectionCache()
    const projectionPath = path.join(runsDir, 'projections', `${run.runId}.json`)
    const projection = JSON.parse(fs.readFileSync(projectionPath, 'utf8'))
    delete projection.outputArtifact
    fs.writeFileSync(projectionPath, `${JSON.stringify(projection, null, 2)}\n`, 'utf8')

    const audit = await auditGenerationRunAuthority()

    expect(audit.ok).toBe(false)
    expect(audit.issues).toContainEqual({ code: 'artifact-missing-ref', runId: run.runId })
    expect(JSON.stringify(audit)).not.toContain('relativePath')
  })

  it('reports legacy drift and missing legacy roots separately', async () => {
    const drifted = await createGenerationRun({ characterName: 'DriftBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(drifted.runId, { error: 'failed', partialContent: 'drifted' })
    const missing = await createGenerationRun({ characterName: 'MissingBot', chatId: 'chat-2', operation: 'continue' })
    await failRun(missing.runId, { error: 'failed', partialContent: 'missing' })
    await recoverGenerationRunProjectionCache()
    const driftPath = path.join(runsDir, `${drifted.runId}.json`)
    const driftRecord = JSON.parse(fs.readFileSync(driftPath, 'utf8'))
    fs.writeFileSync(driftPath, `${JSON.stringify({ ...driftRecord, status: 'completed' }, null, 2)}\n`, 'utf8')
    fs.rmSync(path.join(runsDir, `${missing.runId}.json`))

    const audit = await auditGenerationRunAuthority()

    expect(audit.ok).toBe(false)
    expect(audit.issues).toContainEqual({ code: 'legacy-drift', runId: drifted.runId, field: 'status' })
    expect(audit.issues).toContainEqual({ code: 'legacy-missing', runId: missing.runId })
  })

  it('accepts an exact acknowledged invalid legacy root only when journal authority has the run', async () => {
    const run = await createGenerationRun({ characterName: 'AcknowledgedBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'failed', partialContent: 'journal copy' })
    await recoverGenerationRunProjectionCache()
    const sourcePath = path.join(runsDir, `${run.runId}.json`)
    fs.writeFileSync(sourcePath, '{invalid', 'utf8')

    await acknowledgeGenerationRunInvalidLegacy(run.runId)
    const audit = await auditGenerationRunAuthority()

    expect(audit.ok).toBe(true)
    expect(audit.invalidLegacyCount).toBe(0)
    expect(audit.acknowledgedInvalidLegacyRunIds).toEqual([run.runId])
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('{invalid')
  })

  it('reports a valid legacy-only root without importing it during audit', async () => {
    const run = await createGenerationRun({ characterName: 'LegacyOnlyBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'failed', partialContent: 'legacy source' })
    await recoverGenerationRunProjectionCache()
    const legacyOnlyRunId = crypto.randomUUID()
    const source = JSON.parse(fs.readFileSync(path.join(runsDir, `${run.runId}.json`), 'utf8'))
    fs.writeFileSync(
      path.join(runsDir, `${legacyOnlyRunId}.json`),
      `${JSON.stringify({ ...source, runId: legacyOnlyRunId }, null, 2)}\n`,
      'utf8',
    )

    const audit = await auditGenerationRunAuthority()

    expect(audit.ok).toBe(false)
    expect(audit.issues).toContainEqual({ code: 'legacy-only', runId: legacyOnlyRunId })
    expect(audit.legacyOnlyRunIds).toContain(legacyOnlyRunId)
  })

  it('detects invalid legacy files introduced after startup readiness', async () => {
    await recoverGenerationRunProjectionCache()
    fs.writeFileSync(path.join(runsDir, `${crypto.randomUUID()}.json`), '{invalid', 'utf8')

    const audit = await auditGenerationRunAuthority()

    expect(audit.ok).toBe(false)
    expect(audit.issues).toContainEqual({ code: 'invalid-legacy', count: 1 })
  })

  it('reports projection and checkpoint drift with safe field-only issues', async () => {
    const run = await createGenerationRun({ characterName: 'CacheDriftBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'failed', partialContent: 'cache drift' })
    await recoverGenerationRunProjectionCache()
    fs.rmSync(path.join(runsDir, 'projections', `${run.runId}.json`))
    const checkpointPath = path.join(runsDir, 'journal', 'checkpoint.json')
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
    fs.writeFileSync(checkpointPath, `${JSON.stringify({ ...checkpoint, journalSeq: 1 }, null, 2)}\n`, 'utf8')

    const audit = await auditGenerationRunAuthority()

    expect(audit.ok).toBe(false)
    expect(audit.issues).toContainEqual({ code: 'cache-drift', field: 'checkpoint.journalSeq' })
    expect(audit.issues).toContainEqual({ code: 'cache-drift', runId: run.runId, field: 'projection' })
  })

  it('includes unresolved invalid legacy files as an authority blocker', async () => {
    fs.mkdirSync(runsDir, { recursive: true })
    fs.writeFileSync(path.join(runsDir, `${crypto.randomUUID()}.json`), '{invalid', 'utf8')
    await recoverGenerationRunProjectionCache()

    const audit = await auditGenerationRunAuthority()

    expect(audit.ok).toBe(false)
    expect(audit.issues).toContainEqual({ code: 'invalid-legacy', count: 1 })
  })
})
