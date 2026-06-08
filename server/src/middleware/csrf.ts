import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { isAllowedOrigin } from '../config/origins.js'

export const csrfMiddleware = csrf({
  origin: isAllowedOrigin,
})

/**
 * Apply CSRF protection to routes that need it.
 * Test and development builds skip this middleware so local tooling stays simple.
 */
export function applyCsrf(app: Hono) {
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return
  }

  app.use('*', csrfMiddleware)
}
