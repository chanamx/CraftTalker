import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { csrf } from 'hono/csrf'
import { isAllowedOrigin } from '../config/origins.js'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const csrfMiddleware = csrf({
  origin: isAllowedOrigin,
})

export const unsafeOriginMiddleware: MiddlewareHandler = async (c, next) => {
  if (!UNSAFE_METHODS.has(c.req.method.toUpperCase())) {
    await next()
    return
  }

  const origin = c.req.header('Origin')
  if (origin && !isAllowedOrigin(origin)) {
    return c.json({ error: 'Forbidden origin' }, 403)
  }

  if (!origin && c.req.header('Sec-Fetch-Site') === 'cross-site') {
    return c.json({ error: 'Forbidden origin' }, 403)
  }

  await next()
}

/**
 * Apply CSRF protection to routes that need it.
 * Tests skip this middleware. Development keeps origin protection enabled so a
 * LAN-exposed dev server does not silently become a cross-site write target.
 */
export function applyCsrf(app: Hono) {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  app.use('*', csrfMiddleware)
  app.use('*', unsafeOriginMiddleware)
}
