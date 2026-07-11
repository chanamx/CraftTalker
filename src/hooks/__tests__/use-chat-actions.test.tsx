import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, consumeSSEStream, type ChatDetail, type ChatLine } from '@/lib/api'
import { useChatActions } from '@/hooks/use-chat-actions'
import { streamKey, useChatStore } from '@/stores/chat-store'
import { useSettingsStore } from '@/stores/settings-store'
import type { Character, ChatMessage } from '@/types'

const stBridge = vi.hoisted(() => ({
  emitStExtensionEvent: vi.fn(),
  emitStExtensionEventAsync: vi.fn(),
  getStExtensionPromptsBridge: vi.fn(),
  runStGenerateAfterDataBridge: vi.fn(),
  runStGenerationBeforeEndBridge: vi.fn(),
  runStGenerationInterceptorsBridge: vi.fn(),
  syncStExtensionContextBridge: vi.fn(),
  stEventTypes: {
    GENERATION_BEFORE_END: 'js_generation_before_end',
    GENERATION_STARTED: 'generation_started',
    GENERATION_STOPPED: 'generation_stopped',
    GENERATION_ENDED: 'generation_ended',
    STREAM_TOKEN_RECEIVED: 'stream_token_received',
    MESSAGE_RECEIVED: 'message_received',
    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    MESSAGE_SENT: 'message_sent',
    MESSAGE_DELETED: 'message_deleted',
    MESSAGE_EDITED: 'message_edited',
    MESSAGE_UPDATED: 'message_updated',
    MESSAGE_SWIPED: 'message_swiped',
  },
}))

vi.mock('@/lib/st-extension-bridge', () => stBridge)

vi.mock('@/lib/api', async () => {
  class ApiRequestError extends Error {
    apiError: { error: string }
    status: number

    constructor(apiError: { error: string }, status: number) {
      super(apiError.error)
      this.apiError = apiError
      this.status = status
    }
  }

  return {
    ApiRequestError,
    consumeSSEStream: vi.fn(),
    api: {
      chats: {
        regenerate: vi.fn(),
        continue: vi.fn(),
        generate: vi.fn(),
        sendMessage: vi.fn(),
        deleteMessage: vi.fn(),
        editMessage: vi.fn(),
        switchSwipe: vi.fn(),
      },
      runs: {
        list: vi.fn(),
        commit: vi.fn(),
        discard: vi.fn(),
        finalizeStOutput: vi.fn(),
      },
    },
  }
})

