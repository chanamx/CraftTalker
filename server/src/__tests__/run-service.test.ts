import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { RunArtifactStore } from '../services/run-artifact.store.js'
import { materializeRunJournalProjection, projectRunJournalEvents } from '../services/run-journal-projector.js'
import {
  auditGenerationRunAuthority,
  auditGenerationRunJournal,
  cancelRun,
  clearRunJournalStoresForTest,
  completeRun,
  createGenerationRun,
  discardRun,
  failRun,
  getGenerationRun,
  getGenerationRunProjectionDetail,
  getRunProjectionReadiness,
  interruptActiveRunsForChat,
  interruptRun,
  listGenerationRuns,
  markRunCommitted,
  finalizeStRunOutput,
  replayGenerationRunJournal,
  recoverGenerationRunProjectionCache,
  updateRunPartial,
} from '../services/run.service.js'

const testDataDir = path.join(os.tmpdir(), `luker-run-service-${Date.now()}`)

beforeEach(() => {
  process.env.LUKER_DATA_DIR = testDataDir
  fs.mkdirSync(testDataDir, { recursive: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  clearRunJournalStoresForTest()
  delete process.env.LUKER_DATA_DIR
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

describe('generation run service', () => {
  it('persists run state outside ST chat JSONL files', async () => {
    const run = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'chat-1',
      operation: 'generate',
    })

    expect(run.status).toBe('running')
    expect(run.partialContent).toBe('')

    const runPath = path.join(testDataDir, 'runs', `${run.runId}.json`)
    expect(fs.existsSync(runPath)).toBe(true)
    expect(fs.existsSync(path.join(testDataDir, 'chats'))).toBe(false)

    await updateRunPartial(run.runId, 'hello')
    const updated = await getGenerationRun(run.runId)
    expect(updated?.partialContent).toBe('hello')

    await completeRun(run.runId, { partialContent: 'hello world', committedLineIndex: 2 })
    const completed = await getGenerationRun(run.runId)
    expect(completed?.status).toBe('completed')
    expect(completed?.partialContent).toBe('hello world')
    expect(completed?.committedLineIndex).toBe(2)
  })

  it('keeps the projection index and checkpoint current with legacy run writes', async () => {
    const run = await createGenerationRun({
      characterName: 'ProjectionBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    await updateRunPartial(run.runId, 'partial')
    await completeRun(run.runId, { partialContent: 'complete', committedLineIndex: 2 })

    const runsDir = path.join(testDataDir, 'runs')
    const index = JSON.parse(fs.readFileSync(path.join(runsDir, 'index.json'), 'utf8'))
    const checkpoint = JSON.parse(fs.readFileSync(path.join(runsDir, 'journal', 'checkpoint.json'), 'utf8'))
    const projection = JSON.parse(fs.readFileSync(path.join(runsDir, 'projections', `${run.runId}.json`), 'utf8'))
    expect(index.lastJournalSeq).toBe(3)
    expect(checkpoint.journalSeq).toBe(3)
    expect(projection).toMatchObject({ status: 'completed', committedLineIndex: 2 })
    expect((await getGenerationRun(run.runId))?.partialContent).toBe('complete')
  })

  it('synchronously rebuilds projection caches when incremental apply cannot continue', async () => {
    const run = await createGenerationRun({
      characterName: 'RepairBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    const runsDir = path.join(testDataDir, 'runs')
    fs.rmSync(path.join(runsDir, 'index.json'))

    await updateRunPartial(run.runId, 'repaired')

    const index = JSON.parse(fs.readFileSync(path.join(runsDir, 'index.json'), 'utf8'))
    const checkpoint = JSON.parse(fs.readFileSync(path.join(runsDir, 'journal', 'checkpoint.json'), 'utf8'))
    const projection = JSON.parse(fs.readFileSync(path.join(runsDir, 'projections', `${run.runId}.json`), 'utf8'))
    expect(index.lastJournalSeq).toBe(2)
    expect(checkpoint.journalSeq).toBe(2)
    expect(projection.partialBytes).toBe(Buffer.byteLength('repaired', 'utf8'))
  })

  it('rebuilds projection caches before readiness without parsing already journalized root files', async () => {
    const run = await createGenerationRun({
      characterName: 'StartupRecoveryBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    await completeRun(run.runId, { partialContent: 'recovered', committedLineIndex: 1 })
    const runsDir = path.join(testDataDir, 'runs')
    fs.rmSync(path.join(runsDir, 'projections'), { recursive: true, force: true })
    fs.rmSync(path.join(runsDir, 'index.json'), { force: true })
    fs.rmSync(path.join(runsDir, 'journal', 'checkpoint.json'), { force: true })
    clearRunJournalStoresForTest()
    const readSpy = vi.spyOn(fsPromises, 'readFile')

    await recoverGenerationRunProjectionCache()

    expect(JSON.parse(fs.readFileSync(path.join(runsDir, 'index.json'), 'utf8')).lastJournalSeq).toBe(2)
    expect(JSON.parse(fs.readFileSync(
      path.join(runsDir, 'projections', `${run.runId}.json`),
      'utf8',
    ))).toMatchObject({ status: 'completed', committedLineIndex: 1 })
    const legacyRootPath = path.resolve(path.join(runsDir, `${run.runId}.json`))
    expect(readSpy.mock.calls.some(call => path.resolve(String(call[0])) === legacyRootPath)).toBe(false)
  })

  it('reconciles journal-projected running runs to interrupted before readiness', async () => {
    const run = await createGenerationRun({
      characterName: 'StartupInterruptedBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    await updateRunPartial(run.runId, 'unfinished output')
    clearRunJournalStoresForTest()

    await recoverGenerationRunProjectionCache()

    expect((await getGenerationRun(run.runId))?.status).toBe('interrupted')
    const index = JSON.parse(fs.readFileSync(path.join(testDataDir, 'runs', 'index.json'), 'utf8'))
    expect(index.runs.find((item: { runId: string }) => item.runId === run.runId)).toMatchObject({
      status: 'interrupted',
      hasPartialContent: true,
    })
    expect((await replayGenerationRunJournal()).events.at(-1)).toMatchObject({
      runId: run.runId,
      type: 'run.interrupted',
    })
  })

  it('imports legacy root run JSON during startup recovery without changing the source file', async () => {
    const runId = crypto.randomUUID()
    const legacy = {
      runId,
      characterName: 'StartupLegacyBot',
      chatId: 'legacy-chat',
      operation: 'continue',
      status: 'failed',
      createdAt: '2026-07-09T01:00:00.000Z',
      updatedAt: '2026-07-09T01:01:00.000Z',
      startedAt: '2026-07-09T01:00:01.000Z',
      finishedAt: '2026-07-09T01:00:59.000Z',
      partialContent: 'recoverable legacy partial',
      error: 'provider detail remains only in legacy source',
      unknownField: { preserved: true },
    }
    const runsDir = path.join(testDataDir, 'runs')
    const sourcePath = path.join(runsDir, `${runId}.json`)
    const raw = `${JSON.stringify(legacy, null, 2)}\n`
    fs.mkdirSync(runsDir, { recursive: true })
    fs.writeFileSync(sourcePath, raw, 'utf8')

    await recoverGenerationRunProjectionCache()

    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(raw)
    expect(fs.readFileSync(path.join(runsDir, 'legacy', `${runId}.json`), 'utf8')).toBe(raw)
    expect((await replayGenerationRunJournal()).events).toContainEqual(expect.objectContaining({
      runId,
      type: 'run.imported',
    }))
    expect(JSON.parse(fs.readFileSync(
      path.join(runsDir, 'projections', `${runId}.json`),
      'utf8',
    ))).toMatchObject({ status: 'failed', partialBytes: Buffer.byteLength(legacy.partialContent, 'utf8') })
  })

  it('does not persist request secrets in run records', async () => {
    const run = await createGenerationRun({
      characterName: 'SecretBot',
      chatId: 'chat-1',
      operation: 'continue',
    })

    await updateRunPartial(run.runId, 'partial')

    const raw = fs.readFileSync(path.join(testDataDir, 'runs', `${run.runId}.json`), 'utf8')
    expect(raw).not.toContain('apiKey')
    expect(raw).not.toContain('sk-')
    expect(raw).not.toContain('prompt')
    expect(raw).not.toContain('messages')
  })

  it('marks abandoned running runs as interrupted for a chat', async () => {
    const target = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    const other = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'chat-2',
      operation: 'generate',
    })

    const interrupted = await interruptActiveRunsForChat('RunBot', 'chat-1', 'stale')

    expect(interrupted).toHaveLength(1)
    expect(interrupted[0]?.runId).toBe(target.runId)
    expect(interrupted[0]?.status).toBe('interrupted')
    expect(interrupted[0]?.error).toBe('stale')

    const untouched = await getGenerationRun(other.runId)
    expect(untouched?.status).toBe('running')
  })

  it('lists runs by most recent update first', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const first = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'first',
      operation: 'generate',
    })
    vi.setSystemTime(new Date('2026-01-01T00:00:00.001Z'))
    const second = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'second',
      operation: 'generate',
    })

    vi.setSystemTime(new Date('2026-01-01T00:00:00.002Z'))
    await updateRunPartial(first.runId, 'later')
    const runs = await listGenerationRuns()

    expect(runs[0]?.runId).toBe(first.runId)
    expect(runs.some(run => run.runId === second.runId)).toBe(true)
  })

  it('keeps list ordering deterministic when timestamps tie', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const first = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'first',
      operation: 'generate',
    })
    const second = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'second',
      operation: 'generate',
    })

    const runs = await listGenerationRuns()

    expect(runs.map(run => run.runId)).toEqual(
      [first.runId, second.runId].sort((a, b) => b.localeCompare(a)),
    )
  })

  it.each([
    {
      name: 'completion',
      status: 'completed',
      mutate: (runId: string) => completeRun(runId, { partialContent: 'final' }),
    },
    {
      name: 'failure',
      status: 'failed',
      mutate: (runId: string) => failRun(runId, { error: 'provider failed', partialContent: 'final' }),
    },
    {
      name: 'stale-run interruption',
      status: 'interrupted',
      mutate: (runId: string) => interruptRun(runId, 'stale'),
    },
  ])('does not let a late partial update overwrite $name', async ({ status, mutate }) => {
    const run = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    const runPath = path.join(testDataDir, 'runs', `${run.runId}.json`)
    const initial = await fsPromises.readFile(runPath, 'utf8')
    const realReadFile = fsPromises.readFile.bind(fsPromises)
    const realRename = fsPromises.rename.bind(fsPromises)
    let terminalRenameFinished = false
    let releaseTerminalRename!: () => void
    const terminalRenamed = new Promise<void>(resolve => { releaseTerminalRename = resolve })

    vi.spyOn(fsPromises, 'readFile').mockImplementation(async (...args) => {
      if (String(args[0]) === runPath && !terminalRenameFinished) return initial
      return realReadFile(...args)
    })
    vi.spyOn(fsPromises, 'rename').mockImplementation(async (oldPath, newPath) => {
      if (String(newPath) !== runPath) return realRename(oldPath, newPath)

      const pending = JSON.parse(await realReadFile(oldPath, 'utf8')) as {
        status: string
        partialContent: string
      }
      if (pending.status === 'running' && pending.partialContent === 'late partial') {
        await terminalRenamed
      }

      const result = await realRename(oldPath, newPath)
      if (pending.status === status) {
        terminalRenameFinished = true
        releaseTerminalRename()
      }
      return result
    })

    await Promise.all([
      mutate(run.runId),
      updateRunPartial(run.runId, 'late partial'),
    ])

    const persisted = await getGenerationRun(run.runId)
    expect(persisted?.status).toBe(status)
    expect(persisted?.partialContent).toBe('late partial')
  })

  it('does not serialize mutations for independent run ids', async () => {
    const blocked = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    const independent = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'chat-2',
      operation: 'generate',
    })
    const blockedPath = path.join(testDataDir, 'runs', `${blocked.runId}.json`)
    const realRename = fsPromises.rename.bind(fsPromises)
    let signalBlockedRename!: () => void
    let releaseBlockedRename!: () => void
    const blockedRenameStarted = new Promise<void>(resolve => { signalBlockedRename = resolve })
    const blockedRenameReleased = new Promise<void>(resolve => { releaseBlockedRename = resolve })

    vi.spyOn(fsPromises, 'rename').mockImplementation(async (oldPath, newPath) => {
      if (String(newPath) === blockedPath) {
        signalBlockedRename()
        await blockedRenameReleased
      }
      return realRename(oldPath, newPath)
    })

    const blockedUpdate = updateRunPartial(blocked.runId, 'blocked')
    await blockedRenameStarted
    try {
      await updateRunPartial(independent.runId, 'independent')
      expect((await getGenerationRun(independent.runId))?.partialContent).toBe('independent')
    } finally {
      releaseBlockedRename()
      await blockedUpdate
    }
  })

  it('releases a run mutation queue after a write rejects', async () => {
    const run = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    const runPath = path.join(testDataDir, 'runs', `${run.runId}.json`)
    const realRename = fsPromises.rename.bind(fsPromises)
    let rejectNextRename = true

    vi.spyOn(fsPromises, 'rename').mockImplementation(async (oldPath, newPath) => {
      if (String(newPath) === runPath && rejectNextRename) {
        rejectNextRename = false
        throw new Error('simulated rename failure')
      }
      return realRename(oldPath, newPath)
    })

    await expect(updateRunPartial(run.runId, 'rejected')).rejects.toThrow('simulated rename failure')
    await updateRunPartial(run.runId, 'recovered')

    expect((await getGenerationRun(run.runId))?.partialContent).toBe('recovered')
  })

  it('recovers journal authority after a legacy root replacement failure without leaving temp files', async () => {
    const run = await createGenerationRun({
      characterName: 'LegacyCrashBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    const runsDir = path.join(testDataDir, 'runs')
    const runPath = path.join(runsDir, `${run.runId}.json`)
    const realRename = fsPromises.rename.bind(fsPromises)
    const renameSpy = vi.spyOn(fsPromises, 'rename').mockImplementation(async (oldPath, newPath) => {
      if (String(newPath) === runPath) throw new Error('simulated legacy replacement crash')
      return realRename(oldPath, newPath)
    })

    await expect(updateRunPartial(run.runId, 'journal survives')).rejects.toThrow('simulated legacy replacement crash')
    renameSpy.mockRestore()
    expect(fs.readdirSync(runsDir).filter(name => name.includes(`${run.runId}.json.`) && name.endsWith('.tmp')))
      .toEqual([])

    clearRunJournalStoresForTest()
    await recoverGenerationRunProjectionCache()

    expect(getRunProjectionReadiness().ready).toBe(true)
    expect((await getGenerationRunProjectionDetail(run.runId))?.partialContent).toBe('journal survives')
    expect(await getGenerationRun(run.runId)).toMatchObject({
      status: 'interrupted',
      partialContent: 'journal survives',
    })
    expect((await auditGenerationRunAuthority()).ok).toBe(true)
  })

  it('recreates a missing legacy root for a journaled running run before readiness', async () => {
    const runsDir = path.join(testDataDir, 'runs')
    const realRename = fsPromises.rename.bind(fsPromises)
    const renameSpy = vi.spyOn(fsPromises, 'rename').mockImplementation(async (oldPath, newPath) => {
      const destination = String(newPath)
      if (path.dirname(destination) === runsDir && /^[0-9a-f-]{36}\.json$/i.test(path.basename(destination))) {
        throw new Error('simulated create legacy replacement crash')
      }
      return realRename(oldPath, newPath)
    })

    await expect(createGenerationRun({
      characterName: 'MissingLegacyCreateBot',
      chatId: 'chat-1',
      operation: 'generate',
    })).rejects.toThrow('simulated create legacy replacement crash')
    renameSpy.mockRestore()
    const replay = await replayGenerationRunJournal()
    const runId = replay.events[0]!.runId
    expect(fs.readdirSync(runsDir).filter(name => name.includes(`${runId}.json.`) && name.endsWith('.tmp')))
      .toEqual([])

    clearRunJournalStoresForTest()
    await recoverGenerationRunProjectionCache()

    expect(getRunProjectionReadiness().ready).toBe(true)
    expect(await getGenerationRun(runId)).toMatchObject({ status: 'interrupted', partialContent: '' })
    expect((await getGenerationRunProjectionDetail(runId))?.status).toBe('interrupted')
    expect((await auditGenerationRunAuthority()).ok).toBe(true)
  })

  it('repairs a transient checkpoint replacement failure before writing the legacy root', async () => {
    const run = await createGenerationRun({
      characterName: 'CheckpointCrashBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    const checkpointPath = path.join(testDataDir, 'runs', 'journal', 'checkpoint.json')
    const realRename = fsPromises.rename.bind(fsPromises)
    let rejectCheckpoint = true
    vi.spyOn(fsPromises, 'rename').mockImplementation(async (oldPath, newPath) => {
      if (String(newPath) === checkpointPath && rejectCheckpoint) {
        rejectCheckpoint = false
        throw new Error('simulated checkpoint replacement crash')
      }
      return realRename(oldPath, newPath)
    })

    await updateRunPartial(run.runId, 'checkpoint recovered')

    expect((await getGenerationRun(run.runId))?.partialContent).toBe('checkpoint recovered')
    expect(JSON.parse(fs.readFileSync(checkpointPath, 'utf8')).journalSeq).toBe(2)
    expect(JSON.parse(fs.readFileSync(path.join(testDataDir, 'runs', 'index.json'), 'utf8')).lastJournalSeq).toBe(2)
  })

  it('keeps legacy and projection state unchanged when journal append fails and reuses the orphan artifact on retry', async () => {
    const run = await createGenerationRun({
      characterName: 'JournalAppendCrashBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    const runsDir = path.join(testDataDir, 'runs')
    const journalPath = path.join(runsDir, 'journal', '00000001.jsonl')
    const realAppendFile = fsPromises.appendFile.bind(fsPromises)
    let rejectAppend = true
    vi.spyOn(fsPromises, 'appendFile').mockImplementation(async (filePath, ...args) => {
      if (String(filePath) === journalPath && rejectAppend) {
        rejectAppend = false
        throw new Error('simulated journal append crash')
      }
      return realAppendFile(filePath, ...args)
    })

    await expect(updateRunPartial(run.runId, 'retry-safe partial')).rejects.toThrow('simulated journal append crash')
    expect((await getGenerationRun(run.runId))?.partialContent).toBe('')
    expect((await replayGenerationRunJournal()).events).toHaveLength(1)

    await updateRunPartial(run.runId, 'retry-safe partial')

    expect((await getGenerationRun(run.runId))?.partialContent).toBe('retry-safe partial')
    expect((await replayGenerationRunJournal()).events).toHaveLength(2)
    expect(fs.readdirSync(path.join(runsDir, 'artifacts', run.runId)).filter(name => name.startsWith('partial-')))
      .toHaveLength(1)
    expect((await auditGenerationRunAuthority()).ok).toBe(true)
  })

  it('writes typed redacted shadow journal events for the current run lifecycle', async () => {
    const completed = await createGenerationRun({
      characterName: 'JournalBot',
      chatId: 'completed-chat',
      operation: 'generate',
    })
    await updateRunPartial(completed.runId, 'partial secret sk-partial')
    await completeRun(completed.runId, {
      partialContent: 'provider final secret',
      committedLineIndex: 2,
    })
    await finalizeStRunOutput(completed.runId, {
      partialContent: 'plugin final secret',
      committedLineIndex: 2,
    })

    const failed = await createGenerationRun({
      characterName: 'JournalBot',
      chatId: 'failed-chat',
      operation: 'continue',
    })
    await failRun(failed.runId, {
      error: 'provider error with sk-failure and prompt data',
      partialContent: 'recoverable secret',
      committedLineIndex: 3,
    })
    await markRunCommitted(failed.runId, { committedLineIndex: 3 })

    const canceled = await createGenerationRun({
      characterName: 'JournalBot',
      chatId: 'canceled-chat',
      operation: 'regenerate',
    })
    await cancelRun(canceled.runId, {
      error: 'client secret reason',
      partialContent: 'canceled secret',
    })
    await discardRun(canceled.runId)

    const interrupted = await createGenerationRun({
      characterName: 'JournalBot',
      chatId: 'interrupted-chat',
      operation: 'generate',
    })
    await interruptRun(interrupted.runId, 'shutdown secret reason')

    const replay = await replayGenerationRunJournal()
    expect(replay.events.map(event => event.type)).toEqual([
      'run.started',
      'run.partial_checkpointed',
      'run.provider_completed',
      'run.st_output_finalized',
      'run.started',
      'run.failed',
      'run.committed',
      'run.started',
      'run.canceled',
      'run.discarded',
      'run.started',
      'run.interrupted',
    ])
    expect(replay.events.map(event => event.journalSeq)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    )

    const rawJournal = fs.readFileSync(
      path.join(testDataDir, 'runs', 'journal', '00000001.jsonl'),
      'utf8',
    )
    for (const secret of [
      'partial secret',
      'provider final secret',
      'plugin final secret',
      'provider error',
      'recoverable secret',
      'client secret reason',
      'canceled secret',
      'shutdown secret reason',
      'sk-',
      'prompt data',
    ]) {
      expect(rawJournal).not.toContain(secret)
    }

    const audit = await auditGenerationRunJournal()
    expect(audit.ok).toBe(true)
    expect(audit.mismatches).toEqual([])
    expect(audit.projectionOnlyRunIds).toEqual([])
  })

  it('reports journal and JSON projection drift without mutating either source', async () => {
    const run = await createGenerationRun({
      characterName: 'JournalBot',
      chatId: 'drift-chat',
      operation: 'generate',
    })
    const runPath = path.join(testDataDir, 'runs', `${run.runId}.json`)
    const projection = JSON.parse(fs.readFileSync(runPath, 'utf8')) as Record<string, unknown>
    fs.writeFileSync(runPath, `${JSON.stringify({ ...projection, status: 'failed' }, null, 2)}\n`, 'utf8')

    const beforeAudit = fs.readFileSync(runPath, 'utf8')
    const audit = await auditGenerationRunJournal()

    expect(audit.ok).toBe(false)
    expect(audit.mismatches).toContainEqual({
      runId: run.runId,
      field: 'status',
      journalValue: 'running',
      projectionValue: 'failed',
    })
    expect(fs.readFileSync(runPath, 'utf8')).toBe(beforeAudit)
  })
  it('rebuilds a completed run from journal and immutable artifact after the legacy JSON is removed', async () => {
    const run = await createGenerationRun({
      characterName: 'ArtifactBot',
      chatId: 'artifact-chat',
      operation: 'generate',
    })
    await updateRunPartial(run.runId, 'partial artifact content')
    await completeRun(run.runId, {
      partialContent: 'final artifact content',
      committedLineIndex: 4,
    })

    const replay = await replayGenerationRunJournal()
    const completedEvent = replay.events.find(event =>
      event.runId === run.runId && event.type === 'run.provider_completed'
    )
    expect(completedEvent?.type).toBe('run.provider_completed')
    if (completedEvent?.type !== 'run.provider_completed') throw new Error('Missing completed event')
    expect(completedEvent.payload.artifact).toMatchObject({
      kind: 'final',
      bytes: Buffer.byteLength('final artifact content', 'utf8'),
    })

    fs.rmSync(path.join(testDataDir, 'runs', `${run.runId}.json`))
    const projected = projectRunJournalEvents(replay.events).get(run.runId)
    expect(projected).toBeDefined()
    const rebuilt = await materializeRunJournalProjection(
      projected!,
      new RunArtifactStore(path.join(testDataDir, 'runs')),
    )

    expect(rebuilt).toMatchObject({
      runId: run.runId,
      status: 'completed',
      partialContent: 'final artifact content',
      committedLineIndex: 4,
    })
  })
})
