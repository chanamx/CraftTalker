import { createHash } from 'node:crypto'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context, MiddlewareHandler } from 'hono'

interface RateLimitOptions {
  limit: number
  windowMs: number
  maxBuckets?: number
  key?: (context: Context) => string
}

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
let requestsSinceSweep = 0

function credentialClass(c: Context): string {
  return c.req.header('Authorization') || c.req.header('Cookie') ? 'credentialed' : 'anonymous'
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function defaultKey(c: Context): string {
  const kind = credentialClass(c)
  if (process.env.CRAFTTALKER_TRUST_PROXY === 'true') {
    const forwarded = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || c.req.header('x-forwarded-for')?.split(',', 1)[0]?.trim()
    return `${kind}:${shortHash(forwarded || 'unknown-proxy-client')}`
  }
  try {
    const remote = getConnInfo(c).remote.address
    if (remote) return `${kind}:${shortHash(remote)}`
  } catch { /* synthetic Hono requests have no Node connection info */ }
  return `${kind}:anonymous`
}

function sweepExpired(now: number): void {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key)
}

function enforceBucketLimit(maxBuckets: number): void {
  while (buckets.size >= maxBuckets) {
    let oldestKey: string | undefined
    let oldestReset = Number.POSITIVE_INFINITY
    for (const [key, bucket] of buckets) if (bucket.resetAt < oldestReset) { oldestKey = key; oldestReset = bucket.resetAt }
    if (!oldestKey) return
    buckets.delete(oldestKey)
  }
}

export function createRateLimitMiddleware(options: RateLimitOptions): MiddlewareHandler {
  const limit = Math.max(1, Math.floor(options.limit))
  const windowMs = Math.max(1_000, Math.floor(options.windowMs))
  const maxBuckets = Math.max(1, Math.floor(options.maxBuckets ?? 10_000))
  const keyFor = options.key ?? defaultKey
  return async (c, next) => {
    const now = Date.now()
    requestsSinceSweep += 1
    if (requestsSinceSweep >= 256) { sweepExpired(now); requestsSinceSweep = 0 }
    const key = keyFor(c)
    const current = buckets.get(key)
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
    if (!current || current.resetAt <= now) { enforceBucketLimit(maxBuckets); buckets.set(key, bucket) }
    bucket.count += 1
    if (bucket.count > limit) {
      c.header('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))))
      return c.json({ error: 'Too many requests' }, 429)
    }
    await next()
  }
}

export function clearRateLimitBucketsForTest(): void { buckets.clear(); requestsSinceSweep = 0 }
export function getRateLimitBucketCountForTest(): number { return buckets.size }
