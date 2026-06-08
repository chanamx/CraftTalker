import { Hono } from 'hono'
import * as runService from '../services/run.service.js'
import * as chatService from '../services/chat.service.js'
import { getGenerationLockInfo } from '../lib/generation-locks.js'

const runsRoute = new Hono()
const recoverableStatuses = new Set<runService.GenerationRunStatus>(['failed', 'canceled', 'interrupted'])
const activeRunActions = new Set<string>()
const staleRunError = 'Server restarted or previous generation was abandoned before completion.'

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

  const runs = await interruptStaleRunningRuns(await runService.listGenerationRuns())
  const filtered = runs.filter(run =>
    (!characterName || run.characterName === characterName)
    && (!chatId || run.chatId === chatId)
    && (!status || run.status === status)
  )

  return c.json(filtered)
})

runsRoute.get('/:runId', async (c) => {
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

    await chatService.addMessage(run.characterName, run.chatId, false, run.partialContent)
    const chat = await chatService.getChat(run.characterName, run.chatId)
    const updated = await runService.markRunCommitted(run.runId, {
      committedLineIndex: chat.lines.length - 1,
    })

    return c.json(updated)
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
