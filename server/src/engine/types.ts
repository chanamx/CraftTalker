import type { CharacterCard } from '../lib/png-parser.js'
import type { GenerationPreset } from '../services/preset.service.js'
import type { LLMConfig } from '../lib/llm-config.js'
import type { MatchedEntry } from '../lib/world-match.js'

export interface EngineMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface EngineRequest {
  messages: EngineMessage[]
  character: CharacterCard
  preset: GenerationPreset
  config: LLMConfig
  userName?: string
  signal?: AbortSignal
  worldEntries?: MatchedEntry[]
}

export interface EngineResponse {
  content: string
  finishReason: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface Engine {
  readonly name: string
  generate(request: EngineRequest): Promise<EngineResponse>
  generateStream(request: EngineRequest): AsyncGenerator<string, void, unknown>
  testConnection(config: LLMConfig): Promise<boolean>
}
