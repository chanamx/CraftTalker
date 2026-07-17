import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { resolveRuntimeConfig } from '../config/runtime.js'
import { clearRateLimitBucketsForTest } from '../middleware/rate-limit.js'

const ENV_KEYS = [
  'HOST',
  'CRAFTTALKER_RUNTIME_MODE',
  'CRAFTTALKER_REMOTE_ACCESS_TOKEN',
  'CRAFTTALKER_DISABLE_CSRF',
] as const

const previousEnvironment = Object.fromEntries(
  ENV_KEYS.map(key => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>

afterEach(() => {
  clearRateLimitBucketsForTest()
  process.env.NODE_ENV = 'test'
  for (const key of ENV_KEYS) {
    const previous = previousEnvironment[key]
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  }
})

describe('runtime security configuration', () => {
  it('defaults to local mode on the IPv4 loopback interface', () => {
    delete process.env.HOST
    delete process.env.CRAFTTALKER_RUNTIME_MODE
    delete process.env.CRAFTTALKER_REMOTE_ACCESS_TOKEN

    expect(resolveRuntimeConfig()).toMatchObject({
      mode: 'local',
      hostname: '127.0.0.1',
      requiresAuthentication: false,
    })
  })

  it('rejects remote listening without an access token', () => {
    process.env.HOST = '0.0.0.0'
    delete process.env.CRAFTTALKER_REMOTE_ACCESS_TOKEN

    expect(() => resolveRuntimeConfig()).toThrow(/remote access token/i)
  })

  it('requires bearer authentication for protected APIs in remote mode', async () => {
    process.env.HOST = '0.0.0.0'
    process.env.CRAFTTALKER_RUNTIME_MODE = 'remote'
    process.env.CRAFTTALKER_REMOTE_ACCESS_TOKEN = 'remote-test-token-with-adequate-length'

    const app = createApp()
    const anonymous = await app.request('/api/characters')
    const authenticated = await app.request('/api/characters', {
      headers: { Authorization: 'Bearer remote-test-token-with-adequate-length' },
    })
    const health = await app.request('/api/health')
    const version = await app.request('/version')

    expect(anonymous.status).toBe(401)
    expect(authenticated.status).toBe(200)
    expect(health.status).toBe(200)
    expect(version.status).toBe(200)
  })

  it('authenticates protected APIs before charging the authenticated rate-limit bucket', async () => {
    process.env.HOST = '0.0.0.0'
    process.env.CRAFTTALKER_RUNTIME_MODE = 'remote'
    process.env.CRAFTTALKER_REMOTE_ACCESS_TOKEN = 'remote-test-token-with-adequate-length'
    clearRateLimitBucketsForTest()

    const app = createApp()
    const anonymousStatuses: number[] = []
    for (let index = 0; index < 121; index += 1) {
      anonymousStatuses.push((await app.request('/api/characters')).status)
    }
    const authenticated = await app.request('/api/characters', {
      headers: { Authorization: 'Bearer remote-test-token-with-adequate-length' },
    })

    expect(new Set(anonymousStatuses)).toEqual(new Set([401]))
    expect(authenticated.status).toBe(200)
  })

  it('creates an HttpOnly remote session for browser clients', async () => {
    process.env.HOST = '0.0.0.0'
    process.env.CRAFTTALKER_RUNTIME_MODE = 'remote'
    process.env.CRAFTTALKER_REMOTE_ACCESS_TOKEN = 'remote-test-token-with-adequate-length'

    const app = createApp()
    const login = await app.request('/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({ token: 'remote-test-token-with-adequate-length' }),
    })
    const cookie = login.headers.get('Set-Cookie')

    expect(login.status).toBe(204)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')

    const authenticated = await app.request('/api/characters', {
      headers: { Cookie: cookie?.split(';', 1)[0] ?? '' },
    })
    expect(authenticated.status).toBe(200)
  })

  it('rejects remote login attempts from untrusted browser origins', async () => {
    process.env.NODE_ENV = 'production'
    process.env.HOST = '0.0.0.0'
    process.env.CRAFTTALKER_RUNTIME_MODE = 'remote'
    process.env.CRAFTTALKER_REMOTE_ACCESS_TOKEN = 'remote-test-token-with-adequate-length'

    const response = await createApp().request('/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ token: 'remote-test-token-with-adequate-length' }),
    })

    expect(response.status).toBe(403)
  })

  it('keeps origin protection enabled in development', async () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CRAFTTALKER_DISABLE_CSRF

    const response = await createApp().request('/api/llm-sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ apiKey: 'development-key' }),
    })

    expect(response.status).toBe(403)
  })
})
