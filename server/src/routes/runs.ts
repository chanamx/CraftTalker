import { Hono } from 'hono'
import { z } from 'zod'
import * as runService from '../services/run.service.js'
import { commitGenerationOutput, finalizeGenerationOutput } from '../services/generation-committer.js'
import { getGenerationLockInfo } from '../lib/generation-locks.js'

const runsRoute = new Hono()
const recoverableStatuses = new Set<runService.GenerationRunStatus>(['failed', 'canceled', 'interrupted'])
const activeRunActions = new Set<string>()
const staleRunError = 'Server restarted or previous generation was abandoned before completion.'
const finalizeStOutputSchema = z.object({
  content: z.string().max(200_000),
})
const projectionSummaryQuerySchema = z.object({
  characterName: z.string().min(1).max(255).optional(),
  chatId: z.string().min(1).max(255).optional(),
  status: z.enum(['running', 'completed', 'failed', 'canceled', 'interrupted', 'committed', 'discarded']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(1024).optional(),
})

function tryAcquireRunAction(runId: string): (() => void) | null {
  if (activeRunActions.has(runId)) return null
  activeRunActions.add(runId)

  let released = false
  return () => {
    if (released) return
    released = true
    activeRunActions.delete(runId)
  }
}

function isRecoverableRun(run: runService.GenerationRunRecord): boolean {
  return recoverableStatuses.has(run.status) && run.committedLineIndex === undefined
}

async function interruptStaleRunningRuns(runs: runService.GenerationRunRecord[]): Promise<runService.GenerationRunRecord[]> {
  return Promise.all(runs.map(async (run) => {
    if (run.status !== 'running') return run
    if (getGenerationLockInfo(run.characterName, run.chatId)) return run
    return await runService.interruptRun(run.runId, staleRunError) ?? run
  }))
}

async function getGenerationRunForDisplay(runId: string): Promise<runService.GenerationRunRecord | null> {
  const run = await runService.getGenerationRun(runId)
  if (!run) return null
  const [updated] = await interruptStaleRunningRuns([run])
  return updated ?? null
}

runsRoute.get('/', async (c) => {
  const characterName = c.req.query('characterName')
  const chatId = c.req.query('chatId')
  const status = c.req.query('status')
  const view = c.req.query('view')

  if (view !== undefined && view !== 'summary' && view !== 'legacy') {
    return c.json({ error: 'Invalid run list view' }, 400)
  }

  if (view !== 'legacy') {
    const readiness = runService.getRunProjectionReadiness()
    if (!readiness.ready) {
      return c.json({
        error: 'Run projection view is not ready',
        invalidLegacyCount: readiness.invalidLegacyCount,
        missingLegacyCount: readiness.missingLegacyCount,
      }, 503)
    }
    const parsed = projectionSummaryQuerySchema.safeParse({
      characterName,
      chatId,
      status,
      limit: c.req.query('limit'),
      cursor: c.req.query('cursor'),
    })
    if (!parsed.success) return c.json({ error: 'Invalid run summary query' }, 400)
    try {
      return c.json(await runService.listGenerationRunProjectionSummaries(parsed.data))
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid run projection cursor') {
        return c.json({ error: error.message }, 400)
      }
      if (error instanceof Error && error.message === 'Run projection summary requires repair') {
        return c.json({ error: error.message }, 503)
      }
      throw error
    }
  }

  const runs = await interruptStaleRunningRuns(await runService.listGenerationRuns())
  const filtered = runs.filter(run =>
    (!characterName || run.characterName === characterName)
    && (!chatId || run.chatId === chatId)
    && (!status || run.status === status)
  )

  return c.json(filtered)
})

