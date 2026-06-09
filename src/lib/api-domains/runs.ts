import { request } from '@/lib/api-client'
import type { GenerationRunFilters, GenerationRunRecord } from '@/lib/api-types'

export const runsApi = {
  list: (filters?: GenerationRunFilters) => {
    const params = new URLSearchParams()
    if (filters?.characterName) params.set('characterName', filters.characterName)
    if (filters?.chatId) params.set('chatId', filters.chatId)
    if (filters?.status) params.set('status', filters.status)
    const query = params.toString()
    return request<GenerationRunRecord[]>(`/runs${query ? `?${query}` : ''}`)
  },
  get: (runId: string) =>
    request<GenerationRunRecord>(`/runs/${encodeURIComponent(runId)}`),
  commit: (runId: string) =>
    request<GenerationRunRecord>(`/runs/${encodeURIComponent(runId)}/commit`, {
      method: 'POST',
    }),
  discard: (runId: string) =>
    request<GenerationRunRecord>(`/runs/${encodeURIComponent(runId)}/discard`, {
      method: 'POST',
    }),
}
