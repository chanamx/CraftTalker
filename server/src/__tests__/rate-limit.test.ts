import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { clearRateLimitBucketsForTest, createRateLimitMiddleware, getRateLimitBucketCountForTest } from '../middleware/rate-limit.js'

describe('request rate limiting', () => {
  it('returns 429 after the configured number of requests in a window', async () => {
    const app = new Hono()
    app.use('*', createRateLimitMiddleware({ limit: 2, windowMs: 60_000 }))
    app.get('/', (c) => c.text('ok'))

    expect((await app.request('/')).status).toBe(200)
    expect((await app.request('/')).status).toBe(200)
    expect((await app.request('/')).status).toBe(429)
  })
})


it('isolates trusted proxy client addresses and bounds bucket growth', async () => {
  process.env.CRAFTTALKER_TRUST_PROXY = 'true'
  clearRateLimitBucketsForTest()
  const app = new Hono()
  app.use('*', createRateLimitMiddleware({ limit: 1, windowMs: 60_000, maxBuckets: 2 }))
  app.get('/', (c) => c.text('ok'))
  expect((await app.request('/', { headers: { 'x-real-ip': '203.0.113.1' } })).status).toBe(200)
  expect((await app.request('/', { headers: { 'x-real-ip': '203.0.113.2' } })).status).toBe(200)
  expect((await app.request('/', { headers: { 'x-real-ip': '203.0.113.3' } })).status).toBe(200)
  expect(getRateLimitBucketCountForTest()).toBeLessThanOrEqual(2)
  delete process.env.CRAFTTALKER_TRUST_PROXY
})
