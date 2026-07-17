import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, api } from '@/lib/api'
import { useRecoverableRuns } from '@/hooks/use-runs'
import type { GenerationRunRecord } from '@/lib/api'

vi.mock('@/lib/api', () => {
  class ApiRequestError extends Error {
    apiError: { error: string; code: number }
    statusCode: number

    constructor(apiError: { error: string; code: number }, statusCode: number) {
      super(apiError.error)
      this.apiError = apiError
      this.statusCode = statusCode
    }
  }
  return {
    ApiRequestError,
    api: {
      runs: {
        list: vi.fn(),
        listLegacy: vi.fn(),
        listSummaries: vi.fn(),
        get: vi.fn(),
        getProjected: vi.fn(),
        commit: vi.fn(),
        discard: vi.fn(),
      },
    },
  }
})

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

  it('loads bounded projection summaries and materializes only recoverable details', async () => {
    const failed = run({ runId: 'failed', status: 'failed', partialContent: 'failed partial' })
    const canceled = run({ runId: 'canceled', status: 'canceled', partialContent: 'canceled partial' })
    const interrupted = run({ runId: 'interrupted', status: 'interrupted', partialContent: 'interrupted partial' })
    vi.mocked(api.runs.list)
      .mockResolvedValueOnce({ items: [{ ...failed, partialBytes: 14, hasPartialContent: true, lastJournalSeq: 3 }], nextCursor: null })
      .mockResolvedValueOnce({ items: [{ ...canceled, partialBytes: 16, hasPartialContent: true, lastJournalSeq: 2 }], nextCursor: null })
      .mockResolvedValueOnce({ items: [{ ...interrupted, partialBytes: 19, hasPartialContent: true, lastJournalSeq: 1 }], nextCursor: null })
    vi.mocked(api.runs.get).mockImplementation(async runId => ({ failed, canceled, interrupted }[runId]!))

    const { result } = renderHook(
      () => useRecoverableRuns('RecoverBot', 'chat-1'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.map(item => item.runId)).toEqual(['failed', 'canceled', 'interrupted'])
    expect(api.runs.list).toHaveBeenCalledTimes(3)
    expect(api.runs.get).toHaveBeenCalledTimes(3)
    expect(api.runs.listLegacy).not.toHaveBeenCalled()
  })

  it('falls back to legacy detail data when lazy artifact materialization requires repair', async () => {
    const summary = run({ runId: 'corrupt', status: 'failed', partialContent: 'not in summary' })
    vi.mocked(api.runs.list)
      .mockResolvedValueOnce({ items: [{ ...summary, partialBytes: 7, hasPartialContent: true, lastJournalSeq: 3 }], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null })
    vi.mocked(api.runs.get).mockRejectedValue(
      new ApiRequestError({ error: 'Run projection detail requires repair', code: -1 }, 503),
    )
    vi.mocked(api.runs.listLegacy).mockResolvedValue([
      run({ runId: 'legacy', status: 'failed', partialContent: 'legacy fallback' }),
    ])

    const { result } = renderHook(
      () => useRecoverableRuns('RecoverBot', 'chat-1'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.map(item => item.runId)).toEqual(['legacy'])
    expect(api.runs.listLegacy).toHaveBeenCalledTimes(1)
  })

  it('falls back to the legacy list when projection authority is not ready', async () => {
    vi.mocked(api.runs.list).mockRejectedValue(
      new ApiRequestError({ error: 'Run projection view is not ready', code: -1 }, 503),
    )
    vi.mocked(api.runs.listLegacy).mockResolvedValue([
      run({ runId: 'legacy', status: 'failed', partialContent: 'legacy partial' }),
      run({ runId: 'empty', status: 'failed', partialContent: '   ' }),
    ])

    const { result } = renderHook(
      () => useRecoverableRuns('RecoverBot', 'chat-1'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.map(item => item.runId)).toEqual(['legacy'])
    expect(api.runs.listLegacy).toHaveBeenCalledTimes(1)
  })
})
