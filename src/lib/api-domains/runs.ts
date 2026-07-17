import { request } from '@/lib/api-client'
import type {
  GenerationRunFilters,
  GenerationRunRecord,
  GenerationRunSummaryFilters,
  GenerationRunSummaryPage,
  StGenerationFinalization,
} from '@/lib/api-types'

export const runsApi = {
  list: (filters?: GenerationRunSummaryFilters) => {
    const params = new URLSearchParams()
    if (filters?.characterName) params.set('characterName', filters.characterName)
    if (filters?.chatId) params.set('chatId', filters.chatId)
    if (filters?.status) params.set('status', filters.status)
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit))
    if (filters?.cursor) params.set('cursor', filters.cursor)
    const query = params.toString()
    return request<GenerationRunSummaryPage>(`/runs${query ? `?${query}` : ''}`)
  },
  listLegacy: (filters?: GenerationRunFilters) => {
    const params = new URLSearchParams({ view: 'legacy' })
    if (filters?.characterName) params.set('characterName', filters.characterName)
    if (filters?.chatId) params.set('chatId', filters.chatId)
    if (filters?.status) params.set('status', filters.status)
    return request<GenerationRunRecord[]>(`/runs?${params.toString()}`)
  },
  listSummaries: (filters?: GenerationRunSummaryFilters) => {
    const params = new URLSearchParams({ view: 'summary' })
    if (filters?.characterName) params.set('characterName', filters.characterName)
    if (filters?.chatId) params.set('chatId', filters.chatId)
    if (filters?.status) params.set('status', filters.status)
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit))
    if (filters?.cursor) params.set('cursor', filters.cursor)
    return request<GenerationRunSummaryPage>(`/runs?${params.toString()}`)
  },
  get: (runId: string) =>
    request<GenerationRunRecord>(`/runs/${encodeURIComponent(runId)}`),
  getLegacy: (runId: string) =>
    request<GenerationRunRecord>(`/runs/${encodeURIComponent(runId)}?view=legacy`),
  getProjected: (runId: string) =>
    request<GenerationRunRecord>(`/runs/${encodeURIComponent(runId)}?view=projection`),
  commit: (runId: string) =>
    request<GenerationRunRecord>(`/runs/${encodeURIComponent(runId)}/commit`, {
      method: 'POST',
    }),
  discard: (runId: string) =>
    request<GenerationRunRecord>(`/runs/${encodeURIComponent(runId)}/discard`, {
      method: 'POST',
    }),
  finalizeStOutput: (runId: string, content: string) =>
    request<StGenerationFinalization>(`/runs/${encodeURIComponent(runId)}/finalize-st-output`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
}
