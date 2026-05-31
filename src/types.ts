import type { CharacterIndex, ChatLine } from '@/lib/api'

export interface LLMConfig {
  apiUrl: string
  apiKey: string
  model: string
  type: 'openai' | 'kobold' | 'textgen' | 'novel' | 'custom'
}

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
    timestamp: line.send_date ?? Date.now(),
    lineIndex: index,
    swipeId: line.swipe_id,
    swipes: line.swipes,
  }
}
