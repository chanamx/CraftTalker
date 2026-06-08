import type { CharacterIndex, ChatLine, GenerationRunRecord } from '@/lib/api'

export interface LLMConfig {
  source?: ChatCompletionSource
  apiUrl: string
  apiKey: string
  apiKeySessionId?: string
  model: string
  type: 'openai' | 'kobold' | 'textgen' | 'novel' | 'custom'
  useReverseProxy?: boolean
  reverseProxyUrl?: string
  reverseProxyPassword?: string
  reverseProxyName?: string
  customApiFormat?: CustomAPIFormat
  customHeaders?: Record<string, string>
  customBodyFields?: Record<string, unknown>
  excludeBodyFields?: string[]
}

export type ChatCompletionSource =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure_openai'
  | 'vertexai'
  | 'openrouter'
  | 'groq'
  | 'fireworks'
  | 'togetherai'
  | 'perplexity'
  | 'deepseek'
  | 'moonshot'
  | 'siliconflow'
  | 'minimax'
  | 'zhipu'
  | 'mistral'
  | 'cohere'
  | 'ai21'
  | 'xai'
  | 'pollinations'
  | 'kobold'
  | 'textgen'
  | 'ollama'
  | 'llamacpp'
  | 'vllm'
  | 'lmstudio'
  | 'custom_openai_chat'
  | 'custom_openai_responses'
  | 'custom_claude'
  | 'custom_gemini'

export type CustomAPIFormat =
  | 'openai_chat'
  | 'openai_completion'
  | 'openai_responses'
  | 'anthropic_messages'
  | 'gemini_generate_content'
  | 'claude_messages'
  | 'gemini_interactions'

export interface Character {
  id: string
  name: string
  avatar: string | null
  description: string
  model: string
  lastMessage: string
  pinned: boolean
  file_name: string
  world: string | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  lineIndex?: number
  swipeId?: number
  swipes?: string[]
}

export interface SidebarProps {
  characters: Character[]
  activeId: string
  collapsed: boolean
  onSelect: (char: Character) => void
  onImport?: () => void
  onCreate?: () => void
  loading?: boolean
}

export interface ChatAreaProps {
  character: Character
  messages: ChatMessage[]
  isStreaming: boolean
  onSend: (content: string) => void
  onStop: () => void
  onDeleteMessage: (lineIndex: number) => void
  onEditMessage: (lineIndex: number, content: string) => void
  onRegenerate: (lineIndex: number) => void
  onSwipe?: (lineIndex: number, swipeId: number) => void
  onContinue?: () => void
  recoverableRun?: GenerationRunRecord | null
  onCommitRun?: (runId: string) => void
  onDiscardRun?: (runId: string) => void
}

export interface CharacterPanelProps {
  character: Character
  collapsed: boolean
  onTemperatureChange?: (value: number) => void
  onTopPChange?: (value: number) => void
  onContextLengthChange?: (value: number) => void
  onMaxReplyLengthChange?: (value: number) => void
  temperature?: number
  topP?: number
  contextLength?: number
  maxReplyLength?: number
  onOpenWorldBook?: () => void
  onOpenPresets?: () => void
  onOpenSettings?: () => void
}

export function mapCharacterIndex(c: CharacterIndex): Character {
  return {
    id: c.file_name,
    name: c.name,
    avatar: c.avatar,
    description: c.description,
    model: 'default',
    lastMessage: '',
    pinned: false,
    file_name: c.file_name,
    world: c.world ?? null,
  }
}

export function mapChatLineToMessage(line: ChatLine, index: number): ChatMessage {
  return {
    id: `msg-${index}`,
    role: line.is_system ? 'system' : line.is_user ? 'user' : 'assistant',
    content: line.mes ?? '',
    timestamp: parseChatTimestamp(line.send_date),
    lineIndex: index,
    swipeId: line.swipe_id,
    swipes: line.swipes,
  }
}

function parseChatTimestamp(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
}