vi.mock('@/lib/toast', () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
  }),
}))

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function createWrapper(client = createTestQueryClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const character: Character = {
  id: 'compat-char',
  name: 'Compat Char',
  avatar: null,
  description: 'Compatibility test character',
  model: 'default',
  lastMessage: '',
  pinned: false,
  file_name: 'compat-char.json',
  world: null,
}

const messages: ChatMessage[] = [
  {
    id: 'msg-0',
    role: 'user',
    content: 'hello',
    timestamp: Date.parse('2026-07-07T00:00:00.000Z'),
    lineIndex: 0,
  },
  {
    id: 'msg-1',
    role: 'assistant',
    content: 'hi',
    timestamp: Date.parse('2026-07-07T00:01:00.000Z'),
    lineIndex: 1,
  },
]

const baseChatLines: ChatLine[] = [
  {
    name: 'User',
    is_user: true,
    is_system: false,
    send_date: '2026-07-07T00:00:00.000Z',
    mes: 'hello',
  },
  {
    name: 'Compat Char',
    is_user: false,
    is_system: false,
    send_date: '2026-07-07T00:01:00.000Z',
    mes: 'hi',
  },
]

function seedChat(client: QueryClient, lines: ChatLine[] = baseChatLines) {
  client.setQueryData<ChatDetail>(['chats', character.file_name, 'chat-1'], {
    chatId: 'chat-1',
    characterName: character.file_name,
    lines,
  })
}

function messageEventCallOrder(type: string) {
  const index = stBridge.emitStExtensionEventAsync.mock.calls.findIndex(([eventType]) => eventType === type)
  return index >= 0 ? stBridge.emitStExtensionEventAsync.mock.invocationCallOrder[index] : undefined
}

describe('useChatActions ST generation compatibility', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeCharacter: character,
      activeChatId: 'chat-1',
      streams: {},
      pendingCharName: null,
    })
    useSettingsStore.setState({
      genConfig: {
        temperature: 0.7,
        topP: 0.9,
        contextLength: 4096,
        maxReplyLength: 512,
      },
    })
    vi.mocked(api.runs.list).mockResolvedValue([])
    stBridge.runStGenerationInterceptorsBridge.mockResolvedValue(false)
    stBridge.runStGenerateAfterDataBridge.mockImplementation(async (prompt: unknown[]) => prompt)
    stBridge.runStGenerationBeforeEndBridge.mockImplementation(async (message: string) => message)
    stBridge.getStExtensionPromptsBridge.mockResolvedValue([])
    stBridge.syncStExtensionContextBridge.mockResolvedValue(undefined)
    stBridge.emitStExtensionEventAsync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    useChatStore.setState({
      activeCharacter: null,
      activeChatId: null,
      streams: {},
      pendingCharName: null,
    })
  })

  it('lets ST generate interceptors abort regeneration before a stream is created', async () => {
    stBridge.runStGenerationInterceptorsBridge.mockResolvedValue(true)

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.handleRegenerate(1)
    })

    expect(stBridge.runStGenerationInterceptorsBridge).toHaveBeenCalledWith(
      [
        { name: 'User', is_user: true, is_system: false, mes: 'hello' },
      ],
      4096,
      'normal',
    )
    expect(api.chats.regenerate).not.toHaveBeenCalled()
    expect(useChatStore.getState().streams[streamKey(character.file_name, 'chat-1')]).toBeUndefined()
    expect(stBridge.emitStExtensionEvent).not.toHaveBeenCalledWith('generation_started', expect.anything())
  })

  it('continues regeneration after ST generate interceptors do not abort', async () => {
    vi.mocked(api.chats.sendMessage).mockResolvedValue({
      name: 'User',
      is_user: true,
      is_system: false,
      send_date: '2026-07-07T00:02:30.000Z',
      mes: 'new prompt',
    })
    vi.mocked(api.chats.generate).mockResolvedValue(new Response('', { status: 200 }))

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.handleRegenerate(1)
    })

    expect(stBridge.runStGenerationInterceptorsBridge).toHaveBeenCalledWith(
      [
        { name: 'User', is_user: true, is_system: false, mes: 'hello' },
      ],
      4096,
      'normal',
    )
    expect(api.chats.regenerate).toHaveBeenCalledTimes(1)
    expect(stBridge.emitStExtensionEvent).toHaveBeenCalledWith('generation_started', 'append')
    expect(stBridge.emitStExtensionEvent).toHaveBeenCalledWith('generation_ended')
  })

  it('includes a newly saved user message in the ST generate interceptor snapshot', async () => {
    stBridge.runStGenerationInterceptorsBridge.mockResolvedValue(true)
    vi.mocked(api.chats.sendMessage).mockResolvedValue({
      name: 'User',
      is_user: true,
      is_system: false,
      mes: 'new prompt',
    })

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.handleSend('new prompt')
    })

    expect(api.chats.sendMessage).toHaveBeenCalledWith('compat-char.json', 'chat-1', 'new prompt')
    expect(stBridge.runStGenerationInterceptorsBridge).toHaveBeenCalledWith(
      [
        { name: 'User', is_user: true, is_system: false, mes: 'hello' },
        { name: 'Compat Char', is_user: false, is_system: false, mes: 'hi' },
        { name: 'User', is_user: true, is_system: false, mes: 'new prompt' },
      ],
      4096,
      'normal',
    )
    expect(api.chats.generate).not.toHaveBeenCalled()
  })

  it('passes sanitized interceptor-mutated chat snapshots to regeneration requests', async () => {
    stBridge.runStGenerationInterceptorsBridge.mockImplementation(async (chat: unknown[]) => {
      const firstLine = chat[0] as { mes: string }
      firstLine.mes = 'hello without draw artifacts'
      chat.push({
        name: 'System Note',
        is_user: false,
        is_system: true,
        send_date: Date.now(),
        mes: 'cleaned by plugin',
      })
      return false
    })
    vi.mocked(api.chats.regenerate).mockResolvedValue(new Response('', { status: 200 }))

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.handleRegenerate(1)
    })

    expect(api.chats.regenerate).toHaveBeenCalledWith(
      'compat-char.json',
      'chat-1',
      expect.any(Object),
      expect.objectContaining({
        genOverrides: expect.any(Object),
        signal: expect.any(AbortSignal),
        stCompat: {
          chatOverride: [
            { name: 'User', is_user: true, is_system: false, mes: 'hello without draw artifacts' },
            { name: 'System Note', is_user: false, is_system: true, mes: 'cleaned by plugin' },
          ],
          extensionPrompts: [],
          promptMessages: [
            { role: 'user', content: 'hello without draw artifacts' },
            { role: 'system', content: 'cleaned by plugin' },
          ],
        },
      }),
    )
  })

  it('passes active ST extension prompts to regeneration requests', async () => {
    stBridge.getStExtensionPromptsBridge.mockResolvedValue([
      {
        key: 'plugin-system-note',
        value: 'Remember the plugin-provided rule.',
        position: 0,
        role: 0,
      },
    ])
    vi.mocked(api.chats.regenerate).mockResolvedValue(new Response('', { status: 200 }))

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.handleRegenerate(1)
    })

    expect(api.chats.regenerate).toHaveBeenCalledWith(
      'compat-char.json',
      'chat-1',
      expect.any(Object),
      expect.objectContaining({
        genOverrides: expect.any(Object),
        signal: expect.any(AbortSignal),
        stCompat: {
          chatOverride: [
            { name: 'User', is_user: true, is_system: false, mes: 'hello' },
          ],
          extensionPrompts: [
            {
              key: 'plugin-system-note',
              value: 'Remember the plugin-provided rule.',
              position: 0,
              role: 0,
            },
          ],
          promptMessages: [
            { role: 'system', content: 'Remember the plugin-provided rule.' },
            { role: 'user', content: 'hello' },
          ],
        },
      }),
    )
  })

  it('passes ST generate-after-data prompt mutations to regeneration requests', async () => {
    stBridge.getStExtensionPromptsBridge.mockResolvedValue([
      {
        key: 'plugin-system-note',
        value: 'Remember the plugin-provided rule.',
        position: 0,
        role: 0,
      },
    ])
    stBridge.runStGenerateAfterDataBridge.mockResolvedValue([
      { role: 'system', content: 'Remember the plugin-provided rule.' },
      { role: 'user', content: 'hello after plugin macro replacement' },
      { role: 'assistant', content: 'assistant-side plugin note' },
    ])
    vi.mocked(api.chats.regenerate).mockResolvedValue(new Response('', { status: 200 }))

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.handleRegenerate(1)
    })

    expect(stBridge.runStGenerateAfterDataBridge).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'Remember the plugin-provided rule.' },
        { role: 'user', content: 'hello' },
      ],
      'normal',
    )
    expect(api.chats.regenerate).toHaveBeenCalledWith(
      'compat-char.json',
      'chat-1',
      expect.any(Object),
      expect.objectContaining({
        genOverrides: expect.any(Object),
        signal: expect.any(AbortSignal),
        stCompat: {
          chatOverride: [
            { name: 'User', is_user: true, is_system: false, mes: 'hello' },
          ],
          extensionPrompts: [
            {
              key: 'plugin-system-note',
              value: 'Remember the plugin-provided rule.',
              position: 0,
              role: 0,
            },
          ],
          promptMessages: [
            { role: 'system', content: 'Remember the plugin-provided rule.' },
            { role: 'user', content: 'hello after plugin macro replacement' },
            { role: 'assistant', content: 'assistant-side plugin note' },
          ],
        },
      }),
    )
  })

  it('emits ST stream token events with accumulated text during native streaming', async () => {
    vi.mocked(api.chats.regenerate).mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(consumeSSEStream).mockImplementation(async (_response, callbacks) => {
      callbacks.onChunk?.('part-1')
      callbacks.onChunk?.('part-2')
    })

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.handleRegenerate(1)
    })

    expect(stBridge.emitStExtensionEvent).toHaveBeenCalledWith('stream_token_received', 'part-1')
    expect(stBridge.emitStExtensionEvent).toHaveBeenCalledWith('stream_token_received', 'part-1part-2')
  })

  it('emits ST assistant message events after native streaming completes', async () => {
    vi.mocked(api.chats.regenerate).mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(consumeSSEStream).mockImplementation(async (_response, callbacks) => {
      callbacks.onChunk?.('final reply')
    })

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.handleRegenerate(1)
    })

    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('message_received', 1, 'normal')
    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('character_message_rendered', 1, 'normal')
    expect(stBridge.emitStExtensionEvent).toHaveBeenCalledWith('generation_ended')
  })

  it('applies ST generation-before-end mutations to the persisted assistant line before lifecycle events', async () => {
    const client = createTestQueryClient()
    seedChat(client)
    vi.mocked(api.chats.regenerate).mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(api.runs.finalizeStOutput).mockResolvedValue({
      runId: 'run-before-end',
      committedLineIndex: 1,
      line: {
      name: 'Compat Char',
      is_user: false,
      is_system: false,
      send_date: '2026-07-07T00:03:00.000Z',
      mes: 'templated raw',
      },
    })
    vi.mocked(consumeSSEStream).mockImplementation(async (_response, callbacks) => {
      callbacks.onChunk?.('raw')
      callbacks.onComplete?.({ runId: 'run-before-end', committedLineIndex: 1 })
    })
    stBridge.runStGenerationBeforeEndBridge.mockResolvedValue('templated raw')

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper(client) })

    await act(async () => {
      await result.current.handleRegenerate(1)
    })

    expect(stBridge.runStGenerationBeforeEndBridge).toHaveBeenCalledWith(
      'raw',
      'compat-char.json:chat-1:1:normal',
    )
    expect(api.runs.finalizeStOutput).toHaveBeenCalledWith('run-before-end', 'templated raw')
    expect(stBridge.runStGenerationBeforeEndBridge.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.runs.finalizeStOutput).mock.invocationCallOrder[0],
    )
    expect(vi.mocked(api.runs.finalizeStOutput).mock.invocationCallOrder[0]).toBeLessThan(
      stBridge.syncStExtensionContextBridge.mock.invocationCallOrder[0],
    )
    expect(stBridge.syncStExtensionContextBridge).toHaveBeenCalledWith(expect.objectContaining({
      chatLines: [
        baseChatLines[0],
        expect.objectContaining({
          name: 'Compat Char',
          is_user: false,
          mes: 'templated raw',
          send_date: '2026-07-07T00:03:00.000Z',
        }),
      ],
      messages: [
        expect.objectContaining({ role: 'user', content: 'hello', lineIndex: 0 }),
        expect.objectContaining({ role: 'assistant', content: 'templated raw', lineIndex: 1 }),
      ],
    }))
    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('message_received', 1, 'normal')
  })

  it('commits non-empty before-end plugin output when the provider stream is empty', async () => {
    const client = createTestQueryClient()
    seedChat(client)
    vi.mocked(api.chats.generate).mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(api.chats.sendMessage).mockResolvedValue({
      name: 'User',
      is_user: true,
      is_system: false,
      send_date: '2026-07-11T00:00:00.000Z',
      mes: 'empty upstream',
    })
    vi.mocked(consumeSSEStream).mockImplementation(async (_response, callbacks) => {
      callbacks.onComplete?.({ runId: 'run-empty' })
    })
    stBridge.runStGenerationBeforeEndBridge.mockResolvedValue('Plugin supplied reply')
    vi.mocked(api.runs.finalizeStOutput).mockResolvedValue({
      runId: 'run-empty',
      committedLineIndex: 3,
      line: {
        name: 'Compat Char',
        is_user: false,
        is_system: false,
        send_date: '2026-07-11T00:00:01.000Z',
        mes: 'Plugin supplied reply',
      },
    })

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper(client) })
    await act(async () => result.current.handleSend('empty upstream'))

    expect(stBridge.runStGenerationBeforeEndBridge).toHaveBeenCalledWith(
      '',
      'compat-char.json:chat-1:3:normal',
    )
    expect(api.runs.finalizeStOutput).toHaveBeenCalledWith('run-empty', 'Plugin supplied reply')
    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('message_received', 3, 'normal')
    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('character_message_rendered', 3, 'normal')
  })

  it('uses stream committedLineIndex metadata for ST generation-before-end persistence', async () => {
    const client = createTestQueryClient()
    seedChat(client, [
      ...baseChatLines,
      {
        name: 'User',
        is_user: true,
        is_system: false,
        send_date: '2026-07-07T00:02:00.000Z',
        mes: 'cached line outside the ST snapshot',
      },
    ])
    vi.mocked(api.chats.sendMessage).mockResolvedValue({
      name: 'User',
      is_user: true,
      is_system: false,
      send_date: '2026-07-07T00:02:30.000Z',
      mes: 'new prompt',
    })
    vi.mocked(api.chats.generate).mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(api.runs.finalizeStOutput).mockResolvedValue({
      runId: 'run-metadata',
      committedLineIndex: 4,
      line: {
        name: 'Compat Char',
        is_user: false,
        is_system: false,
        send_date: '2026-07-07T00:03:00.000Z',
        mes: 'metadata-index final',
      },
    })
    vi.mocked(consumeSSEStream).mockImplementation(async (_response, callbacks) => {
      callbacks.onChunk?.('raw')
      callbacks.onComplete?.({ runId: 'run-metadata', committedLineIndex: 4 })
    })
    stBridge.runStGenerationBeforeEndBridge.mockResolvedValue('metadata-index final')

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper(client) })

    await act(async () => {
      await result.current.handleSend('new prompt')
    })

    expect(api.runs.finalizeStOutput).toHaveBeenCalledWith('run-metadata', 'metadata-index final')
    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('message_received', 3, 'normal')
  })

  it('uses native committedLineIndex to mirror regeneration when chat lines include a JSONL header', async () => {
    const client = createTestQueryClient()
    const header: ChatLine = {
      chat_metadata: {},
      user_name: 'User',
      character_name: 'Compat Char',
    }
    seedChat(client, [header, ...baseChatLines])
    const messagesWithHeader: ChatMessage[] = [
      { ...messages[0], id: 'msg-1', lineIndex: 1 },
      { ...messages[1], id: 'msg-2', lineIndex: 2 },
    ]
    vi.mocked(api.chats.regenerate).mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(api.runs.finalizeStOutput).mockResolvedValue({
      runId: 'run-header',
      committedLineIndex: 2,
      line: {
        name: 'Compat Char',
        is_user: false,
        is_system: false,
        send_date: '2026-07-11T00:00:00.000Z',
        mes: 'fresh header-aware reply',
      },
    })
    vi.mocked(consumeSSEStream).mockImplementation(async (_response, callbacks) => {
      callbacks.onChunk?.('raw')
      callbacks.onComplete?.({ runId: 'run-header', committedLineIndex: 2 })
    })
    stBridge.runStGenerationBeforeEndBridge.mockResolvedValue('fresh header-aware reply')

    const { result } = renderHook(() => useChatActions(messagesWithHeader), { wrapper: createWrapper(client) })

    await act(async () => {
      await result.current.handleRegenerate(2)
    })

    expect(api.runs.finalizeStOutput).toHaveBeenCalledWith('run-header', 'fresh header-aware reply')
    expect(stBridge.syncStExtensionContextBridge).toHaveBeenCalledWith(expect.objectContaining({
      chatLines: [
        header,
        baseChatLines[0],
        expect.objectContaining({ mes: 'fresh header-aware reply' }),
      ],
    }))
    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('message_received', 1, 'normal')
  })

  it('persists ST generation-before-end mutations as continued assistant content', async () => {
    const client = createTestQueryClient()
    seedChat(client)
    vi.mocked(api.chats.continue).mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(api.runs.finalizeStOutput).mockResolvedValue({
      runId: 'run-continue',
      committedLineIndex: 1,
      line: {
        name: 'Compat Char',
        is_user: false,
        is_system: false,
        send_date: '2026-07-07T00:03:00.000Z',
        mes: 'hi friend',
      },
    })
    vi.mocked(consumeSSEStream).mockImplementation(async (_response, callbacks) => {
      callbacks.onChunk?.(' there')
      callbacks.onComplete?.({ runId: 'run-continue', committedLineIndex: 1 })
    })
    stBridge.runStGenerationBeforeEndBridge.mockResolvedValue(' friend')

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper(client) })

    await act(async () => {
      await result.current.handleContinue()
    })

    expect(api.runs.finalizeStOutput).toHaveBeenCalledWith('run-continue', ' friend')
    expect(stBridge.syncStExtensionContextBridge).toHaveBeenCalledWith(expect.objectContaining({
      chatLines: [
        baseChatLines[0],
        expect.objectContaining({ name: 'Compat Char', is_user: false, mes: 'hi friend' }),
      ],
      messages: [
        expect.objectContaining({ role: 'user', content: 'hello', lineIndex: 0 }),
        expect.objectContaining({ role: 'assistant', content: 'hi friend', lineIndex: 1 }),
      ],
    }))
    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('message_received', 1, 'continue')
  })

  it('awaits ST context sync with the committed assistant line before message lifecycle events', async () => {
    const client = createTestQueryClient()
    seedChat(client)
    vi.mocked(api.chats.sendMessage).mockResolvedValue({
      name: 'User',
      is_user: true,
      is_system: false,
      send_date: '2026-07-07T00:02:00.000Z',
      mes: 'new prompt',
    })
    vi.mocked(api.chats.generate).mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(consumeSSEStream).mockImplementation(async (_response, callbacks) => {
      callbacks.onChunk?.('final reply')
    })

    let resolveSync = () => {}
    const syncPromise = new Promise<void>(resolve => {
      resolveSync = resolve
    })
    stBridge.syncStExtensionContextBridge.mockReturnValueOnce(syncPromise)

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper(client) })

    let sendPromise!: Promise<void>
    act(() => {
      sendPromise = result.current.handleSend('new prompt')
    })

    await waitFor(() => expect(stBridge.syncStExtensionContextBridge).toHaveBeenCalledTimes(1))
    expect(stBridge.emitStExtensionEventAsync).not.toHaveBeenCalledWith('message_received', 3, 'normal')

    resolveSync()
    await act(async () => {
      await sendPromise
    })

    expect(stBridge.syncStExtensionContextBridge).toHaveBeenCalledWith(expect.objectContaining({
      activeCharacter: character,
      activeChatId: 'chat-1',
      chatLines: [
        ...baseChatLines,
        {
          name: 'User',
          is_user: true,
          is_system: false,
          send_date: '2026-07-07T00:02:00.000Z',
          mes: 'new prompt',
        },
        expect.objectContaining({
          name: 'Compat Char',
          is_user: false,
          is_system: false,
          mes: 'final reply',
        }),
      ],
      messages: [
        expect.objectContaining({ role: 'user', content: 'hello', lineIndex: 0 }),
        expect.objectContaining({ role: 'assistant', content: 'hi', lineIndex: 1 }),
        expect.objectContaining({ role: 'user', content: 'new prompt', lineIndex: 2 }),
        expect.objectContaining({ role: 'assistant', content: 'final reply', lineIndex: 3 }),
      ],
    }))
    expect(stBridge.syncStExtensionContextBridge.mock.invocationCallOrder[0]).toBeLessThan(
      messageEventCallOrder('message_received')!,
    )
    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('message_received', 3, 'normal')
    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('character_message_rendered', 3, 'normal')
  })

  it('syncs ST context with continued assistant content before continue lifecycle events', async () => {
    const client = createTestQueryClient()
    seedChat(client)
    vi.mocked(api.chats.continue).mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(consumeSSEStream).mockImplementation(async (_response, callbacks) => {
      callbacks.onChunk?.(' there')
    })

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper(client) })

    await act(async () => {
      await result.current.handleContinue()
    })

    expect(stBridge.syncStExtensionContextBridge).toHaveBeenCalledWith(expect.objectContaining({
      activeCharacter: character,
      activeChatId: 'chat-1',
      chatLines: [
        baseChatLines[0],
        expect.objectContaining({ mes: 'hi there' }),
      ],
      messages: [
        expect.objectContaining({ role: 'user', content: 'hello', lineIndex: 0 }),
        expect.objectContaining({ role: 'assistant', content: 'hi there', lineIndex: 1 }),
      ],
    }))
    expect(stBridge.syncStExtensionContextBridge.mock.invocationCallOrder[0]).toBeLessThan(
      messageEventCallOrder('message_received')!,
    )
    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('message_received', 1, 'continue')
  })

  it('syncs ST context with the regenerated assistant line instead of appending a stale duplicate', async () => {
    const client = createTestQueryClient()
    seedChat(client)
    vi.mocked(api.chats.regenerate).mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(consumeSSEStream).mockImplementation(async (_response, callbacks) => {
      callbacks.onChunk?.('fresh reply')
    })

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper(client) })

    await act(async () => {
      await result.current.handleRegenerate(1)
    })

    const updatedChat = client.getQueryData<ChatDetail>(['chats', character.file_name, 'chat-1'])
    expect(updatedChat?.lines).toHaveLength(2)
    expect(updatedChat?.lines[1]).toMatchObject({ name: 'Compat Char', is_user: false, mes: 'fresh reply' })
    expect(stBridge.syncStExtensionContextBridge).toHaveBeenCalledWith(expect.objectContaining({
      activeCharacter: character,
      activeChatId: 'chat-1',
      chatLines: [
        baseChatLines[0],
        expect.objectContaining({ name: 'Compat Char', is_user: false, mes: 'fresh reply' }),
      ],
      messages: [
        expect.objectContaining({ role: 'user', content: 'hello', lineIndex: 0 }),
        expect.objectContaining({ role: 'assistant', content: 'fresh reply', lineIndex: 1 }),
      ],
    }))
    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('message_received', 1, 'normal')
  })

  it('awaits async ST message lifecycle handlers before later lifecycle events', async () => {
    const client = createTestQueryClient()
    seedChat(client)
    vi.mocked(api.chats.regenerate).mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(consumeSSEStream).mockImplementation(async (_response, callbacks) => {
      callbacks.onChunk?.('fresh reply')
    })

    let resolveMessageEvent = () => {}
    const messageEventPromise = new Promise<void>(resolve => {
      resolveMessageEvent = resolve
    })
    stBridge.emitStExtensionEventAsync.mockImplementation(async (type: string) => {
      if (type === 'message_received') await messageEventPromise
    })

    const { result } = renderHook(() => useChatActions(messages), { wrapper: createWrapper(client) })

    let regeneratePromise!: Promise<void>
    act(() => {
      regeneratePromise = result.current.handleRegenerate(1)
    })

    await waitFor(() => {
      expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('message_received', 1, 'normal')
    })
    expect(stBridge.emitStExtensionEventAsync).not.toHaveBeenCalledWith('character_message_rendered', 1, 'normal')
    expect(stBridge.emitStExtensionEvent).not.toHaveBeenCalledWith('generation_ended')

    resolveMessageEvent()
    await act(async () => {
      await regeneratePromise
    })

    expect(stBridge.emitStExtensionEventAsync).toHaveBeenCalledWith('character_message_rendered', 1, 'normal')
    expect(stBridge.emitStExtensionEvent).toHaveBeenCalledWith('generation_ended')
  })
})
