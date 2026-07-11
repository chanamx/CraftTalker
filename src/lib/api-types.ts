import type { LLMConfig } from '@/lib/llm-config-types'

export type LlmRequestConfig = LLMConfig

export interface ApiError {
  error: string
  code: number
  details?: Record<string, unknown>
}

export interface CharacterIndex {
  name: string
  description: string
  tags: string[]
  creator: string
  spec: string
  spec_version: string
  avatar: string | null
  file_name: string
  created_at: number
  updated_at: number
  world: string | null
}

export interface CharacterDetail extends CharacterIndex {
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  creator_notes: string
  system_prompt?: string
  post_history_instructions?: string
  alternate_greetings?: string[]
  character_version: string
  extensions: Record<string, unknown>
}

export interface CharacterCreateInput {
  name: string
  description?: string
  personality?: string
  scenario?: string
  first_mes?: string
  mes_example?: string
  creator_notes?: string
  system_prompt?: string
  post_history_instructions?: string
  tags?: string[]
  creator?: string
  character_version?: string
}

export interface ChatInfo {
  file_id: string
  file_name: string
  chat_items: number
  mes: string
  last_mes: number
}

export interface ChatLine {
  name?: string
  is_user?: boolean
  is_system?: boolean
  send_date?: string | number
  mes?: string
  extra?: Record<string, unknown>
  chat_metadata?: Record<string, unknown>
  user_name?: string
  character_name?: string
  swipe_id?: number
  swipes?: string[]
  variables?: unknown
  variables_initialized?: unknown
}

export interface ChatDetail {
  chatId: string
  characterName: string
  lines: ChatLine[]
}

export interface ChatMetadataUpdateResponse {
  chat_metadata: Record<string, unknown>
}

export interface ChatMessageVariablesUpdate {
  lineIndex: number
  variables?: unknown
  variables_initialized?: unknown
}

export interface ChatMessageVariablesUpdateResponse {
  updated: number
}

export interface GenerationOverrides {
  temperature?: number
  topP?: number
  contextLength?: number
  maxReplyLength?: number
}

export interface StCompatChatOverrideLine {
  name?: string
  is_user?: boolean
  is_system?: boolean
  mes: string
}

export interface StCompatExtensionPrompt {
  key: string
  value: string
  position?: number
  depth?: number
  scan?: boolean
  role?: number
}

export interface StCompatPromptMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StCompatGenerationOptions {
  chatOverride?: StCompatChatOverrideLine[]
  extensionPrompts?: StCompatExtensionPrompt[]
  promptMessages?: StCompatPromptMessage[]
}

export interface ChatGenerationRequestOptions {
  presetType?: PresetType
  presetName?: string
  signal?: AbortSignal
  genOverrides?: GenerationOverrides
  stCompat?: StCompatGenerationOptions
}

export interface WorldBookEntry {
  uid: number
  id?: number | string
  key: string[]
  keys?: string[]
  keysecondary: string[]
  secondary_keys?: string[]
  comment: string
  content: string
  constant: boolean
  selective: boolean
  insertion_order: number
  priority?: number | string
  enabled: boolean
  position: number
  depth: number
  order: number
  use_regexp: boolean
  probability: number
  group: string
  group_override: boolean
  exclude_recursion: boolean
  prevent_recursion: boolean
  delay_until_recursion: boolean | number
  scan_depth: number
  match_whole_words: boolean
  use_group_scoring: boolean
  case_sensitive: boolean
  automation_id: string
  role: number
  sticky: number
  cooldown: number
  delay: number
  display_index: number
  selectiveLogic?: number
  groupWeight?: number
  groupOverride?: boolean
  ignoreBudget?: boolean
  outletName?: string
  outlet_name?: string
  excludeRecursion?: boolean
  preventRecursion?: boolean
  delayUntilRecursion?: boolean | number
  useProbability?: boolean
  scanDepth?: number | null
  matchWholeWords?: boolean | null
  useGroupScoring?: boolean | null
  caseSensitive?: boolean | null
  automationId?: string
  displayIndex?: number
  addMemo?: boolean
  matchPersonaDescription?: boolean
  matchCharacterDescription?: boolean
  matchCharacterPersonality?: boolean
  matchCharacterDepthPrompt?: boolean
  matchScenario?: boolean
  matchCreatorNotes?: boolean
  triggers?: string[]
  characterFilter?: {
    names: string[]
    tags: string[]
    isExclude: boolean
  }
  character_filter?: {
    names: string[]
    tags: string[]
    isExclude: boolean
  }
  extensions?: Record<string, unknown>
  disable?: boolean
  vectorized?: boolean
  [key: string]: unknown
}

export interface WorldBook {
  name: string
  description: string
  entries: Record<string, WorldBookEntry>
  enabled: boolean
  global_enabled?: boolean
  global_selective: boolean
  selective_default: boolean
  recursive_scanning: boolean
  scan_depth: number
  token_budget: number
  recursive_scanning_depth: number
  extensions: Record<string, unknown>
  [key: string]: unknown
}

