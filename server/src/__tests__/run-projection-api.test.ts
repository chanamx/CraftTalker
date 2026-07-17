import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../app.js'
import {
  clearRunJournalStoresForTest,
  completeRun,
  createGenerationRun,
  failRun,
  recoverGenerationRunProjectionCache,
} from '../services/run.service.js'

let dataDir = ''

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crafttalker-run-projection-api-'))
  process.env.LUKER_DATA_DIR = dataDir
})

afterEach(() => {
  vi.restoreAllMocks()
  clearRunJournalStoresForTest()
  delete process.env.LUKER_DATA_DIR
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('projection-backed run API', () => {
  it('returns cursor-paginated summaries without reading artifact bodies', async () => {
    const first = await createGenerationRun({ characterName: 'PageBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(first.runId, { error: 'failed', partialContent: 'first partial' })
    const second = await createGenerationRun({ characterName: 'PageBot', chatId: 'chat-1', operation: 'continue' })
    await completeRun(second.runId, { partialContent: 'second final', committedLineIndex: 2 })
    await recoverGenerationRunProjectionCache()
    fs.rmSync(path.join(dataDir, 'runs', `${first.runId}.json`))
    fs.rmSync(path.join(dataDir, 'runs', `${second.runId}.json`))
    const readSpy = vi.spyOn(fsPromises, 'readFile')
    const app = createApp()

    const firstPageResponse = await app.request('/api/runs?characterName=PageBot&limit=1')
    expect(firstPageResponse.status).toBe(200)
    const firstPage = await firstPageResponse.json() as {
      items: Array<Record<string, unknown>>
      nextCursor: string | null
    }
    expect(firstPage.items).toHaveLength(1)
    expect(firstPage.items[0]?.runId).toBe(second.runId)
    expect(firstPage.items[0]).toMatchObject({ hasPartialContent: true, partialBytes: 12 })
    expect(firstPage.items[0]).not.toHaveProperty('partialContent')
    expect(JSON.stringify(firstPage)).not.toContain('relativePath')
    expect(JSON.stringify(firstPage)).not.toContain('sha256')
    expect(firstPage.nextCursor).toEqual(expect.any(String))

    const secondPageResponse = await app.request(`/api/runs?characterName=PageBot&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`)
    expect(secondPageResponse.status).toBe(200)
    const secondPage = await secondPageResponse.json() as { items: Array<{ runId: string }>; nextCursor: string | null }
    expect(secondPage.items.map(item => item.runId)).toEqual([first.runId])
    expect(secondPage.nextCursor).toBeNull()
    expect(readSpy.mock.calls.some(call => String(call[0]).includes('artifacts'))).toBe(false)
  })

  it('materializes one projection detail from its artifact without the legacy root file', async () => {
    const run = await createGenerationRun({ characterName: 'DetailBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'provider detail', partialContent: 'lazy detail content' })
    await recoverGenerationRunProjectionCache()
    fs.rmSync(path.join(dataDir, 'runs', `${run.runId}.json`))
    const readSpy = vi.spyOn(fsPromises, 'readFile')
    const app = createApp()

    const response = await app.request(`/api/runs/${run.runId}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      runId: run.runId,
      status: 'failed',
      partialContent: 'lazy detail content',
      error: 'Generation failed.',
    })
    expect(readSpy.mock.calls.filter(call => String(call[0]).includes('artifacts'))).toHaveLength(1)
  })

  it('returns a repairable 503 for corrupted lazy detail while legacy detail remains available', async () => {
    const run = await createGenerationRun({ characterName: 'CorruptDetailBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'legacy error', partialContent: 'legacy fallback content' })
    await recoverGenerationRunProjectionCache()
    const runsDir = path.join(dataDir, 'runs')
    const projection = JSON.parse(fs.readFileSync(
      path.join(runsDir, 'projections', `${run.runId}.json`),
      'utf8',
    )) as { outputArtifact: { relativePath: string } }
    fs.writeFileSync(path.join(runsDir, ...projection.outputArtifact.relativePath.split('/')), 'corrupt', 'utf8')
    const app = createApp()

    const projected = await app.request(`/api/runs/${run.runId}`)
    expect(projected.status).toBe(503)
    expect(await projected.json()).toEqual({ error: 'Run projection detail requires repair' })

    const legacy = await app.request(`/api/runs/${run.runId}?view=legacy`)
    expect(legacy.status).toBe(200)
    expect(await legacy.json()).toMatchObject({ partialContent: 'legacy fallback content' })
  })

  it('returns a repairable 503 when a projected run cache disappears after readiness', async () => {
    const run = await createGenerationRun({ characterName: 'MissingProjectionBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'legacy error', partialContent: 'legacy fallback content' })
    await recoverGenerationRunProjectionCache()
    fs.rmSync(path.join(dataDir, 'runs', 'projections', `${run.runId}.json`))
    const app = createApp()

    const projected = await app.request(`/api/runs/${run.runId}`)
    expect(projected.status).toBe(503)
    expect(await projected.json()).toEqual({ error: 'Run projection detail requires repair' })

    const legacy = await app.request(`/api/runs/${run.runId}?view=legacy`)
    expect(legacy.status).toBe(200)
    expect(await legacy.json()).toMatchObject({ partialContent: 'legacy fallback content' })
  })

  it('returns a repairable 503 when a projected run cache is malformed after readiness', async () => {
    const run = await createGenerationRun({ characterName: 'MalformedProjectionBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'legacy error', partialContent: 'legacy fallback content' })
    await recoverGenerationRunProjectionCache()
    fs.writeFileSync(path.join(dataDir, 'runs', 'projections', `${run.runId}.json`), '{invalid', 'utf8')
    const app = createApp()

    const projected = await app.request(`/api/runs/${run.runId}`)
    expect(projected.status).toBe(503)
    expect(await projected.json()).toEqual({ error: 'Run projection detail requires repair' })

    const legacy = await app.request(`/api/runs/${run.runId}?view=legacy`)
    expect(legacy.status).toBe(200)
    expect(await legacy.json()).toMatchObject({ partialContent: 'legacy fallback content' })
  })

  it('returns a repairable 503 when the summary index disappears after readiness', async () => {
    const run = await createGenerationRun({ characterName: 'MissingIndexBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'legacy error', partialContent: 'legacy fallback content' })
    await recoverGenerationRunProjectionCache()
    fs.rmSync(path.join(dataDir, 'runs', 'index.json'))
    const app = createApp()

    const projected = await app.request('/api/runs')
    expect(projected.status).toBe(503)
    expect(await projected.json()).toEqual({ error: 'Run projection summary requires repair' })

    const legacy = await app.request('/api/runs?view=legacy')
    expect(legacy.status).toBe(200)
    expect(await legacy.json()).toEqual([expect.objectContaining({ runId: run.runId })])
  })

  it('rejects malformed or stale projection cursors', async () => {
    const run = await createGenerationRun({ characterName: 'CursorBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'failed', partialContent: 'cursor content' })
    await recoverGenerationRunProjectionCache()
    const app = createApp()

    const response = await app.request('/api/runs?cursor=not-a-cursor')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid run projection cursor' })
  })

  it('blocks projection views when a journalized run has no legacy fallback file', async () => {
    const run = await createGenerationRun({ characterName: 'MissingLegacyBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'failed', partialContent: 'journal survives' })
    fs.rmSync(path.join(dataDir, 'runs', `${run.runId}.json`))
    clearRunJournalStoresForTest()
    await recoverGenerationRunProjectionCache()
    const app = createApp()

    const response = await app.request('/api/runs')

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Run projection view is not ready',
      invalidLegacyCount: 0,
      missingLegacyCount: 1,
    })
  })

  it('blocks projection views when invalid legacy files remain while preserving the legacy API', async () => {
    const runsDir = path.join(dataDir, 'runs')
    fs.mkdirSync(runsDir, { recursive: true })
    fs.writeFileSync(path.join(runsDir, `${crypto.randomUUID()}.json`), '{invalid', 'utf8')
    await recoverGenerationRunProjectionCache()
    const app = createApp()

    const projectionResponse = await app.request('/api/runs')
    expect(projectionResponse.status).toBe(503)
    expect(await projectionResponse.json()).toEqual({
      error: 'Run projection view is not ready',
      invalidLegacyCount: 1,
      missingLegacyCount: 0,
    })

    const legacyResponse = await app.request('/api/runs?view=legacy')
    expect(legacyResponse.status).toBe(200)
    expect(await legacyResponse.json()).toEqual([])
  })

  it('keeps explicit projection aliases and rejects unknown read views', async () => {
    const run = await createGenerationRun({ characterName: 'AliasBot', chatId: 'chat-1', operation: 'generate' })
    await failRun(run.runId, { error: 'failed', partialContent: 'alias content' })
    await recoverGenerationRunProjectionCache()
    const app = createApp()

    expect((await app.request('/api/runs?view=summary')).status).toBe(200)
    expect((await app.request(`/api/runs/${run.runId}?view=projection`)).status).toBe(200)
    expect((await app.request('/api/runs?view=unknown')).status).toBe(400)
    expect((await app.request(`/api/runs/${run.runId}?view=unknown`)).status).toBe(400)
  })
})
