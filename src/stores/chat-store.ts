import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Character } from '@/types'

interface StreamEntry {
  content: string
  abortController: AbortController
  mode: 'append' | 'continue'
}

interface ChatState {
  activeCharacter: Character | null
  activeChatId: string | null
  streams: Record<string, StreamEntry>
  pendingCharName: string | null
  setActiveCharacter: (char: Character | null) => void
  setActiveChatId: (id: string | null) => void
  setPendingCharName: (name: string | null) => void
  startStream: (key: string, ctrl: AbortController, mode?: 'append' | 'continue') => void
  appendStream: (key: string, content: string) => void
  endStream: (key: string) => void
  abortStream: (key: string) => void
}

const defaultChar: Character = {
  id: '',
  name: '选择一个角色',
  avatar: null,
  description: '从侧边栏选择一个角色开始对话',
  model: '',
  lastMessage: '',
  pinned: false,
  file_name: '',
  world: null,
}

export const defaultCharacter = defaultChar

export function streamKey(charName: string, chatId: string) {
  return `${charName}/${chatId}`
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      activeCharacter: null,
      activeChatId: null,
      streams: {},
      pendingCharName: null,
      setActiveCharacter: (char) => set({ activeCharacter: char }),
      setActiveChatId: (id) => set({ activeChatId: id }),
      setPendingCharName: (name) => set({ pendingCharName: name }),
      startStream: (key, ctrl, mode = 'append') => set((s) => ({
        streams: { ...s.streams, [key]: { content: '', abortController: ctrl, mode } },
      })),
      appendStream: (key, content) => set((s) => {
        const entry = s.streams[key]
        if (!entry) return s
        return { streams: { ...s.streams, [key]: { ...entry, content } } }
      }),
      endStream: (key) => set((s) => {
        const { [key]: _, ...rest } = s.streams
        return { streams: rest }
      }),
      abortStream: (key) => set((s) => {
        const entry = s.streams[key]
        if (!entry) return s
        entry.abortController.abort()
        const { [key]: _, ...rest } = s.streams
        return { streams: rest }
      }),
    }),
    {
      name: 'luker-chat-store',
      partialize: (s) => ({ activeChatId: s.activeChatId, activeCharacter: s.activeCharacter }),
    }
  )
)
