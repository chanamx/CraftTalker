import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  clearLlmKeySessionsForTest,
  createLlmKeySession,
  deleteLlmKeySession,
  getLlmKeySession,
  resolveLlmSessionApiKey,
  resetLlmSessionVaultForTest,
} from '../services/llm-session.service.js'

const testDataDir = path.join(os.tmpdir(), `crafttalker-llm-vault-${crypto.randomUUID()}`)

beforeEach(() => {
  process.env.NODE_ENV = 'test'
  process.env.LUKER_DATA_DIR = testDataDir
  fs.mkdirSync(testDataDir, { recursive: true })
})

afterEach(() => {
  process.env.NODE_ENV = 'test'
  clearLlmKeySessionsForTest()
  resetLlmSessionVaultForTest()
  delete process.env.LUKER_DATA_DIR
  delete process.env.CRAFTTALKER_VAULT_SECRET
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

describe('LLM key session ownership and expiry', () => {
  it('isolates sessions by owner', () => {
    const session = createLlmKeySession(
      { apiKey: 'owner-a-secret' },
      { ownerId: 'owner-a', now: 1_000, ttlMs: 10_000 },
    )

    expect(getLlmKeySession(session.sessionId, { ownerId: 'owner-b', now: 2_000 })).toBeNull()
    expect(resolveLlmSessionApiKey(session.sessionId, { ownerId: 'owner-b', now: 2_000 })).toBeNull()
    expect(deleteLlmKeySession(session.sessionId, { ownerId: 'owner-b', now: 2_000 })).toBe(false)
    expect(resolveLlmSessionApiKey(session.sessionId, { ownerId: 'owner-a', now: 2_000 })).toBe('owner-a-secret')
  })

  it('expires and removes sessions after their TTL', () => {
    const session = createLlmKeySession(
      { apiKey: 'short-lived-secret' },
      { ownerId: 'owner-a', now: 1_000, ttlMs: 500 },
    )

    expect(session.expiresAt).toBe(new Date(1_500).toISOString())
    expect(getLlmKeySession(session.sessionId, { ownerId: 'owner-a', now: 1_501 })).toBeNull()
    expect(resolveLlmSessionApiKey(session.sessionId, { ownerId: 'owner-a', now: 1_501 })).toBeNull()
  })

  it('records successful key usage without exposing the key', () => {
    const session = createLlmKeySession(
      { apiKey: 'usage-secret' },
      { ownerId: 'owner-a', now: 1_000, ttlMs: 10_000 },
    )

    expect(resolveLlmSessionApiKey(session.sessionId, { ownerId: 'owner-a', now: 2_000 })).toBe('usage-secret')
    const publicSession = getLlmKeySession(session.sessionId, { ownerId: 'owner-a', now: 2_000 })

    expect(publicSession).toMatchObject({
      usageCount: 1,
      lastUsedAt: new Date(2_000).toISOString(),
    })
    expect(JSON.stringify(publicSession)).not.toContain('usage-secret')
    expect(publicSession).not.toHaveProperty('ownerId')
  })
})


describe('LLM key session capacity', () => {
  it('cleans expired sessions before enforcing limits', () => {
    createLlmKeySession({ apiKey: 'expired' }, { ownerId: 'owner', now: 1_000, ttlMs: 1, maxPerOwner: 1, maxTotal: 1 })
    expect(() => createLlmKeySession({ apiKey: 'fresh' }, { ownerId: 'owner', now: 2_000, ttlMs: 1_000, maxPerOwner: 1, maxTotal: 1 })).not.toThrow()
  })
  it('rejects new sessions when an owner reaches the active limit', () => {
    createLlmKeySession({ apiKey: 'first' }, { ownerId: 'owner', now: 1_000, ttlMs: 10_000, maxPerOwner: 1, maxTotal: 2 })
    expect(() => createLlmKeySession({ apiKey: 'second' }, { ownerId: 'owner', now: 1_001, ttlMs: 10_000, maxPerOwner: 1, maxTotal: 2 })).toThrow(/limit/i)
  })
})

describe('LLM key session persistence', () => {
  it('creates all vault files with owner-only permissions', () => {
    const openSync = vi.spyOn(fs, 'openSync')
    let vaultWrites: unknown[][] = []
    try {
      createLlmKeySession({ apiKey: 'permission-test-key' }, { ownerId: 'owner-a', now: 1_000, ttlMs: 10_000 })
      vaultWrites = openSync.mock.calls.filter(([filePath]) => String(filePath).includes(`${path.sep}secrets${path.sep}`))
    } finally {
      openSync.mockRestore()
    }

    expect(vaultWrites).toHaveLength(2)
    expect(vaultWrites.every(([, , mode]) => mode === 0o600)).toBe(true)
  })

  it('restores encrypted sessions after the in-memory vault is reset', () => {
    const session = createLlmKeySession({ apiKey: 'persisted-secret' }, { ownerId: 'owner-a', now: 1_000, ttlMs: 10_000 })

    resetLlmSessionVaultForTest()

    expect(resolveLlmSessionApiKey(session.sessionId, { ownerId: 'owner-a', now: 2_000 })).toBe('persisted-secret')
    const vaultFiles = fs.readdirSync(path.join(testDataDir, 'secrets'))
    expect(vaultFiles).toContain('llm-key-vault.json')
    expect(fs.readFileSync(path.join(testDataDir, 'secrets', 'llm-key-vault.json'), 'utf8')).not.toContain('persisted-secret')
  })

  it('requires the configured vault secret to decrypt a secret-backed vault', () => {
    process.env.CRAFTTALKER_VAULT_SECRET = 'vault-secret-for-tests'
    const session = createLlmKeySession({ apiKey: 'secret-backed-key' }, { ownerId: 'owner-a', now: 1_000, ttlMs: 10_000 })

    resetLlmSessionVaultForTest()
    process.env.CRAFTTALKER_VAULT_SECRET = 'wrong-vault-secret'

    expect(() => getLlmKeySession(session.sessionId, { ownerId: 'owner-a', now: 2_000 })).toThrow()
  })

  it('retries loading after an operator restores the correct vault secret', () => {
    process.env.CRAFTTALKER_VAULT_SECRET = 'vault-secret-for-tests'
    const session = createLlmKeySession({ apiKey: 'recoverable-key' }, { ownerId: 'owner-a', now: 1_000, ttlMs: 10_000 })

    resetLlmSessionVaultForTest()
    process.env.CRAFTTALKER_VAULT_SECRET = 'wrong-vault-secret'
    expect(() => getLlmKeySession(session.sessionId, { ownerId: 'owner-a', now: 2_000 })).toThrow()

    process.env.CRAFTTALKER_VAULT_SECRET = 'vault-secret-for-tests'
    expect(resolveLlmSessionApiKey(session.sessionId, { ownerId: 'owner-a', now: 2_000 })).toBe('recoverable-key')
  })
})
