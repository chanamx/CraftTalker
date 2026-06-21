import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  completeRun,
  createGenerationRun,
  getGenerationRun,
  interruptActiveRunsForChat,
  listGenerationRuns,
  updateRunPartial,
} from '../services/run.service.js'

const testDataDir = path.join(os.tmpdir(), `luker-run-service-${Date.now()}`)

beforeEach(() => {
  process.env.LUKER_DATA_DIR = testDataDir
  fs.mkdirSync(testDataDir, { recursive: true })
})

afterEach(() => {
  vi.useRealTimers()
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
})
