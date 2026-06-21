import { describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'

describe('api facade', () => {
  it('keeps the stable top-level API shape', () => {
    expect(api).toEqual({
      testConnection: expect.any(Function),
      llm: expect.any(Object),
      llmSessions: expect.any(Object),
      characters: expect.any(Object),
      chats: expect.any(Object),
      runs: expect.any(Object),
      worlds: expect.any(Object),
      presets: expect.any(Object),
      extensions: expect.any(Object),
    })
    expect(api.extensions).toEqual(expect.objectContaining({
      discover: expect.any(Function),
      getCompatibilityReport: expect.any(Function),
      getSettings: expect.any(Function),
      saveSettings: expect.any(Function),
    }))
    expect(api.worlds).toEqual(expect.objectContaining({
      getSettings: expect.any(Function),
    }))
  })

  it('keeps stream endpoints under the API base path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const config = { apiUrl: '', apiKey: '', model: '', type: 'openai' as const }

    await api.chats.generate('Char Name', 'chat 1.jsonl', config, 'openai', 'default')
    await api.chats.regenerate('Char Name', 'chat 1.jsonl', config)
    await api.chats.continue('Char Name', 'chat 1.jsonl', config)
    await api.chats.updateMetadata('Char Name', 'chat 1.jsonl', { variables: { mood: 'bright' } })
    await api.chats.updateMessageVariables('Char Name', 'chat 1.jsonl', [{
      lineIndex: 1,
      variables: [{ hp: 10 }],
      variables_initialized: [true],
    }])

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/chats/Char%20Name/chat%201.jsonl/stream',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chats/Char%20Name/chat%201.jsonl/regenerate',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/chats/Char%20Name/chat%201.jsonl/continue',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/chats/Char%20Name/chat%201.jsonl/metadata',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      '/api/chats/Char%20Name/chat%201.jsonl/message-variables',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })
})
