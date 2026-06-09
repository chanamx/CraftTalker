import { request } from '@/lib/api-client'
import type { LlmKeySession, LlmKeySessionCreateInput } from '@/lib/api-types'

export const llmSessionsApi = {
  create: (input: LlmKeySessionCreateInput) =>
    request<LlmKeySession>('/llm-sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  get: (sessionId: string) =>
    request<LlmKeySession>(`/llm-sessions/${encodeURIComponent(sessionId)}`),
  delete: (sessionId: string) =>
    request<{ success: boolean }>(`/llm-sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    }),
}
