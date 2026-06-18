import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { charactersRoute } from './routes/characters.js'
import { chatsRoute } from './routes/chats.js'
import { worldsRoute } from './routes/worlds.js'
import { presetsRoute } from './routes/presets.js'
import { engineRoute } from './routes/engine.js'
import { runsRoute } from './routes/runs.js'
import { llmSessionsRoute } from './routes/llm-sessions.js'
import { llmRoutes } from './routes/llm.routes.js'
import { extensionsRoute } from './routes/extensions.js'
import { appErrorHandler } from './middleware/errorHandler.js'
import { applyCsrf } from './middleware/csrf.js'
import { corsOrigin } from './config/origins.js'
import {
  readExtensionResource,
  readPublicRootScriptResource,
  readPublicScriptResource,
} from './services/extension.service.js'
import { AppError, ErrorCode, createError } from './lib/errors.js'

function getExtensionCompatShim(resourcePath: string): string | null {
  const normalized = resourcePath.replaceAll('\\', '/')
  const fileName = normalized.split('/').pop() ?? ''
  const compatPath = getCompatPath(normalized, fileName)

  if (compatPath) return reExportCompat(compatPath)

  const slashCommandMatch = normalized.match(/(?:^|\/)slash-commands\/([^/]+\.js)$/)
  if (slashCommandMatch?.[1]) {
    const file = encodeURIComponent(slashCommandMatch[1])
    return reExportCompat(`slash-commands/${file}`)
  }

  return null
}

function getCompatPath(normalized: string, fileName: string): string | null {
  if (normalized.endsWith('extensions/regex/engine.js') || normalized.endsWith('regex/engine.js')) {
    return 'extensions/regex/engine.js'
  }
  if (normalized.endsWith('macros/engine/MacroRegistry.js')) {
    return 'macros/engine/MacroRegistry.js'
  }
  if (normalized.endsWith('util/AccountStorage.js')) {
    return 'util/AccountStorage.js'
  }

  const commonShimNames = new Set([
    'RossAscends-mods.js',
    'PromptManager.js',
    'authors-note.js',
    'constants.js',
    'custom-request.js',
    'events.js',
    'extensions.js',
    'group-chats.js',
    'i18n.js',
    'lib.js',
    'macros.js',
    'openai.js',
    'personas.js',
    'popup.js',
    'power-user.js',
    'preset-manager.js',
    'script.js',
    'char-data.js',
    'reasoning.js',
    'sse-stream.js',
    'st-context.js',
    'templates.js',
    'tokenizers.js',
    'user.js',
    'utils.js',
    'variables.js',
    'world-info.js',
  ])
  return commonShimNames.has(fileName) ? fileName : null
}

function reExportCompat(compatPath: string): string {
  return `export * from '/scripts/compat/${compatPath}';\nexport { default } from '/scripts/compat/${compatPath}';\n`
}

export function createApp() {
  const app = new Hono()

  app.use(logger())

  app.use('/*', cors({
    origin: corsOrigin,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }))

  app.get('/scripts/extensions/*', async (c) => {
    const resourcePath = c.req.path.replace(/^\/scripts\/extensions\//, '')
    try {
      const resource = await readExtensionResource(resourcePath)
      c.header('Content-Type', resource.contentType)
      c.header('Cache-Control', 'no-cache')
      return c.body(resource.body)
    } catch (error) {
      if (!(error instanceof AppError && error.code === ErrorCode.NOT_FOUND)) {
        throw error
      }
    }

    const shim = getExtensionCompatShim(resourcePath)
    if (!shim) {
      throw createError(ErrorCode.NOT_FOUND, 'Extension resource was not found')
    }

    c.header('Content-Type', 'text/javascript; charset=utf-8')
    c.header('Cache-Control', 'no-cache')
    return c.body(shim)
  })

  app.get('/scripts/*', async (c) => {
    const resourcePath = c.req.path.replace(/^\/scripts\//, '')
    const resource = await readPublicScriptResource(resourcePath)
    c.header('Content-Type', resource.contentType)
    c.header('Cache-Control', 'no-cache')
    return c.body(resource.body)
  })

  app.get('/:script{(?:script|lib|char-data|reasoning)\\.js}', async (c) => {
    const resource = await readPublicRootScriptResource(c.req.param('script'))
    c.header('Content-Type', resource.contentType)
    c.header('Cache-Control', 'no-cache')
    return c.body(resource.body)
  })

  // CSRF protection applies to this routed API app in production.
  const protectedApp = new Hono()
  applyCsrf(protectedApp)
  protectedApp.route('/api/characters', charactersRoute)
  protectedApp.route('/api/chats', chatsRoute)
  protectedApp.route('/api/worlds', worldsRoute)
  protectedApp.route('/api/presets', presetsRoute)
  protectedApp.route('/api/engine', engineRoute)
  protectedApp.route('/api/runs', runsRoute)
  protectedApp.route('/api/llm-sessions', llmSessionsRoute)
  protectedApp.route('/api/llm', llmRoutes)
  protectedApp.route('/api/extensions', extensionsRoute)

  app.route('/', protectedApp)

  app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

  app.onError(appErrorHandler)

  app.notFound((c) => {
    return c.json({ error: `Not Found: ${c.req.method} ${c.req.path}` }, 404)
  })

  return app
}
