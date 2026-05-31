import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { charactersRoute } from './routes/characters.js'
import { chatsRoute } from './routes/chats.js'
import { worldsRoute } from './routes/worlds.js'
import { presetsRoute } from './routes/presets.js'
import { engineRoute } from './routes/engine.js'
import { appErrorHandler } from './middleware/errorHandler.js'

export function createApp() {
  const app = new Hono()

  app.use(logger())

  app.use('/*', cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }))

  app.route('/api/characters', charactersRoute)
  app.route('/api/chats', chatsRoute)
  app.route('/api/worlds', worldsRoute)
  app.route('/api/presets', presetsRoute)
  app.route('/api/engine', engineRoute)

  app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

  app.onError(appErrorHandler)

  app.notFound((c) => {
    return c.json({ error: `Not Found: ${c.req.method} ${c.req.path}` }, 404)
  })

  return app
}
