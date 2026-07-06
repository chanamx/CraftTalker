import { Hono } from 'hono'
import type { Context } from 'hono'
import { createBlockedCompatCapability } from '../lib/st-compat-capabilities.js'
import {
  ST_IMAGE_BACKEND_ALLOWLIST_ENV,
  ST_IMAGE_BACKEND_PING_ENABLED_ENV,
  getStImageBackendPolicy,
} from '../lib/st-proxy-policy.js'

const stSdRoute = new Hono()

function blockedSdProxy(feature: string, reason = 'no trusted image-backend proxy boundary is configured') {
  const payload = createBlockedCompatCapability({
    capabilityId: 'image-backend-proxy',
    feature,
    reason,
    trustRequirement: `Set ${ST_IMAGE_BACKEND_PING_ENABLED_ENV}=true and restrict ${ST_IMAGE_BACKEND_ALLOWLIST_ENV} to trusted SD/Comfy origins before forwarding plugin ping requests.`,
  })
  return { ...payload, message: payload.error }
}

function getTargetUrl(payload: unknown): URL | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const raw = (payload as Record<string, unknown>).url
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return {}
  }
}

function getAuthHeader(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const auth = String((payload as Record<string, unknown>).auth ?? '').trim()
  return auth ? { Authorization: `Basic ${Buffer.from(auth, 'utf8').toString('base64')}` } : {}
}

async function pingBackend(target: URL, path: string, headers: Record<string, string>) {
  const url = new URL(path.replace(/^\//, ''), `${target.origin}/`)
  return fetch(url, {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(5_000),
  })
}

async function handlePing(c: Context, feature: string, path: string) {
  const policy = getStImageBackendPolicy()
  if (!policy.pingEnabled) return c.json(blockedSdProxy(feature, 'image backend ping is disabled by default'), 501)
  if (policy.allowedOrigins.length === 0) return c.json(blockedSdProxy(feature, 'no trusted image backend allowlist is configured'), 501)

  const payload = await readJson(c)
  const target = getTargetUrl(payload)
  if (!target) return c.json(blockedSdProxy(feature, 'target URL is missing or invalid'), 400)
  if (!policy.allowedOrigins.includes(target.origin)) {
    return c.json(blockedSdProxy(feature, 'target origin is not in the trusted allowlist'), 403)
  }

  try {
    const response = await pingBackend(target, path, getAuthHeader(payload))
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return c.json({ success: false, error: text || `HTTP ${response.status}` }, 502)
    }
    return c.json({ success: true, ok: true })
  } catch {
    return c.json({ success: false, error: `${feature} upstream ping failed.` }, 502)
  }
}

stSdRoute.post('/comfy/ping', (c) => handlePing(c, 'SillyTavern ComfyUI proxy', '/system_stats'))
stSdRoute.all('/comfy/*', (c) => c.json(blockedSdProxy('SillyTavern ComfyUI proxy'), 501))
stSdRoute.post('/ping', (c) => handlePing(c, 'SillyTavern Stable Diffusion proxy', '/sdapi/v1/sd-models'))
stSdRoute.all('/ping', (c) => c.json(blockedSdProxy('SillyTavern Stable Diffusion proxy'), 501))
stSdRoute.all('/*', (c) => c.json(blockedSdProxy('SillyTavern Stable Diffusion proxy'), 501))

export { stSdRoute }
