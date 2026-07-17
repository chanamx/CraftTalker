import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError, api, type GenerationRunRecord } from '@/lib/api'

const RECOVERABLE_STATUSES = new Set(['failed', 'canceled', 'interrupted'])
const RECOVERABLE_STATUS_LIST = ['failed', 'canceled', 'interrupted'] as const

export function useRecoverableRuns(characterName: string | null, chatId: string | null) {
  return useQuery<GenerationRunRecord[]>({
    queryKey: ['runs', characterName, chatId, 'recoverable'],
    queryFn: async () => {
      const filters = { characterName: characterName!, chatId: chatId! }
      try {
        const pages = await Promise.all(RECOVERABLE_STATUS_LIST.map(status =>
          api.runs.list({ ...filters, status, limit: 10 })
        ))
        const summaries = pages
          .flatMap(page => page.items)
          .filter(run => run.hasPartialContent && run.committedLineIndex === undefined)
          .sort((left, right) => right.lastJournalSeq - left.lastJournalSeq)
        const details = await Promise.all(summaries.map(run => api.runs.get(run.runId)))
        return details.filter(run => run.partialContent.trim().length > 0)
      } catch (error) {
        if (!(error instanceof ApiRequestError) || error.statusCode !== 503) throw error
        const runs = await api.runs.listLegacy(filters)
        return runs.filter(run =>
          RECOVERABLE_STATUSES.has(run.status)
          && run.partialContent.trim().length > 0
          && run.committedLineIndex === undefined
        )
      }
    },
    enabled: !!characterName && !!chatId,
  })
}

export function useCommitRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => api.runs.commit(runId),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['runs', run.characterName, run.chatId] })
      qc.invalidateQueries({ queryKey: ['chats', run.characterName, run.chatId] })
    },
  })
}

export function useDiscardRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => api.runs.discard(runId),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['runs', run.characterName, run.chatId] })
    },
  })
}
