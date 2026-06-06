import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { LLMConfig } from '@/types'
import { secureStorage } from '@/lib/secure-storage'

interface GenConfig {
  temperature: number
  topP: number
  contextLength: number
  maxReplyLength: number
}

const DEFAULT_LLM_CONFIG: LLMConfig = {
  apiUrl: 'http://localhost:1234/v1',
  apiKey: '',
  model: 'local-model',
  type: 'openai',
}

const DEFAULT_GEN_CONFIG: GenConfig = {
  temperature: 0.7,
  topP: 0.9,
  contextLength: 4096,
  maxReplyLength: 512,
}

interface SettingsState {
  llmConfig: LLMConfig
  genConfig: GenConfig
  developerMode: boolean
  setLlmConfig: (config: LLMConfig) => void
  setGenConfig: (config: Partial<GenConfig>) => void
  setTemperature: (v: number) => void
  setTopP: (v: number) => void
  setContextLength: (v: number) => void
  setMaxReplyLength: (v: number) => void
  setDeveloperMode: (v: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      llmConfig: DEFAULT_LLM_CONFIG,
      genConfig: DEFAULT_GEN_CONFIG,
      developerMode: false,
      setLlmConfig: (config) => set({ llmConfig: config }),
      setGenConfig: (partial) =>
        set((s) => ({ genConfig: { ...s.genConfig, ...partial } })),
      setTemperature: (v) =>
        set((s) => ({ genConfig: { ...s.genConfig, temperature: v } })),
      setTopP: (v) =>
        set((s) => ({ genConfig: { ...s.genConfig, topP: v } })),
      setContextLength: (v) =>
        set((s) => ({ genConfig: { ...s.genConfig, contextLength: v } })),
      setMaxReplyLength: (v) =>
        set((s) => ({ genConfig: { ...s.genConfig, maxReplyLength: v } })),
      setDeveloperMode: (v) => set({ developerMode: v }),
    }),
    {
      name: 'luker-settings-store',
      storage: createJSONStorage(() => secureStorage),
    }
  )
)
