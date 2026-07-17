import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RunArtifactStore } from '../services/run-artifact.store.js'
import { RunJournalStore } from '../services/run-journal.store.js'
import {
  applyRunJournalEvent,
  materializeRunJournalProjection,
  projectRunJournalEvents,
} from '../services/run-journal-projector.js'

let dataDir = ''
let runsDir = ''
let artifacts: RunArtifactStore
let journal: RunJournalStore

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crafttalker-run-projector-'))
  runsDir = path.join(dataDir, 'runs')
  artifacts = new RunArtifactStore(runsDir)
  journal = new RunJournalStore(runsDir)
})

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('run journal projector', () => {
  it('rebuilds a materialized run from events and an integrity-checked artifact', async () => {
    const runId = crypto.randomUUID()
    await journal.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'ProjectorBot', chatId: 'chat-1', operation: 'generate' },
    })
    const partialArtifact = await artifacts.write(runId, 'partial', 'recoverable output')
    await journal.append({
      runId,
      type: 'run.failed',
      payload: {
        partialBytes: partialArtifact.bytes,
        artifact: partialArtifact,
        errorMessage: 'Generation failed.',
      },
    })

    const replay = await journal.replay()
    const projection = projectRunJournalEvents(replay.events).get(runId)
    expect(projection).toMatchObject({
      runId,
      characterName: 'ProjectorBot',
      chatId: 'chat-1',
      operation: 'generate',
      status: 'failed',
      partialBytes: partialArtifact.bytes,
      outputArtifact: partialArtifact,
      error: 'Generation failed.',
    })
    expect(await materializeRunJournalProjection(projection!, artifacts)).toMatchObject({
      runId,
      status: 'failed',
      partialContent: 'recoverable output',
    })
  })

  it('keeps a terminal status when a later partial checkpoint is replayed', async () => {
    const runId = crypto.randomUUID()
    await journal.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'ProjectorBot', chatId: 'chat-1', operation: 'generate' },
    })
    const finalArtifact = await artifacts.write(runId, 'final', 'final')
    await journal.append({
      runId,
      type: 'run.provider_completed',
      payload: { partialBytes: finalArtifact.bytes, artifact: finalArtifact },
    })
    const lateArtifact = await artifacts.write(runId, 'partial', 'late partial')
    await journal.append({
      runId,
      type: 'run.partial_checkpointed',
      payload: { partialBytes: lateArtifact.bytes, artifact: lateArtifact },
    })

    const projection = projectRunJournalEvents((await journal.replay()).events).get(runId)
    expect(projection?.status).toBe('completed')
    expect(projection?.outputArtifact).toEqual(lateArtifact)
  })

  it('rejects a repeated commit to a different chat line', async () => {
    const runId = crypto.randomUUID()
    await journal.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'ProjectorBot', chatId: 'chat-1', operation: 'generate' },
    })
    await journal.append({
      runId,
      type: 'run.failed',
      payload: { partialBytes: 0 },
    })
    await journal.append({ runId, type: 'run.committed', payload: { committedLineIndex: 1 } })
    await journal.append({ runId, type: 'run.committed', payload: { committedLineIndex: 2 } })

    expect(() => projectRunJournalEvents((fs.readFileSync(
      path.join(runsDir, 'journal', '00000001.jsonl'),
      'utf8',
    ).trim().split('\n').map(line => JSON.parse(line))))).toThrow('different chat line')
  })

  it('treats a repeated commit to the same chat line as idempotent', async () => {
    const runId = crypto.randomUUID()
    await journal.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'ProjectorBot', chatId: 'chat-1', operation: 'generate' },
    })
    await journal.append({ runId, type: 'run.committed', payload: { committedLineIndex: 1 } })
    await journal.append({ runId, type: 'run.committed', payload: { committedLineIndex: 1 } })
    const events = (await journal.replay()).events
    const current = projectRunJournalEvents(events.slice(0, 2)).get(runId)!

    expect(applyRunJournalEvent(current, events[2])).toBe(current)
  })
})