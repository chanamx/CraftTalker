import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCharacters, useCreateCharacter, useUpdateCharacter } from '@/hooks/use-characters'
import { useChats, useChat, useCreateChat, useDeleteChat } from '@/hooks/use-chats'
import { mapCharacterIndex, mapChatLineToMessage, type Character } from '@/types'
import { useChatStore } from '@/stores/chat-store'
import { useToast } from '@/lib/toast'
import type { CharacterDetail } from '@/lib/api'

export function useAppState() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const activeCharacter = useChatStore((s) => s.activeCharacter)
  const activeChatId = useChatStore((s) => s.activeChatId)
  const setActiveCharacter = useChatStore((s) => s.setActiveCharacter)
  const setActiveChatId = useChatStore((s) => s.setActiveChatId)

  const pendingCharRef = useRef<string | null>(null)

  const { data: charactersData, isLoading: charactersLoading } = useCharacters()
  const { data: chatsData } = useChats(activeCharacter?.file_name ?? null)
  const { data: chatData } = useChat(activeCharacter?.file_name ?? null, activeChatId)
  const createChat = useCreateChat()
  const deleteChat = useDeleteChat()
  const createCharacter = useCreateCharacter()
  const updateCharacter = useUpdateCharacter()

  const [characterEditorOpen, setCharacterEditorOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState<CharacterDetail | null>(null)

  const characters = useMemo(() => {
    if (!charactersData) return []
    return charactersData.map(mapCharacterIndex)
  }, [charactersData])

  const messages = useMemo(() => {
    if (!chatData) return []
    return chatData.lines
      .map((l, i) => ({ line: l, fileIndex: i }))
      .filter(({ line }) => 'mes' in line)
      .map(({ line, fileIndex }) => mapChatLineToMessage(line, fileIndex))
  }, [chatData])

  useEffect(() => {
    if (!activeCharacter || !chatsData) return
    if (pendingCharRef.current !== activeCharacter.file_name) return
    pendingCharRef.current = null

    if (chatsData.length > 0) {
      setActiveChatId(chatsData[0].file_id)
    } else {
      createChat.mutateAsync({ characterName: activeCharacter.file_name })
        .then(result => setActiveChatId(result.chatId))
        .catch(() => toast.error('创建对话失败'))
    }
  }, [activeCharacter, chatsData, createChat])

  const handleSelectCharacter = useCallback((char: Character) => {
    setActiveCharacter(char)

    const cachedChats = queryClient.getQueryData<Array<{ file_id: string }>>(['chats', char.file_name])
    if (cachedChats && cachedChats.length > 0) {
      setActiveChatId(cachedChats[0].file_id)
    } else {
      setActiveChatId(null)
      pendingCharRef.current = char.file_name
    }
  }, [queryClient])

  const handleCreateCharacter = useCallback(async (data: Partial<CharacterDetail>) => {
    try {
      await createCharacter.mutateAsync({
        name: data.name!,
        description: data.description,
        personality: data.personality,
        scenario: data.scenario,
        first_mes: data.first_mes,
        mes_example: data.mes_example,
        creator_notes: data.creator_notes,
        system_prompt: data.system_prompt,
        post_history_instructions: data.post_history_instructions,
        tags: data.tags,
        creator: data.creator,
        character_version: data.character_version,
      })
      toast.success('角色创建成功')
      setCharacterEditorOpen(false)
    } catch {
      toast.error('创建角色失败')
    }
  }, [createCharacter, toast])

  const handleEditCharacter = useCallback(async (data: Partial<CharacterDetail>) => {
    if (!editingCharacter) return
    try {
      await updateCharacter.mutateAsync({ name: editingCharacter.file_name, data })
      toast.success('角色已更新')
      setEditingCharacter(null)
    } catch {
      toast.error('更新角色失败')
    }
  }, [editingCharacter, updateCharacter, toast])

  const handleNewChat = useCallback(() => {
    if (!activeCharacter) return
    createChat.mutateAsync({ characterName: activeCharacter.file_name })
      .then(result => {
        setActiveChatId(result.chatId)
        toast.success('新对话已创建')
      })
      .catch(() => toast.error('创建对话失败'))
  }, [activeCharacter, createChat, toast])

  const handleSelectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId)
  }, [])

  const handleDeleteChat = useCallback((chatId: string) => {
    if (!activeCharacter) return
    deleteChat.mutateAsync({ characterName: activeCharacter.file_name, chatId })
      .then(() => {
        if (activeChatId === chatId) {
          setActiveChatId(null)
        }
        toast.success('对话已删除')
      })
      .catch(() => toast.error('删除对话失败'))
  }, [activeCharacter, activeChatId, deleteChat, toast])

  return {
    characters,
    charactersLoading,
    activeCharacter,
    activeChatId,
    chatsData,
    messages,
    characterEditorOpen,
    editingCharacter,
    setCharacterEditorOpen,
    setEditingCharacter,
    handleSelectCharacter,
    handleCreateCharacter,
    handleEditCharacter,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
  }
}
