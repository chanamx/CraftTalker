import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ChatInfo, type ChatDetail, type LlmRequestConfig, type PresetType, type StCompatGenerationOptions, ApiRequestError } from '@/lib/api'

export function useChats(characterName: string | null) {
  return useQuery<ChatInfo[]>({
    queryKey: ['chats', characterName],
    queryFn: () => api.chats.list(characterName!),
    enabled: !!characterName,
  })
}

export function useChat(characterName: string | null, chatId: string | null) {
  return useQuery<ChatDetail>({
    queryKey: ['chats', characterName, chatId],
    queryFn: () => api.chats.get(characterName!, chatId!),
    enabled: !!characterName && !!chatId,
  })
}

export function useCreateChat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ characterName, userName }: { characterName: string; userName?: string }) =>
      api.chats.create(characterName, userName),
    onSuccess: (_, { characterName }) => {
      qc.invalidateQueries({ queryKey: ['chats', characterName] })
    },
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      characterName,
      chatId,
      content,
    }: {
      characterName: string
      chatId: string
      content: string
    }) => api.chats.sendMessage(characterName, chatId, content),
    onSuccess: (newLine, { characterName, chatId }) => {
      qc.setQueryData<ChatDetail>(['chats', characterName, chatId], (old) => {
        if (!old) return old
        return { ...old, lines: [...old.lines, newLine] }
      })
    },
  })
}

export function useDeleteChat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ characterName, chatId }: { characterName: string; chatId: string }) =>
      api.chats.delete(characterName, chatId),
    onSuccess: (_, { characterName }) => {
      qc.invalidateQueries({ queryKey: ['chats', characterName] })
    },
  })
}

export function useGenerateStream() {
  return useMutation({
    mutationFn: async ({
      characterName,
      chatId,
      config,
      presetType,
      presetName,
      signal,
      genOverrides,
      stCompat,
    }: {
      characterName: string
      chatId: string
      config: LlmRequestConfig
      presetType?: PresetType
      presetName?: string
      signal?: AbortSignal
      genOverrides?: { temperature?: number; topP?: number; contextLength?: number; maxReplyLength?: number }
      stCompat?: StCompatGenerationOptions
    }) => {
      const response = await api.chats.generate(characterName, chatId, config, {
        presetType,
        presetName,
        signal,
        genOverrides,
        stCompat,
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({
          error: 'Stream failed',
          code: -1,
        }))
        throw new ApiRequestError(err, response.status)
      }
      return response
    },
  })
}
