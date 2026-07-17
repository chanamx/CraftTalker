import { Hono } from 'hono'
import { getGenerationSchedulerStatus } from '../lib/generation-locks.js'

const workerRoute = new Hono()

workerRoute.get('/status', (c) => c.json(getGenerationSchedulerStatus()))

export { workerRoute }
