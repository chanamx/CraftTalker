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

type LegacyGenConfig = Partial<GenConfig> & { maxTokens?: number }

type PersistedSettingsState = Partial<Omit<SettingsState, 'genConfig'>> & {
  genConfig?: LegacyGenConfig
}

const DEFAULT_LLM_CONFIG: LLMConfig = {
  source: 'lmstudio',
  apiUrl: 'http://localhost:1234/v1',
  apiKey: '',
  apiKeySessionId: undefined,
  model: 'local-model',
  type: 'openai',
  customApiFormat: 'openai_chat',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sourceFromLegacyType(type: LLMConfig['type'] | undefined): LLMConfig['source'] {
  switch (type) {
    case 'kobold':
      return 'kobold'
    case 'textgen':
      return 'textgen'
    case 'novel':
      return undefined
    case 'custom':
      return 'custom_openai_chat'
    case 'openai':
    default:
      return 'lmstudio'
  }
}

export function migrateSettingsState(persisted: unknown): Partial<SettingsState> {
  const state = isRecord(persisted) ? persisted as PersistedSettingsState : {}
  const legacyGenConfig = state.genConfig ?? {}
  const llmConfig = {
    ...DEFAULT_LLM_CONFIG,
    ...(state.llmConfig ?? {}),
  }
  llmConfig.source = llmConfig.source ?? sourceFromLegacyType(llmConfig.type)
  llmConfig.customApiFormat = llmConfig.customApiFormat ?? 'openai_chat'

  const genConfig: LegacyGenConfig = {
    ...DEFAULT_GEN_CONFIG,
    ...legacyGenConfig,
    maxReplyLength:
      legacyGenConfig.maxReplyLength ??
      legacyGenConfig.maxTokens ??
      DEFAULT_GEN_CONFIG.maxReplyLength,
  }
  delete genConfig.maxTokens

  return {
    ...state,
    llmConfig,
    genConfig: genConfig as GenConfig,
    developerMode: state.developerMode ?? false,
  }
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
      version: 1,
      storage: createJSONStorage(() => secureStorage),
      migrate: migrateSettingsState,
    }
  )
)
