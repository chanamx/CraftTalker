import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { charactersRoute } from './routes/characters.js'
import { chatsRoute } from './routes/chats.js'
import { worldsRoute } from './routes/worlds.js'
import { presetsRoute } from './routes/presets.js'
import { engineRoute } from './routes/engine.js'
import { appErrorHandler } from './middleware/errorHandler.js'
import { applyCsrf } from './middleware/csrf.js'

export function createApp() {
  const app = new Hono()

  app.use(logger())

  app.use('/*', cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }))

  // CSRF 保护：仅应用到状态变更路由（POST/PATCH/DELETE）
  const protectedApp = new Hono()
  applyCsrf(protectedApp)
  protectedApp.route('/api/characters', charactersRoute)
  protectedApp.route('/api/chats', chatsRoute)
  protectedApp.route('/api/worlds', worldsRoute)
  protectedApp.route('/api/presets', presetsRoute)
  protectedApp.route('/api/engine', engineRoute)

  app.route('/', protectedApp)

  app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

  app.onError(appErrorHandler)

  app.notFound((c) => {
    return c.json({ error: `Not Found: ${c.req.method} ${c.req.path}` }, 404)
  })

  return app
}
