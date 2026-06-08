export interface LlmKeySession {
  sessionId: string
  label?: string
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  hasApiKey: boolean
}

interface StoredLlmKeySession extends LlmKeySession {
  apiKey: string
}

const sessions = new Map<string, StoredLlmKeySession>()

function toPublicSession(session: StoredLlmKeySession): LlmKeySession {
  const { apiKey: _apiKey, ...publicSession } = session
  return publicSession
}

export function createLlmKeySession(input: { apiKey: string; label?: string }): LlmKeySession {
  const now = new Date().toISOString()
  const session: StoredLlmKeySession = {
    sessionId: crypto.randomUUID(),
    label: input.label,
    apiKey: input.apiKey,
    createdAt: now,
    updatedAt: now,
    hasApiKey: input.apiKey.length > 0,
  }
  sessions.set(session.sessionId, session)
  return toPublicSession(session)
}

export function getLlmKeySession(sessionId: string): LlmKeySession | null {
  const session = sessions.get(sessionId)
  return session ? toPublicSession(session) : null
}

export function resolveLlmSessionApiKey(sessionId: string): string | null {
  const session = sessions.get(sessionId)
  if (!session) return null

  const now = new Date().toISOString()
  session.lastUsedAt = now
  session.updatedAt = now
  return session.apiKey
}

export function deleteLlmKeySession(sessionId: string): boolean {
  return sessions.delete(sessionId)
}

export function clearLlmKeySessionsForTest(): void {
  if (process.env.NODE_ENV === 'test') {
    sessions.clear()
  }
}
