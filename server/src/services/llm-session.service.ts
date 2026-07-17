import { resolveRuntimeOwnerId } from '../config/runtime.js'
import { createError, ErrorCode } from '../lib/errors.js'
import {
  clearLlmKeyVaultForTest,
  getLlmKeyVaultRecords,
  persistLlmKeyVault,
  resetLlmKeyVaultForTest,
  type VaultSessionRecord,
} from './llm-key-vault.js'

export interface LlmKeySession {
  sessionId: string
  label?: string
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  expiresAt: string
  usageCount: number
  hasApiKey: boolean
}

type StoredLlmKeySession = VaultSessionRecord
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000
const DEFAULT_MAX_PER_OWNER = 64
const DEFAULT_MAX_TOTAL = 1_024

export interface LlmSessionContext {
  ownerId: string
  now?: number
  ttlMs?: number
  maxPerOwner?: number
  maxTotal?: number
}

interface ResolvedSessionContext { ownerId: string; now: number; ttlMs: number; maxPerOwner: number; maxTotal: number }

function contextOrDefault(context?: LlmSessionContext): ResolvedSessionContext {
  return {
    ownerId: context?.ownerId ?? resolveRuntimeOwnerId(),
    now: context?.now ?? Date.now(),
    ttlMs: context?.ttlMs ?? DEFAULT_TTL_MS,
    maxPerOwner: Math.max(1, Math.floor(context?.maxPerOwner ?? DEFAULT_MAX_PER_OWNER)),
    maxTotal: Math.max(1, Math.floor(context?.maxTotal ?? DEFAULT_MAX_TOTAL)),
  }
}

function sweepExpiredSessions(now: number): void {
  const sessions = getLlmKeyVaultRecords()
  let changed = false
  for (const [sessionId, session] of sessions) {
    if (Date.parse(session.expiresAt) <= now) {
      sessions.delete(sessionId)
      changed = true
    }
  }
  if (changed) persistLlmKeyVault()
}

function assertSessionCapacity(context: ResolvedSessionContext): void {
  sweepExpiredSessions(context.now)
  const sessions = getLlmKeyVaultRecords()
  const ownerCount = [...sessions.values()].filter(session => session.ownerId === context.ownerId).length
  if (ownerCount >= context.maxPerOwner || sessions.size >= context.maxTotal) {
    throw createError(ErrorCode.CONFLICT, 'LLM key session limit reached', { maxPerOwner: context.maxPerOwner, maxTotal: context.maxTotal })
  }
}

function toPublicSession(session: StoredLlmKeySession): LlmKeySession {
  return {
    sessionId: session.sessionId,
    label: session.label,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    usageCount: session.usageCount,
    hasApiKey: session.hasApiKey,
  }
}

export function createLlmKeySession(input: { apiKey: string; label?: string }, context?: LlmSessionContext): LlmKeySession {
  const resolved = contextOrDefault(context)
  assertSessionCapacity(resolved)
  const now = new Date(resolved.now).toISOString()
  const session: StoredLlmKeySession = {
    sessionId: crypto.randomUUID(),
    label: input.label,
    apiKey: input.apiKey,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(resolved.now + resolved.ttlMs).toISOString(),
    usageCount: 0,
    hasApiKey: input.apiKey.length > 0,
    ownerId: resolved.ownerId,
  }
  getLlmKeyVaultRecords().set(session.sessionId, session)
  persistLlmKeyVault()
  return toPublicSession(session)
}

export function getLlmKeySession(sessionId: string, context?: LlmSessionContext): LlmKeySession | null {
  const resolved = contextOrDefault(context)
  const sessions = getLlmKeyVaultRecords()
  const session = sessions.get(sessionId)
  if (!session || session.ownerId !== resolved.ownerId) return null
  if (Date.parse(session.expiresAt) <= resolved.now) {
    sessions.delete(sessionId)
    persistLlmKeyVault()
    return null
  }
  return toPublicSession(session)
}

export function resolveLlmSessionApiKey(sessionId: string, context?: LlmSessionContext): string | null {
  const resolved = contextOrDefault(context)
  const sessions = getLlmKeyVaultRecords()
  const session = sessions.get(sessionId)
  if (!session || session.ownerId !== resolved.ownerId) return null
  if (Date.parse(session.expiresAt) <= resolved.now) {
    sessions.delete(sessionId)
    persistLlmKeyVault()
    return null
  }

  const now = new Date(resolved.now).toISOString()
  session.lastUsedAt = now
  session.updatedAt = now
  session.usageCount += 1
  persistLlmKeyVault()
  return session.apiKey
}

export function deleteLlmKeySession(sessionId: string, context?: LlmSessionContext): boolean {
  const resolved = contextOrDefault(context)
  const sessions = getLlmKeyVaultRecords()
  const session = sessions.get(sessionId)
  if (!session || session.ownerId !== resolved.ownerId) return false
  const deleted = sessions.delete(sessionId)
  if (deleted) persistLlmKeyVault()
  return deleted
}

export function clearLlmKeySessionsForTest(): void {
  if (process.env.NODE_ENV === 'test') {
    clearLlmKeyVaultForTest()
  }
}

export function resetLlmSessionVaultForTest(): void {
  resetLlmKeyVaultForTest()
}
