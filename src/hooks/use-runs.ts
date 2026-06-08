import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type GenerationRunRecord } from '@/lib/api'

const RECOVERABLE_STATUSES = new Set(['failed', 'canceled', 'interrupted'])

export function useRecoverableRuns(characterName: string | null, chatId: string | null) {
  return useQuery<GenerationRunRecord[]>({
    queryKey: ['runs', characterName, chatId, 'recoverable'],
    queryFn: async () => {
      const runs = await api.runs.list({
        characterName: characterName!,
        chatId: chatId!,
      })
      return runs.filter(run =>
        RECOVERABLE_STATUSES.has(run.status)
        && run.partialContent.trim().length > 0
        && run.committedLineIndex === undefined
      )
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
