const BASE = '/api'

export interface ApiError {
  error: string
  code: number
  details?: Record<string, unknown>
}

export class ApiRequestError extends Error {
  apiError: ApiError
  statusCode: number

  constructor(apiError: ApiError, statusCode: number) {
    super(apiError.error)
    this.name = 'ApiRequestError'
    this.apiError = apiError
    this.statusCode = statusCode
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({
      error: res.statusText,
      code: -1,
    })) as ApiError
    throw new ApiRequestError(err, res.status)
  }

  return res.json()
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
  send_date?: number
  mes?: string
  extra?: Record<string, unknown>
  chat_metadata?: Record<string, unknown>
  user_name?: string
  character_name?: string
  swipe_id?: number
  swipes?: string[]
}

export interface ChatDetail {
  chatId: string
  characterName: string
  lines: ChatLine[]
}

export interface WorldBookEntry {
  uid: number
  key: string[]
  keysecondary: string[]
  comment: string
  content: string
  constant: boolean
  selective: boolean
  insertion_order: number
  enabled: boolean
  position: 'before_char' | 'after_char'
  depth: number
  order: number
  probability: number
  group: string
}

export interface WorldBook {
  name: string
  description: string
  entries: Record<string, WorldBookEntry>
  enabled: boolean
  global_selective: boolean
  selective_default: boolean
  recursive_scanning: boolean
  scan_depth: number
  token_budget: number
  recursive_scanning_depth: number
  extensions: Record<string, unknown>
}

export interface WorldIndex {
  name: string
  description: string
  entry_count: number
  enabled: boolean
  bound_to: string[]
}

export interface GenerationPreset {
  name: string
  temperature: number
  top_p: number
  top_k: number
  top_a: number
  min_p: number
  max_tokens: number
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
}

export type PresetType = 'kobold' | 'openai' | 'textgen' | 'novel'

export interface StreamCallbacks {
  onChunk?: (chunk: string) => void
  onError?: (error: ApiError) => void
  onComplete?: () => void
  signal?: AbortSignal
}

export async function consumeSSEStream(
  response: Response,
  callbacks: StreamCallbacks
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError?.({ error: '无法读取响应流', code: -1 })
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          callbacks.onComplete?.()
          return
        }

        try {
          const parsed = JSON.parse(data)
          if (parsed.error) {
            callbacks.onError?.(parsed as ApiError)
            return
          }
          if (parsed.content) {
            callbacks.onChunk?.(parsed.content)
          }
        } catch {
          console.error('Failed to parse SSE data:', data)
        }
      }
    }
    callbacks.onComplete?.()
  } catch (error) {
    callbacks.onError?.({ error: String(error), code: -1 })
  }
}