export interface WorldIndex {
  name: string
  description: string
  entry_count: number
  enabled: boolean
  global_enabled: boolean
  bound_to: string[]
}

export interface StWorldInfoSettings {
  world_names: string[]
  selected_world_info: string[]
  world_info: {
    globalSelect: string[]
    charLore: Array<Record<string, unknown>>
    entries: Record<string, WorldBookEntry>
  }
  world_info_include_names: boolean
  world_info_case_sensitive: boolean
  world_info_match_whole_words: boolean
  world_info_use_group_scoring: boolean
  world_info_max_recursion_steps: number
  world_info_depth: number
  world_info_min_activations: number
  world_info_min_activations_depth_max: number
  world_info_budget: number
  world_info_budget_cap: number
  world_info_recursive: boolean
  world_info_overflow_alert: boolean
  world_info_character_strategy: number
}

export interface GenerationPreset {
  name: string
  temperature: number
  top_p: number
  top_k: number
  top_a: number
  min_p: number
  max_tokens: number
  max_context?: number
  repetition_penalty: number
  repetition_penalty_range: number
  repetition_penalty_slope: number
  frequency_penalty: number
  presence_penalty: number
  typical_p: number
  tfs: number
  mirostat_mode: number
  mirostat_tau: number
  mirostat_eta: number
  sampler_order: number[]
  skip_special_tokens: boolean
  ban_eos_token: boolean
  add_bos_token: boolean
  token_healing: boolean
  seed: number
  grammar_string: string
  guidance_scale: number
  negative_prompt: string
  dry_allowed_length: number
  dry_multiplier: number
  dry_base: number
  dry_sequence_breakers: string
  xtc_threshold: number
  xtc_probability: number
  [key: string]: unknown
}

export type PresetData = GenerationPreset | { name: string; [key: string]: unknown }

export type PresetType =
  | 'kobold'
  | 'openai'
  | 'textgen'
  | 'novel'
  | 'instruct'
  | 'context'
  | 'sysprompt'
  | 'reasoning'

export type PresetKind = 'generation' | 'template'
export type PresetStorageFormat = 'sillytavern-json' | 'crafttalker-legacy'

export interface PresetIndexEntry {
  name: string
  type: PresetType
  kind: PresetKind
  format: PresetStorageFormat
  sourceLabel: string
  directory: string
  extension: string
}

export interface StreamCompleteMetadata {
  runId?: string
  committedLineIndex?: number
}

export interface StGenerationFinalization {
  runId: string
  committedLineIndex: number
  line: ChatLine
}

export interface StreamCallbacks {
  onChunk?: (chunk: string) => void
  onError?: (error: ApiError) => void
  onComplete?: (metadata: StreamCompleteMetadata) => void
  signal?: AbortSignal
}

export type GenerationRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'interrupted'
  | 'committed'
  | 'discarded'

export interface GenerationRunRecord {
  runId: string
  characterName: string
  chatId: string
  operation: 'generate' | 'regenerate' | 'continue'
  status: GenerationRunStatus
  createdAt: string
  updatedAt: string
  startedAt: string
  finishedAt?: string
  partialContent: string
  error?: string
  committedLineIndex?: number
  stFinalizedAt?: string
}

export interface GenerationRunFilters {
  characterName?: string
  chatId?: string
  status?: GenerationRunStatus
}

export interface LlmKeySession {
  sessionId: string
  label?: string
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  hasApiKey: boolean
}

export interface LlmKeySessionCreateInput {
  apiKey: string
  label?: string
}

export type ExtensionType = 'system' | 'local' | 'global'

export interface ExtensionDiscovery {
  type: ExtensionType
  name: string
}

export interface ExtensionManifest {
  display_name?: string
  version?: string
  author?: string
  js?: string
  css?: string
  loading_order?: number | string
  requires?: string[]
  dependencies?: string[]
  optional?: string[]
  generate_interceptor?: string
  hooks?: Record<string, string>
  [key: string]: unknown
}

export type ExtensionSettings = Record<string, unknown>

export type ExtensionRuntimeCapabilityStatus = 'supported' | 'partial' | 'stub' | 'blocked'

export interface ExtensionRuntimeCapability {
  id: string
  status: ExtensionRuntimeCapabilityStatus
  note: string
}

export interface ExtensionCompatibilityReportItem extends ExtensionDiscovery {
  displayName: string
  version: string
  author: string
  enabled: boolean
  manifestOk: boolean
  manifestError?: string
  scriptPath: string | null
  scriptOk: boolean
  cssPath: string | null
  cssOk: boolean
  loadingOrder: number
  requires: string[]
  missingRequiredDependencies: string[]
  optional: string[]
  minimumClientVersion: string | null
  homePage: string | null
  autoUpdate: boolean
  generateInterceptor: string | null
  hooks: Record<string, string>
}

export interface ExtensionCompatibilityReport {
  generatedAt: string
  totals: {
    discovered: number
    enabled: number
    withErrors: number
  }
  extensions: ExtensionCompatibilityReportItem[]
  runtimeCapabilities: ExtensionRuntimeCapability[]
}
