/**
 * 模型预设配置
 * 基于 SillyTavern 和 TauriTavern 的推荐设置
 */

export interface ModelPreset {
  id: string
  name: string
  provider: string
  model: string
  description: string
  config: {
    temperature?: number
    maxTokens?: number
    topP?: number
    frequencyPenalty?: number
    presencePenalty?: number
  }
  tags: string[]
}

/**
 * OpenAI 模型预设
 */
export const OPENAI_PRESETS: ModelPreset[] = [
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    model: 'gpt-4-turbo-preview',
    description: '最新 GPT-4，128K 上下文',
    config: {
      temperature: 0.7,
      maxTokens: 4096,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
    },
    tags: ['推荐', '大上下文'],
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    model: 'gpt-4',
    description: '经典 GPT-4，8K 上下文',
    config: {
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
    },
    tags: ['稳定'],
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    description: '快速且经济，16K 上下文',
    config: {
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
    },
    tags: ['快速', '经济'],
  },
]

/**
 * Anthropic Claude 模型预设
 */
export const ANTHROPIC_PRESETS: ModelPreset[] = [
  {
    id: 'claude-opus-4',
    name: 'Claude Opus 4.8',
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    description: '最强推理能力，200K 上下文',
    config: {
      temperature: 1.0,
      maxTokens: 4096,
      topP: 1,
    },
    tags: ['推荐', '最强'],
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    description: '平衡性能和成本，200K 上下文',
    config: {
      temperature: 1.0,
      maxTokens: 4096,
      topP: 1,
    },
    tags: ['推荐', '平衡'],
  },
  {
    id: 'claude-haiku-4',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    description: '极速响应，200K 上下文',
    config: {
      temperature: 1.0,
      maxTokens: 4096,
      topP: 1,
    },
    tags: ['快速', '经济'],
  },
]

/**
 * Google Gemini 模型预设
 */
export const GOOGLE_PRESETS: ModelPreset[] = [
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    model: 'gemini-2.0-flash-exp',
    description: '最新多模态模型，1M 上下文',
    config: {
      temperature: 0.9,
      maxTokens: 8192,
      topP: 1,
    },
    tags: ['推荐', '多模态'],
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    model: 'gemini-1.5-pro',
    description: '强大性能，2M 上下文',
    config: {
      temperature: 0.9,
      maxTokens: 8192,
      topP: 1,
    },
    tags: ['大上下文'],
  },
]

/**
 * Cohere 模型预设
 */
export const COHERE_PRESETS: ModelPreset[] = [
  {
    id: 'command-r-plus',
    name: 'Command R+',
    provider: 'cohere',
    model: 'command-r-plus',
    description: '强大的 RAG 能力，128K 上下文',
    config: {
      temperature: 0.75,
      maxTokens: 4096,
    },
    tags: ['推荐', 'RAG'],
  },
]

/**
 * Mistral AI 模型预设
 */
export const MISTRAL_PRESETS: ModelPreset[] = [
  {
    id: 'mistral-large',
    name: 'Mistral Large',
    provider: 'mistral',
    model: 'mistral-large-latest',
    description: '最强 Mistral 模型，128K 上下文',
    config: {
      temperature: 0.7,
      maxTokens: 8192,
    },
    tags: ['推荐'],
  },
  {
    id: 'mistral-small',
    name: 'Mistral Small',
    provider: 'mistral',
    model: 'mistral-small-latest',
    description: '快速且经济',
    config: {
      temperature: 0.7,
      maxTokens: 4096,
    },
    tags: ['快速', '经济'],
  },
]

/**
 * 所有预设
 */
export const ALL_PRESETS: ModelPreset[] = [
  ...OPENAI_PRESETS,
  ...ANTHROPIC_PRESETS,
  ...GOOGLE_PRESETS,
  ...COHERE_PRESETS,
  ...MISTRAL_PRESETS,
]

/**
 * 根据提供商获取预设
 */
export function getPresetsByProvider(provider: string): ModelPreset[] {
  return ALL_PRESETS.filter(p => p.provider === provider)
}

/**
 * 根据 ID 获取预设
 */
export function getPresetById(id: string): ModelPreset | undefined {
  return ALL_PRESETS.find(p => p.id === id)
}

/**
 * 获取推荐预设
 */
export function getRecommendedPresets(): ModelPreset[] {
  return ALL_PRESETS.filter(p => p.tags.includes('推荐'))
}