export const api = {
  testConnection: (config: { apiUrl: string; apiKey: string; model: string; type: string }) =>
    request<{ success: boolean }>('/engine/test', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  characters: {
    list: () => request<CharacterIndex[]>('/characters'),
    get: (name: string) => request<CharacterDetail>(`/characters/${encodeURIComponent(name)}`),
    import: (filePath: string) =>
      request<CharacterDetail>('/characters/import', {
        method: 'POST',
        body: JSON.stringify({ filePath }),
      }),
    upload: (file: File) =>
      new Promise<CharacterDetail>(async (resolve, reject) => {
        const reader = new FileReader()
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(',')[1]
            const character = await request<CharacterDetail>('/characters/upload', {
              method: 'POST',
              body: JSON.stringify({ fileName: file.name, data: base64 }),
            })
            resolve(character)
          } catch (e) {
            reject(e)
          }
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      }),
    update: (name: string, data: Partial<CharacterDetail>) =>
      request<CharacterDetail>(`/characters/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (name: string) =>
      request<{ success: boolean }>(`/characters/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    create: (data: {
      name: string; description?: string; personality?: string
      scenario?: string; first_mes?: string; mes_example?: string
      creator_notes?: string; system_prompt?: string
      post_history_instructions?: string; tags?: string[]
      creator?: string; character_version?: string
    }) =>
      request<CharacterDetail>('/characters', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    clone: (name: string) =>
      request<CharacterDetail>(`/characters/${encodeURIComponent(name)}/clone`, {
        method: 'POST',
      }),
    exportJson: (name: string) =>
      request<Record<string, unknown>>(`/characters/${encodeURIComponent(name)}/export`),
  },

  chats: {
    list: (characterName: string) =>
      request<ChatInfo[]>(`/chats/${encodeURIComponent(characterName)}`),
    get: (characterName: string, chatId: string) =>
      request<ChatDetail>(`/chats/${encodeURIComponent(characterName)}/${chatId}`),
    create: (characterName: string, userName?: string) =>
      request<ChatDetail>(`/chats/${encodeURIComponent(characterName)}`, {
        method: 'POST',
        body: JSON.stringify({ userName }),
      }),
    sendMessage: (characterName: string, chatId: string, content: string) =>
      request<ChatLine>(`/chats/${encodeURIComponent(characterName)}/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    generate: (
      characterName: string,
      chatId: string,
      config: { apiUrl: string; apiKey: string; model: string; type: string },
      presetType?: PresetType,
      presetName?: string,
      signal?: AbortSignal,
      genOverrides?: { temperature?: number; topP?: number; contextLength?: number; maxReplyLength?: number },
    ) =>
      fetch(`${BASE}/chats/${encodeURIComponent(characterName)}/${chatId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, presetType, presetName, genOverrides }),
        signal,
      }),
    regenerate: (
      characterName: string,
      chatId: string,
      config: { apiUrl: string; apiKey: string; model: string; type: string },
      presetType?: PresetType,
      presetName?: string,
      signal?: AbortSignal,
      genOverrides?: { temperature?: number; topP?: number; contextLength?: number; maxReplyLength?: number },
    ) =>
      fetch(`${BASE}/chats/${encodeURIComponent(characterName)}/${chatId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, presetType, presetName, genOverrides }),
        signal,
      }),
    continue: (
      characterName: string,
      chatId: string,
      config: { apiUrl: string; apiKey: string; model: string; type: string },
      presetType?: PresetType,
      presetName?: string,
      signal?: AbortSignal,
    ) =>
      fetch(`${BASE}/chats/${encodeURIComponent(characterName)}/${chatId}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, presetType, presetName }),
        signal,
      }),
    delete: (characterName: string, chatId: string) =>
      request<{ success: boolean }>(`/chats/${encodeURIComponent(characterName)}/${chatId}`, {
        method: 'DELETE',
      }),
    deleteMessage: (characterName: string, chatId: string, lineIndex: number) =>
      request<{ success: boolean }>(`/chats/${encodeURIComponent(characterName)}/${chatId}/messages/${lineIndex}`, {
        method: 'DELETE',
      }),
    editMessage: (characterName: string, chatId: string, lineIndex: number, content: string) =>
      request<ChatLine>(`/chats/${encodeURIComponent(characterName)}/${chatId}/messages/${lineIndex}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
    rename: (characterName: string, chatId: string, chatName: string) =>
      request<{ success: boolean }>(`/chats/${encodeURIComponent(characterName)}/${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ chatName }),
      }),
    switchSwipe: (characterName: string, chatId: string, lineIndex: number, swipeId: number) =>
      request<ChatLine>(`/chats/${encodeURIComponent(characterName)}/${chatId}/messages/${lineIndex}/swipe`, {
        method: 'POST',
        body: JSON.stringify({ swipeId }),
      }),
  },

  worlds: {
    list: () => request<WorldIndex[]>('/worlds'),
    get: (name: string) => request<WorldBook>(`/worlds/${encodeURIComponent(name)}`),
    create: (name: string, description?: string) =>
      request<WorldBook>('/worlds', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      }),
    update: (name: string, data: Partial<WorldBook>) =>
      request<WorldBook>(`/worlds/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (name: string) =>
      request<{ success: boolean }>(`/worlds/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    addEntry: (worldName: string, entry: Partial<WorldBookEntry>) =>
      request<WorldBook>(`/worlds/${encodeURIComponent(worldName)}/entries`, {
        method: 'POST',
        body: JSON.stringify(entry),
      }),
    updateEntry: (worldName: string, uid: number, entry: Partial<WorldBookEntry>) =>
      request<WorldBook>(`/worlds/${encodeURIComponent(worldName)}/entries/${uid}`, {
        method: 'PATCH',
        body: JSON.stringify(entry),
      }),
    deleteEntry: (worldName: string, uid: number) =>
      request<WorldBook>(`/worlds/${encodeURIComponent(worldName)}/entries/${uid}`, {
        method: 'DELETE',
      }),
    bind: (worldName: string, characterName: string) =>
      request<{ success: boolean }>(`/worlds/${encodeURIComponent(worldName)}/bind`, {
        method: 'POST',
        body: JSON.stringify({ characterName }),
      }),
    unbind: (worldName: string, characterName: string) =>
      request<{ success: boolean }>(`/worlds/${encodeURIComponent(worldName)}/unbind`, {
        method: 'POST',
        body: JSON.stringify({ characterName }),
      }),
  },

  presets: {
    list: (type: PresetType) => request<string[]>(`/presets/${type}`),
    get: (type: PresetType, name: string) =>
      request<GenerationPreset>(`/presets/${type}/${encodeURIComponent(name)}`),
    save: (type: PresetType, preset: GenerationPreset) =>
      request<GenerationPreset>(`/presets/${type}`, {
        method: 'POST',
        body: JSON.stringify(preset),
      }),
    delete: (type: PresetType, name: string) =>
      request<{ success: boolean }>(`/presets/${type}/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
  },
}