runsRoute.get('/:runId', async (c) => {
  const view = c.req.query('view')
  if (view !== undefined && view !== 'projection' && view !== 'legacy') {
    return c.json({ error: 'Invalid run detail view' }, 400)
  }

  if (view !== 'legacy') {
    const readiness = runService.getRunProjectionReadiness()
    if (!readiness.ready) {
      return c.json({
        error: 'Run projection view is not ready',
        invalidLegacyCount: readiness.invalidLegacyCount,
        missingLegacyCount: readiness.missingLegacyCount,
      }, 503)
    }
    try {
      const projected = await runService.getGenerationRunProjectionDetail(c.req.param('runId'))
      if (!projected) return c.json({ error: 'Run not found' }, 404)
      return c.json(projected)
    } catch (error) {
      if (error instanceof Error && error.message === 'Run projection detail requires repair') {
        return c.json({ error: error.message }, 503)
      }
      throw error
    }
  }

  const run = await getGenerationRunForDisplay(c.req.param('runId'))
  if (!run) return c.json({ error: 'Run not found' }, 404)
  return c.json(run)
})

runsRoute.post('/:runId/commit', async (c) => {
  const runId = c.req.param('runId')
  const release = tryAcquireRunAction(runId)
  if (!release) return c.json({ error: 'Run recovery action already in progress' }, 409)

  try {
    const run = await getGenerationRunForDisplay(runId)
    if (!run) return c.json({ error: 'Run not found' }, 404)
    if (!run.partialContent.trim()) {
      return c.json({ error: 'Run has no partial content to commit' }, 400)
    }
    if (!isRecoverableRun(run)) {
      return c.json({ error: 'Run is not recoverable' }, 409)
    }

    const committed = await commitGenerationOutput({
      runId: run.runId,
      characterName: run.characterName,
      chatId: run.chatId,
      content: run.partialContent,
      isContinue: false,
    })
    if (committed.lineIndex === undefined) {
      return c.json({ error: 'Unable to commit run output' }, 409)
    }
    const updated = await runService.markRunCommitted(run.runId, {
      committedLineIndex: committed.lineIndex,
    })

    return c.json(updated)
  } finally {
    release()
  }
})

runsRoute.post('/:runId/finalize-st-output', async (c) => {
  const runId = c.req.param('runId')
  const release = tryAcquireRunAction(runId)
  if (!release) return c.json({ error: 'Run finalization already in progress' }, 409)

  try {
    const parsed = finalizeStOutputSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid ST finalization payload' }, 400)

    const run = await getGenerationRunForDisplay(runId)
    if (!run) return c.json({ error: 'Run not found' }, 404)
    if (run.status !== 'completed') return c.json({ error: 'Only completed runs can be finalized' }, 409)
    if (run.stFinalizedAt) return c.json({ error: 'Run output was already finalized' }, 409)

    const committed = await finalizeGenerationOutput({
      runId: run.runId,
      characterName: run.characterName,
      chatId: run.chatId,
      operation: run.operation,
      generatedContent: run.partialContent,
      finalizedContent: parsed.data.content,
      committedLineIndex: run.committedLineIndex,
    })
    const updated = await runService.finalizeStRunOutput(run.runId, {
      partialContent: parsed.data.content,
      committedLineIndex: committed.lineIndex,
    })
    if (!updated) return c.json({ error: 'Run disappeared during finalization' }, 409)

    return c.json({
      runId: updated.runId,
      committedLineIndex: committed.lineIndex,
      line: committed.line,
    })
  } finally {
    release()
  }
})

runsRoute.post('/:runId/discard', async (c) => {
  const runId = c.req.param('runId')
  const release = tryAcquireRunAction(runId)
  if (!release) return c.json({ error: 'Run recovery action already in progress' }, 409)

  try {
    const run = await getGenerationRunForDisplay(runId)
    if (!run) return c.json({ error: 'Run not found' }, 404)
    if (!isRecoverableRun(run)) {
      return c.json({ error: 'Run is not recoverable' }, 409)
    }

    const updated = await runService.discardRun(run.runId)
    return c.json(updated)
  } finally {
    release()
  }
})

export { runsRoute }
