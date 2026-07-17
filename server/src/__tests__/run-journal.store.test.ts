import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  RUN_JOURNAL_MAX_REPLAY_BYTES,
  RunJournalStore,
  type RunJournalAppendInput,
} from '../services/run-journal.store.js'

let testDataDir = ''
let runsDir = ''
let store: RunJournalStore

beforeEach(() => {
  testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crafttalker-run-journal-'))
  runsDir = path.join(testDataDir, 'runs')
  store = new RunJournalStore(runsDir)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

describe('run journal store', () => {
  it('serializes concurrent appends with contiguous global sequence numbers', async () => {
    const runId = crypto.randomUUID()
    const appended = await Promise.all(Array.from({ length: 20 }, (_, partialBytes) =>
      store.append({ runId, type: 'run.partial_checkpointed', payload: { partialBytes } })
    ))

    expect(appended.map(event => event.journalSeq)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    )
    expect(new Set(appended.map(event => event.eventId))).toHaveLength(20)

    const replay = await store.replay()
    expect(replay.tornTail).toBe(false)
    expect(replay.lastJournalSeq).toBe(20)
    expect(replay.events).toHaveLength(20)
  })

  it('flushes critical events but not partial checkpoints', async () => {
    const realAppendFile = fsPromises.appendFile.bind(fsPromises)
    const appendSpy = vi.spyOn(fsPromises, 'appendFile').mockImplementation((...args) => realAppendFile(...args))
    const runId = crypto.randomUUID()

    await store.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'JournalBot', chatId: 'chat-1', operation: 'generate' },
    })
    await store.append({ runId, type: 'run.partial_checkpointed', payload: { partialBytes: 12 } })

    const options = appendSpy.mock.calls.map(call => call[2] as { flush?: boolean })
    expect(options.map(option => option.flush)).toEqual([true, false])
  })

  it('ignores and repairs only a torn final line', async () => {
    const runId = crypto.randomUUID()
    await store.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'JournalBot', chatId: 'chat-1', operation: 'generate' },
    })
    const segmentPath = path.join(runsDir, 'journal', '00000001.jsonl')
    await fsPromises.appendFile(segmentPath, '{"version":1', 'utf8')

    const restarted = new RunJournalStore(runsDir)
    const beforeRepair = await restarted.replay()
    expect(beforeRepair.tornTail).toBe(true)
    expect(beforeRepair.events).toHaveLength(1)

    await restarted.append({ runId, type: 'run.partial_checkpointed', payload: { partialBytes: 7 } })

    const repaired = await restarted.replay()
    expect(repaired.tornTail).toBe(false)
    expect(repaired.events.map(event => event.journalSeq)).toEqual([1, 2])
  })

  it('fails closed on a malformed complete line', async () => {
    await store.append({
      runId: crypto.randomUUID(),
      type: 'run.started',
      payload: { characterName: 'JournalBot', chatId: 'chat-1', operation: 'generate' },
    })
    const segmentPath = path.join(runsDir, 'journal', '00000001.jsonl')
    await fsPromises.appendFile(segmentPath, 'not-json\n', 'utf8')

    await expect(new RunJournalStore(runsDir).replay()).rejects.toThrow('line 2')
  })

  it('rejects out-of-contract payloads before writing', async () => {
    const input = {
      runId: crypto.randomUUID(),
      type: 'run.started',
      payload: {
        characterName: 'x'.repeat(256),
        chatId: 'chat-1',
        operation: 'generate',
        apiKey: 'sk-must-not-be-written',
      },
    } as unknown as RunJournalAppendInput

    await expect(store.append(input)).rejects.toThrow('Invalid run journal event')
    expect(fs.existsSync(path.join(runsDir, 'journal', '00000001.jsonl'))).toBe(false)
  })

  it('continues the writer queue after an append failure', async () => {
    const realAppendFile = fsPromises.appendFile.bind(fsPromises)
    let rejectNext = true
    vi.spyOn(fsPromises, 'appendFile').mockImplementation(async (...args) => {
      if (rejectNext) {
        rejectNext = false
        throw new Error('simulated append failure')
      }
      return realAppendFile(...args)
    })
    const input: RunJournalAppendInput = {
      runId: crypto.randomUUID(),
      type: 'run.started',
      payload: { characterName: 'JournalBot', chatId: 'chat-1', operation: 'generate' },
    }

    await expect(store.append(input)).rejects.toThrow('simulated append failure')
    const recovered = await store.append(input)

    expect(recovered.journalSeq).toBe(1)
    expect((await store.replay()).events).toHaveLength(1)
  })
  it('waits for an active append before replaying', async () => {
    const realAppendFile = fsPromises.appendFile.bind(fsPromises)
    let signalAppendStarted!: () => void
    let releaseAppend!: () => void
    const appendStarted = new Promise<void>(resolve => { signalAppendStarted = resolve })
    const appendReleased = new Promise<void>(resolve => { releaseAppend = resolve })
    vi.spyOn(fsPromises, 'appendFile').mockImplementation(async (...args) => {
      signalAppendStarted()
      await appendReleased
      return realAppendFile(...args)
    })

    const append = store.append({
      runId: crypto.randomUUID(),
      type: 'run.started',
      payload: { characterName: 'JournalBot', chatId: 'chat-1', operation: 'generate' },
    })
    await appendStarted
    let replaySettled = false
    const replay = store.replay().then(result => {
      replaySettled = true
      return result
    })
    await Promise.resolve()

    expect(replaySettled).toBe(false)
    releaseAppend()
    await append
    expect((await replay).events).toHaveLength(1)
  })
  it('returns append cursors and replays only the journal tail', async () => {
    const runId = crypto.randomUUID()
    const first = await store.appendWithCursor({
      runId,
      type: 'run.started',
      payload: { characterName: 'TailBot', chatId: 'chat-1', operation: 'generate' },
    })
    const second = await store.appendWithCursor({
      runId,
      type: 'run.partial_checkpointed',
      payload: { partialBytes: 4 },
    })
    const readSpy = vi.spyOn(fsPromises, 'readFile')

    const tail = await new RunJournalStore(runsDir).replayTail(first.cursor)

    expect(tail.entries.map(entry => entry.event.journalSeq)).toEqual([second.event.journalSeq])
    expect(tail.entries[0]?.cursor).toEqual(second.cursor)
    expect(tail.lastJournalSeq).toBe(second.event.journalSeq)
    expect(tail.tornTail).toBe(false)
    expect(readSpy).not.toHaveBeenCalled()
  })

  it('returns complete tail events while preserving a torn final fragment', async () => {
    const runId = crypto.randomUUID()
    const first = await store.appendWithCursor({
      runId,
      type: 'run.started',
      payload: { characterName: 'TailBot', chatId: 'chat-1', operation: 'generate' },
    })
    const second = await store.appendWithCursor({
      runId,
      type: 'run.partial_checkpointed',
      payload: { partialBytes: 4 },
    })
    await fsPromises.appendFile(path.join(runsDir, 'journal', '00000001.jsonl'), '{"version":1', 'utf8')

    const tail = await new RunJournalStore(runsDir).replayTail(first.cursor)

    expect(tail.entries.map(entry => entry.event.journalSeq)).toEqual([second.event.journalSeq])
    expect(tail.cursor).toEqual(second.cursor)
    expect(tail.tornTail).toBe(true)
  })

  it('bounds full replay before allocating an oversized journal body', async () => {
    const segmentPath = path.join(runsDir, 'journal', '00000001.jsonl')
    fs.mkdirSync(path.dirname(segmentPath), { recursive: true })
    fs.writeFileSync(segmentPath, '')
    fs.truncateSync(segmentPath, RUN_JOURNAL_MAX_REPLAY_BYTES + 1)
    const readSpy = vi.spyOn(fsPromises, 'readFile')

    await expect(store.replay()).rejects.toThrow('repair required')
    expect(readSpy).not.toHaveBeenCalled()
  })

  it('rejects a checkpoint that is not aligned to a complete journal line', async () => {
    const appended = await store.appendWithCursor({
      runId: crypto.randomUUID(),
      type: 'run.started',
      payload: { characterName: 'TailBot', chatId: 'chat-1', operation: 'generate' },
    })

    await expect(store.replayTail({
      ...appended.cursor,
      byteOffset: appended.cursor.byteOffset - 1,
    })).rejects.toThrow('aligned')
  })

  it('fails closed if an initialized segment disappears', async () => {
    const runId = crypto.randomUUID()
    await store.append({
      runId,
      type: 'run.started',
      payload: { characterName: 'JournalBot', chatId: 'chat-1', operation: 'generate' },
    })
    fs.rmSync(path.join(runsDir, 'journal', '00000001.jsonl'))

    await expect(store.append({
      runId,
      type: 'run.partial_checkpointed',
      payload: { partialBytes: 1 },
    })).rejects.toThrow('disappeared')
  })
})