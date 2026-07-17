import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '@/lib/api-client'
import { runsApi } from '@/lib/api-domains/runs'

vi.mock('@/lib/api-client', () => ({ request: vi.fn() }))

describe('runs API domain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests opt-in projection summaries with bounded pagination parameters', async () => {
    vi.mocked(request).mockResolvedValue({ items: [], nextCursor: null })

    await runsApi.listSummaries({
      characterName: 'Page Bot',
      chatId: 'chat/1',
      status: 'failed',
      limit: 25,
      cursor: 'opaque cursor',
    })

    expect(request).toHaveBeenCalledWith(
      '/runs?view=summary&characterName=Page+Bot&chatId=chat%2F1&status=failed&limit=25&cursor=opaque+cursor',
    )
  })

  it('requests projection summaries from the default list authority', async () => {
    vi.mocked(request).mockResolvedValue({ items: [], nextCursor: null })

    await runsApi.list({ characterName: 'Page Bot', limit: 10 })

    expect(request).toHaveBeenCalledWith('/runs?characterName=Page+Bot&limit=10')
  })

  it('uses projection authority by default and keeps legacy fallback explicit', async () => {
    vi.mocked(request).mockResolvedValue({})

    await runsApi.getProjected('run/id')
    await runsApi.get('run/id')
    await runsApi.getLegacy('run/id')
    await runsApi.listLegacy({ characterName: 'Page Bot' })

    expect(request).toHaveBeenNthCalledWith(1, '/runs/run%2Fid?view=projection')
    expect(request).toHaveBeenNthCalledWith(2, '/runs/run%2Fid')
    expect(request).toHaveBeenNthCalledWith(3, '/runs/run%2Fid?view=legacy')
    expect(request).toHaveBeenNthCalledWith(4, '/runs?view=legacy&characterName=Page+Bot')
  })
})
