import { beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  initializeStExtensionHost: vi.fn().mockResolvedValue(undefined),
  event_types: {
    GENERATION_AFTER_COMMANDS: 'generation_after_commands',
    GENERATE_AFTER_DATA: 'generate_after_data',
    GENERATION_BEFORE_END: 'js_generation_before_end',
  },
  eventSource: {
    emit: vi.fn(),
  },
}))

vi.mock('@/lib/st-extension-host', () => host)

import { runStGenerateAfterDataBridge, runStGenerationBeforeEndBridge } from '@/lib/st-extension-bridge'

describe('ST extension bridge generation hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    host.initializeStExtensionHost.mockResolvedValue(undefined)
    host.eventSource.emit.mockImplementation(async (event: string, payload: unknown) => {
      if (event === host.event_types.GENERATE_AFTER_DATA) {
        const generateData = payload as { prompt: unknown[] }
        generateData.prompt = []
      }
    })
  })

  it('preserves an intentionally empty prompt from generate-after-data hooks', async () => {
    const result = await runStGenerateAfterDataBridge([
      { role: 'user', content: 'remove me' },
    ], 'normal')

    expect(result).toEqual([])
  })

  it('returns the message mutation produced by awaited generation-before-end listeners', async () => {
    host.eventSource.emit.mockImplementation(async (event: string, payload: unknown) => {
      if (event === host.event_types.GENERATION_BEFORE_END) {
        await Promise.resolve()
        ;(payload as { message: string }).message = 'plugin-finalized reply'
      }
    })

    const result = await runStGenerationBeforeEndBridge('raw reply', 'native:chat:1:normal')

    expect(result).toBe('plugin-finalized reply')
    expect(host.eventSource.emit).toHaveBeenCalledWith(
      host.event_types.GENERATION_BEFORE_END,
      { message: 'plugin-finalized reply' },
      'native:chat:1:normal',
    )
  })
})
