import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { useRecoverableRuns } from '@/hooks/use-runs'
import type { GenerationRunRecord } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    runs: {
      list: vi.fn(),
      commit: vi.fn(),
      discard: vi.fn(),
    },
  },
}))

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function run(overrides: Partial<GenerationRunRecord>): GenerationRunRecord {
  return {
    runId: overrides.runId ?? crypto.randomUUID(),
    characterName: 'RecoverBot',
    chatId: 'chat-1',
    operation: 'generate',
    status: 'failed',
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    startedAt: '2026-06-09T00:00:00.000Z',
    partialContent: 'partial',
    ...overrides,
  }
}

describe('useRecoverableRuns', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns only failed, canceled, or interrupted partial runs that are not committed', async () => {
    vi.mocked(api.runs.list).mockResolvedValue([
      run({ runId: 'failed', status: 'failed', partialContent: 'failed partial' }),
      run({ runId: 'canceled', status: 'canceled', partialContent: 'canceled partial' }),
      run({ runId: 'interrupted', status: 'interrupted', partialContent: 'interrupted partial' }),
      run({ runId: 'running', status: 'running', partialContent: 'still running' }),
      run({ runId: 'completed', status: 'completed', partialContent: 'already saved', committedLineIndex: 2 }),
      run({ runId: 'committed', status: 'committed', partialContent: 'manual save', committedLineIndex: 3 }),
      run({ runId: 'discarded', status: 'discarded', partialContent: 'ignored' }),
      run({ runId: 'empty', status: 'failed', partialContent: '   ' }),
    ])

    const { result } = renderHook(
      () => useRecoverableRuns('RecoverBot', 'chat-1'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.map(item => item.runId)).toEqual([
      'failed',
      'canceled',
      'interrupted',
    ])
  })
})
