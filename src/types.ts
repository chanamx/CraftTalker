import type { CharacterIndex, ChatLine, GenerationRunRecord } from '@/lib/api-types'

export type { ChatCompletionSource, CustomAPIFormat, LLMConfig } from '@/lib/llm-config-types'

export interface Character {
  id: string
  name: string
  avatar: string | null
  description: string
  tags?: string[]
  creator?: string
  spec?: string
  spec_version?: string
  created_at?: number
  updated_at?: number
  personality?: string
  scenario?: string
  first_mes?: string
  mes_example?: string
  creator_notes?: string
  system_prompt?: string
  post_history_instructions?: string
  alternate_greetings?: string[]
  character_version?: string
  extensions?: Record<string, unknown>
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
    tags: c.tags,
    creator: c.creator,
    spec: c.spec,
    spec_version: c.spec_version,
    created_at: c.created_at,
    updated_at: c.updated_at,
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
