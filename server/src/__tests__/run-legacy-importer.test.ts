import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RunArtifactStore } from '../services/run-artifact.store.js'
import {
  acknowledgeInvalidLegacyRunFile,
  importLegacyRunFiles,
  inspectLegacyRunFiles,
} from '../services/run-legacy-importer.js'
import { RunJournalStore } from '../services/run-journal.store.js'
import { RunProjectionStore } from '../services/run-projection.store.js'

let dataDir = ''
let runsDir = ''
let artifacts: RunArtifactStore
let journal: RunJournalStore
let projections: RunProjectionStore

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crafttalker-run-legacy-import-'))
  runsDir = path.join(dataDir, 'runs')
  artifacts = new RunArtifactStore(runsDir)
  journal = new RunJournalStore(runsDir)
  projections = new RunProjectionStore(runsDir)
  await projections.recover(journal)
})

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('legacy run importer', () => {
  it('copies and imports a legacy run exactly once without rewriting unknown fields', async () => {
    const runId = crypto.randomUUID()
    const legacy = {
      runId,
      characterName: 'LegacyBot',
      chatId: 'chat-1',
      operation: 'generate',
      status: 'completed',
      createdAt: '2026-07-10T01:00:00.000Z',
      updatedAt: '2026-07-10T01:02:00.000Z',
      startedAt: '2026-07-10T01:00:01.000Z',
      finishedAt: '2026-07-10T01:01:59.000Z',
      partialContent: 'legacy final output',
      committedLineIndex: 4,
      extensionData: { plugin: { unknown: true } },
    }
    const raw = `${JSON.stringify(legacy, null, 2)}\n`
    const sourcePath = path.join(runsDir, `${runId}.json`)
    fs.mkdirSync(runsDir, { recursive: true })
    fs.writeFileSync(sourcePath, raw, 'utf8')

    const imported = await importLegacyRunFiles({
      runsDir,
      existingRunIds: new Set(),
      artifacts,
      journal,
      projections,
    })

    expect(imported).toMatchObject({ scanned: 1, imported: 1, skippedExisting: 0, invalid: [] })
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(raw)
    expect(fs.readFileSync(path.join(runsDir, 'legacy', `${runId}.json`), 'utf8')).toBe(raw)
    const replay = await journal.replay()
    expect(replay.events).toHaveLength(1)
    expect(replay.events[0]).toMatchObject({ runId, type: 'run.imported' })
    const journalRaw = fs.readFileSync(path.join(runsDir, 'journal', '00000001.jsonl'), 'utf8')
    expect(journalRaw).not.toContain('legacy final output')
    expect(journalRaw).not.toContain('extensionData')
    const projection = await projections.readProjection(runId)
    expect(projection).toMatchObject({
      runId,
      status: 'completed',
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
      committedLineIndex: 4,
    })
    expect(await artifacts.read(projection!.outputArtifact!)).toBe('legacy final output')

    const repeated = await importLegacyRunFiles({
      runsDir,
      existingRunIds: new Set((await projections.readIndex())!.runs.map(run => run.runId)),
      artifacts,
      journal,
      projections,
    })
    expect(repeated).toMatchObject({ scanned: 1, imported: 0, skippedExisting: 1, invalid: [] })
    expect((await journal.replay()).events).toHaveLength(1)
  })

  it('fails closed instead of overwriting a conflicting preserved legacy copy', async () => {
    const runId = crypto.randomUUID()
    const legacy = {
      runId,
      characterName: 'ConflictBot',
      chatId: 'chat-1',
      operation: 'generate',
      status: 'failed',
      createdAt: '2026-07-10T01:00:00.000Z',
      updatedAt: '2026-07-10T01:01:00.000Z',
      startedAt: '2026-07-10T01:00:01.000Z',
      finishedAt: '2026-07-10T01:00:59.000Z',
      partialContent: 'partial',
    }
    const raw = `${JSON.stringify(legacy)}\n`
    fs.mkdirSync(path.join(runsDir, 'legacy'), { recursive: true })
    fs.writeFileSync(path.join(runsDir, `${runId}.json`), raw, 'utf8')
    fs.writeFileSync(path.join(runsDir, 'legacy', `${runId}.json`), 'different', 'utf8')

    await expect(importLegacyRunFiles({
      runsDir,
      existingRunIds: new Set(),
      artifacts,
      journal,
      projections,
    })).rejects.toThrow('conflict')

    expect(fs.readFileSync(path.join(runsDir, `${runId}.json`), 'utf8')).toBe(raw)
    expect(fs.readFileSync(path.join(runsDir, 'legacy', `${runId}.json`), 'utf8')).toBe('different')
    expect((await journal.replay()).events).toHaveLength(0)
  })

  it('reports malformed UUID-named legacy files without deleting or journaling them', async () => {
    const runId = crypto.randomUUID()
    const sourcePath = path.join(runsDir, `${runId}.json`)
    fs.mkdirSync(runsDir, { recursive: true })
    fs.writeFileSync(sourcePath, '{invalid', 'utf8')

    const result = await importLegacyRunFiles({
      runsDir,
      existingRunIds: new Set(),
      artifacts,
      journal,
      projections,
    })

    expect(result).toMatchObject({
      scanned: 1,
      imported: 0,
      skippedExisting: 0,
      invalid: [{ fileName: `${runId}.json`, code: 'invalid-json' }],
    })
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('{invalid')
    expect((await journal.replay()).events).toHaveLength(0)
  })

  it('acknowledges an exact bounded invalid file only when its run is already journalized', async () => {
    const runId = crypto.randomUUID()
    const sourcePath = path.join(runsDir, `${runId}.json`)
    fs.mkdirSync(runsDir, { recursive: true })
    fs.writeFileSync(sourcePath, '{invalid', 'utf8')

    const acknowledgement = await acknowledgeInvalidLegacyRunFile(runsDir, new Set([runId]), runId)
    const inspection = await inspectLegacyRunFiles(runsDir, new Set([runId]))

    expect(acknowledgement).toMatchObject({ runId, fileName: `${runId}.json`, code: 'invalid-json' })
    expect(inspection.invalid).toEqual([])
    expect(inspection.acknowledgedInvalidRunIds).toEqual([runId])
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('{invalid')
    expect(fs.readFileSync(path.join(runsDir, 'legacy', 'invalid-acknowledgements.json'), 'utf8'))
      .not.toContain('{invalid')
  })

  it('rejects acknowledgement when the invalid file is the only copy of a run', async () => {
    const runId = crypto.randomUUID()
    fs.mkdirSync(runsDir, { recursive: true })
    fs.writeFileSync(path.join(runsDir, `${runId}.json`), '{invalid', 'utf8')

    await expect(acknowledgeInvalidLegacyRunFile(runsDir, new Set(), runId))
      .rejects.toThrow('not journalized')
  })

  it('reopens an acknowledgement when the invalid source bytes change', async () => {
    const runId = crypto.randomUUID()
    const sourcePath = path.join(runsDir, `${runId}.json`)
    fs.mkdirSync(runsDir, { recursive: true })
    fs.writeFileSync(sourcePath, '{invalid', 'utf8')
    await acknowledgeInvalidLegacyRunFile(runsDir, new Set([runId]), runId)

    fs.writeFileSync(sourcePath, '{different-invalid', 'utf8')
    const inspection = await inspectLegacyRunFiles(runsDir, new Set([runId]))

    expect(inspection.invalid).toHaveLength(1)
    expect(inspection.acknowledgedInvalidRunIds).toEqual([])
  })
})
