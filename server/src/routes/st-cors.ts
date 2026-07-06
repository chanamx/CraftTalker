import { Hono } from 'hono'
import * as dns from 'node:dns/promises'
import net from 'node:net'
import { createBlockedCompatCapability } from '../lib/st-compat-capabilities.js'
import {
  ST_CORS_PROXY_ALLOWLIST_ENV,
  ST_CORS_PROXY_ENABLED_ENV,
  ST_CORS_PROXY_MAX_BYTES,
  getStCorsProxyPolicy,
  normalizeCorsProxyHost,
} from '../lib/st-proxy-policy.js'

const stCorsRoute = new Hono()

const ALLOWED_CONTENT_TYPES = [
  'application/javascript',
  'application/json',
  'application/xml',
  'image/svg+xml',
  'text/',
]

function blocked(reason: string, status = 501, details?: Record<string, unknown>) {
  return Response.json(createBlockedCompatCapability({
    capabilityId: 'network-proxy',
    feature: 'SillyTavern generic CORS proxy',
    reason,
    trustRequirement: `Set ${ST_CORS_PROXY_ENABLED_ENV}=true and restrict ${ST_CORS_PROXY_ALLOWLIST_ENV} to trusted remote hostnames.`,
    details,
  }), { status })
}

function getTargetUrlFromProxyPath(requestUrl: string): URL | null {
  const url = new URL(requestUrl)
  const rawPath = url.pathname.replace(/^\/cors\/?/, '')
  if (!rawPath) return null

  try {
    return new URL(`${decodeURIComponent(rawPath)}${url.search}`)
  } catch {
    return null
  }
}

function hostMatchesAllowlist(hostname: string, allowedHosts: string[]): boolean {
  const host = normalizeCorsProxyHost(hostname)
  return allowedHosts.some((entry) => {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1)
      return host.endsWith(suffix) && host.length > suffix.length
    }
    return host === entry
  })
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  if (a === undefined || b === undefined) return true

  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('::ffff:')) return isPrivateIpv4(normalized.slice('::ffff:'.length))

  const first = Number.parseInt(normalized.split(':')[0] || '0', 16)
  if (!Number.isFinite(first)) return true
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80
}

export function isPrivateNetworkAddress(address: string): boolean {
  const type = net.isIP(address)
  if (type === 4) return isPrivateIpv4(address)
  if (type === 6) return isPrivateIpv6(address)
  return true
}

async function assertPublicTargetAddress(target: URL): Promise<void> {
  const hostname = normalizeCorsProxyHost(target.hostname)
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('localhost hostnames are not allowed')
  }

  if (net.isIP(hostname)) {
    if (isPrivateNetworkAddress(hostname)) throw new Error('private or reserved IP addresses are not allowed')
    return
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0) throw new Error('target hostname did not resolve')
  if (addresses.some((entry) => isPrivateNetworkAddress(entry.address))) {
    throw new Error('target hostname resolves to a private or reserved address')
  }
}

function isAllowedContentType(contentType: string): boolean {
  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return ALLOWED_CONTENT_TYPES.some((allowed) => (
    allowed.endsWith('/') ? normalized.startsWith(allowed) : normalized === allowed
  ))
}

function contentLengthExceedsLimit(contentLength: string | null): boolean {
  if (!contentLength) return false
  const bytes = Number(contentLength)
  return Number.isFinite(bytes) && bytes > ST_CORS_PROXY_MAX_BYTES
}

stCorsRoute.all('/*', async (c) => {
  const policy = getStCorsProxyPolicy()
  if (!policy.enabled) return blocked('proxy is disabled by default')
  if (policy.allowedHosts.length === 0) return blocked('no trusted host allowlist is configured')
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return blocked('only GET and HEAD requests are supported', 405, { method: c.req.method })
  }

  const target = getTargetUrlFromProxyPath(c.req.url)
  if (!target) return blocked('target URL is missing or invalid', 400)
  if (target.protocol !== 'https:') return blocked('only https target URLs are supported', 400, { protocol: target.protocol })
  if (target.username || target.password) return blocked('target URL credentials are not allowed', 400)
  if (!hostMatchesAllowlist(target.hostname, policy.allowedHosts)) {
    return blocked('target host is not in the trusted allowlist', 403, { host: target.hostname })
  }

  try {
    await assertPublicTargetAddress(target)
  } catch (error) {
    return blocked(error instanceof Error ? error.message : 'target address failed safety checks', 403, { host: target.hostname })
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: c.req.method,
      headers: { Accept: 'text/html,text/plain,text/css,application/json,application/javascript,*/*;q=0.5' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return Response.json({
      success: false,
      error: 'SillyTavern generic CORS proxy upstream request failed.',
    }, { status: 502 })
  }

  const contentType = upstream.headers.get('Content-Type') ?? ''
  if (contentType && !isAllowedContentType(contentType)) {
    return blocked('upstream content type is not allowed', 415, { contentType })
  }
  if (contentLengthExceedsLimit(upstream.headers.get('Content-Length'))) {
    return blocked('upstream response is too large', 413, { maxBytes: policy.maxBytes })
  }
  if (c.req.method === 'HEAD') {
    return new Response(null, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': contentType || 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  const body = Buffer.from(await upstream.arrayBuffer())
  if (body.byteLength > policy.maxBytes) {
    return blocked('upstream response is too large', 413, { maxBytes: policy.maxBytes })
  }

  return new Response(body, {
    status: upstream.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': contentType || 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

export { stCorsRoute }
