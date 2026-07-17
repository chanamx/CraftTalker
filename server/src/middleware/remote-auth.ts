import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import type { RuntimeConfig } from '../config/runtime.js'

const COOKIE_NAME = 'crafttalker_remote_session'
const SESSION_TTL_SECONDS = 12 * 60 * 60
const encoder = new TextEncoder()

const loginSchema = z.object({
  token: z.string().min(1).max(4096),
}).strict()

function safeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes)
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function createSessionValue(secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_TTL_SECONDS * 1000 })).toString('base64url')
  return `${payload}.${signPayload(payload, secret)}`
}

function isValidSessionValue(value: string | undefined, secret: string, now = Date.now()): boolean {
  if (!value) return false
  const separator = value.lastIndexOf('.')
  if (separator <= 0) return false
  const payload = value.slice(0, separator)
  const signature = value.slice(separator + 1)
  if (!safeEqual(signature, signPayload(payload, secret))) return false

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof parsed.exp === 'number' && Number.isFinite(parsed.exp) && parsed.exp > now
  } catch {
    return false
  }
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() || null
}

function isAuthenticated(config: RuntimeConfig, authorization: string | undefined, cookie: string | undefined): boolean {
  if (!config.requiresAuthentication) return true
  const secret = config.remoteAccessToken
  if (!secret) return false
  const bearer = bearerToken(authorization)
  return (bearer !== null && safeEqual(bearer, secret)) || isValidSessionValue(cookie, secret)
}

export function remoteAccessMiddleware(config: RuntimeConfig): MiddlewareHandler {
  return async (c, next) => {
    if (isAuthenticated(config, c.req.header('Authorization'), getCookie(c, COOKIE_NAME))) {
      await next()
      return
    }
    return c.json({ error: 'Authentication required' }, 401)
  }
}

export function createRemoteAuthRoute(config: RuntimeConfig): Hono {
  const route = new Hono()

  route.get('/session', (c) => c.json({
    mode: config.mode,
    authenticated: isAuthenticated(config, c.req.header('Authorization'), getCookie(c, COOKIE_NAME)),
  }))

  route.post('/session', async (c) => {
    if (!config.requiresAuthentication) return c.body(null, 204)
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success || !config.remoteAccessToken || !safeEqual(parsed.data.token, config.remoteAccessToken)) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    setCookie(c, COOKIE_NAME, createSessionValue(config.remoteAccessToken), {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    })
    return c.body(null, 204)
  })

  route.delete('/session', (c) => {
    deleteCookie(c, COOKIE_NAME, {
      secure: true,
      sameSite: 'Strict',
      path: '/',
    })
    return c.body(null, 204)
  })

  return route
}
