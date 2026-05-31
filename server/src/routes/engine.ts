import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { setEngine, getEngine, getEngineName, NativeEngine } from '../engine/index.js'
import { STEngine } from '../engine/st-engine.js'

const engineRoute = new Hono()

engineRoute.get('/current', (c) => {
  return c.json({ engine: getEngineName() })
})

const switchSchema = z.object({
  engine: z.enum(['native', 'sillytavern']),
  stPath: z.string().optional(),
})

engineRoute.post('/switch', zValidator('json', switchSchema), async (c) => {
  const { engine, stPath } = c.req.valid('json')

  if (engine === 'native') {
    setEngine(new NativeEngine())
  } else {
    const stEngine = new STEngine(stPath)
    if (stPath) await stEngine.initialize(stPath)
    setEngine(stEngine)
  }

  return c.json({ engine: getEngineName() })
})

const testSchema = z.object({
  apiUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
  type: z.enum(['openai', 'kobold', 'textgen', 'novel', 'custom']).default('openai'),
})

engineRoute.post('/test', zValidator('json', testSchema), async (c) => {
  const config = c.req.valid('json')
  const engine = getEngine()
  const ok = await engine.testConnection(config)
  return c.json({ success: ok })
})

export { engineRoute }
