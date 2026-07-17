import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { RunArtifactStore } from '../services/run-artifact.store.js'
import { RunJournalStore } from '../services/run-journal.store.js'
import { RunProjectionStore } from '../services/run-projection.store.js'

let dataDir = ''
let runsDir = ''
let artifacts: RunArtifactStore
let journal: RunJournalStore
let projections: RunProjectionStore

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crafttalker-run-projection-'))
  runsDir = path.join(dataDir, 'runs')
  artifacts = new RunArtifactStore(runsDir)
  journal = new RunJournalStore(runsDir)
  projections = new RunProjectionStore(runsDir)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('run projection store', () => {
  it('rebuilds projection files and a summary-only deterministic index from journal replay', async () => {
    const first = crypto.randomUUID()
    const second = crypto.randomUUID()
    await journal.append({
      runId: first,
      type: 'run.started',
      payload: { characterName: 'FirstBot', chatId: 'chat-1', operation: 'generate' },
    })
    const firstArtifact = await artifacts.write(first, 'final', 'first output')
    await journal.append({
      runId: first,
      type: 'run.provider_completed',
      payload: { partialBytes: firstArtifact.bytes, artifact: firstArtifact, committedLineIndex: 2 },
    })
    await journal.append({
      runId: second,
      type: 'run.started',
      payload: { characterName: 'SecondBot', chatId: 'chat-2', operation: 'continue' },
    })

    const replay = await journal.replay()
    const rebuilt = await projections.rebuild(replay)

    expect(rebuilt.lastJournalSeq).toBe(3)
    expect(rebuilt.runs.map(run => run.runId)).toEqual([second, first])
    expect(rebuilt.runs[1]).toMatchObject({
      status: 'completed',
      partialBytes: firstArtifact.bytes,
      hasPartialContent: true,
      committedLineIndex: 2,
    })
    expect(JSON.stringify(rebuilt)).not.toContain('relativePath')
    expect(JSON.stringify(rebuilt)).not.toContain('sha256')
    expect(JSON.stringify(rebuilt)).not.toContain('first output')

    const stored = await projections.readProjection(first)
    expect(stored?.outputArtifact).toEqual(firstArtifact)
    expect(await projections.readCheckpoint()).toMatchObject({
      version: 1,
      journalSeq: replay.lastJournalSeq,
      byteOffset: replay.cursor.byteOffset,
    })
  })

  it('recreates deleted caches from journal without reading artifact bodies', async () => {
    const runId = crypto.randomUUID()
    await journal.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'RebuildBot', chatId: 'chat-1', operation: 'generate' },
    })
    const artifact = await artifacts.write(runId, 'partial', 'recoverable')
    await journal.append({
      runId,
      type: 'run.failed',
      payload: { partialBytes: artifact.bytes, artifact, errorMessage: 'Generation failed.' },
    })
    const replay = await journal.replay()
    await projections.rebuild(replay)
    fs.rmSync(path.join(runsDir, 'projections'), { recursive: true, force: true })
    fs.rmSync(path.join(runsDir, 'index.json'), { force: true })
    const readSpy = vi.spyOn(fsPromises, 'readFile')

    const rebuilt = await projections.rebuild(replay)

    expect(rebuilt.runs).toHaveLength(1)
    expect((await projections.readProjection(runId))?.status).toBe('failed')
    expect(readSpy.mock.calls.some(call => String(call[0]).includes('artifacts'))).toBe(false)
  })

  it('recovers from the checkpoint by applying only journal tail events', async () => {
    const runId = crypto.randomUUID()
    await journal.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'TailRecoveryBot', chatId: 'chat-1', operation: 'generate' },
    })
    await projections.rebuild(await journal.replay())
    const artifact = await artifacts.write(runId, 'final', 'tail recovered')
    const completed = await journal.appendWithCursor({
      runId,
      type: 'run.provider_completed',
      payload: { partialBytes: artifact.bytes, artifact, committedLineIndex: 3 },
    })
    const readSpy = vi.spyOn(fsPromises, 'readFile')

    const recovered = await projections.recover(journal)

    expect(recovered.lastJournalSeq).toBe(completed.event.journalSeq)
    expect(recovered.runs[0]).toMatchObject({ status: 'completed', committedLineIndex: 3 })
    expect((await projections.readCheckpoint())?.journalSeq).toBe(completed.event.journalSeq)
    expect(readSpy.mock.calls.some(call => String(call[0]).endsWith('.jsonl'))).toBe(false)
  })

  it('fails closed when a checkpointed journal segment disappears', async () => {
    const runId = crypto.randomUUID()
    await journal.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'MissingJournalBot', chatId: 'chat-1', operation: 'generate' },
    })
    const initial = await projections.rebuild(await journal.replay())
    fs.rmSync(path.join(runsDir, 'journal', '00000001.jsonl'))

    await expect(projections.recover(new RunJournalStore(runsDir))).rejects.toThrow('repair required')
    expect(await projections.readIndex()).toEqual(initial)
  })

  it('repairs an invalid checkpoint by rebuilding from the complete journal', async () => {
    const runId = crypto.randomUUID()
    await journal.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'CheckpointRepairBot', chatId: 'chat-1', operation: 'generate' },
    })
    await projections.rebuild(await journal.replay())
    fs.writeFileSync(path.join(runsDir, 'journal', 'checkpoint.json'), '{invalid', 'utf8')
    await journal.append({ runId, type: 'run.partial_checkpointed', payload: { partialBytes: 0 } })

    const recovered = await projections.recover(journal)

    expect(recovered.lastJournalSeq).toBe(2)
    expect((await projections.readCheckpoint())?.journalSeq).toBe(2)
  })

  it('keeps the previous index readable when the final index replacement fails', async () => {
    const runId = crypto.randomUUID()
    await journal.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'StableBot', chatId: 'chat-1', operation: 'generate' },
    })
    const initialReplay = await journal.replay()
    const initialIndex = await projections.rebuild(initialReplay)
    const indexPath = path.join(runsDir, 'index.json')
    const realRename = fsPromises.rename.bind(fsPromises)
    vi.spyOn(fsPromises, 'rename').mockImplementation(async (oldPath, newPath) => {
      if (String(newPath) === indexPath) throw new Error('simulated index rename failure')
      return realRename(oldPath, newPath)
    })

    await expect(projections.rebuild(await journal.replay())).rejects.toThrow('simulated index rename failure')
    expect(await projections.readIndex()).toEqual(initialIndex)
  })
  it('applies one appended event without replaying the journal or reading artifact bodies', async () => {
    const runId = crypto.randomUUID()
    await journal.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'IncrementalBot', chatId: 'chat-1', operation: 'generate' },
    })
    await projections.rebuild(await journal.replay())
    const artifact = await artifacts.write(runId, 'final', 'incremental final')
    const event = await journal.append({
      runId,
      type: 'run.provider_completed',
      payload: { partialBytes: artifact.bytes, artifact, committedLineIndex: 5 },
    })
    const readSpy = vi.spyOn(fsPromises, 'readFile')

    const index = await projections.apply(event)

    expect(index.lastJournalSeq).toBe(event.journalSeq)
    expect(index.runs[0]).toMatchObject({ runId, status: 'completed', committedLineIndex: 5 })
    expect((await projections.readProjection(runId))?.outputArtifact).toEqual(artifact)
    expect(readSpy.mock.calls.some(call => String(call[0]).includes('journal'))).toBe(false)
    expect(readSpy.mock.calls.some(call => String(call[0]).includes('artifacts'))).toBe(false)
  })

  it('serializes concurrent incremental events and rejects a sequence gap', async () => {
    const first = crypto.randomUUID()
    const second = crypto.randomUUID()
    await journal.append({
      runId: first,
      type: 'run.started',
      payload: { characterName: 'FirstBot', chatId: 'chat-1', operation: 'generate' },
    })
    await projections.rebuild(await journal.replay())
    const secondStarted = await journal.append({
      runId: second,
      type: 'run.started',
      payload: { characterName: 'SecondBot', chatId: 'chat-2', operation: 'continue' },
    })
    const firstPartial = await journal.append({
      runId: first,
      type: 'run.partial_checkpointed',
      payload: { partialBytes: 0 },
    })

    await Promise.all([
      projections.apply(secondStarted),
      projections.apply(firstPartial),
    ])
    expect((await projections.readIndex())?.lastJournalSeq).toBe(firstPartial.journalSeq)

    await expect(projections.apply({
      ...firstPartial,
      eventId: crypto.randomUUID(),
      journalSeq: firstPartial.journalSeq + 2,
    })).rejects.toThrow('rebuild required')
  })

  it('recovers its writer queue after an index replacement failure', async () => {
    const runId = crypto.randomUUID()
    await journal.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'RecoveryBot', chatId: 'chat-1', operation: 'generate' },
    })
    await projections.rebuild(await journal.replay())
    const failedEvent = await journal.append({
      runId,
      type: 'run.partial_checkpointed',
      payload: { partialBytes: 0 },
    })
    const indexPath = path.join(runsDir, 'index.json')
    const realRename = fsPromises.rename.bind(fsPromises)
    const renameSpy = vi.spyOn(fsPromises, 'rename').mockImplementation(async (oldPath, newPath) => {
      if (String(newPath) === indexPath) throw new Error('simulated incremental index failure')
      return realRename(oldPath, newPath)
    })

    await expect(projections.apply(failedEvent)).rejects.toThrow('simulated incremental index failure')
    renameSpy.mockRestore()
    const nextEvent = await journal.append({
      runId,
      type: 'run.partial_checkpointed',
      payload: { partialBytes: 0 },
    })

    await expect(projections.apply(nextEvent)).rejects.toThrow('rebuild required')
  })
})