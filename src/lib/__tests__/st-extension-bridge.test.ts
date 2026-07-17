import { beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  initializeStExtensionHost: vi.fn().mockResolvedValue(undefined),
  event_types: {
    GENERATION_AFTER_COMMANDS: 'generation_after_commands',
    GENERATE_AFTER_DATA: 'generate_after_data',
    CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',
    GENERATION_BEFORE_END: 'js_generation_before_end',
  },
  eventSource: {
    emit: vi.fn(),
  },
}))

vi.mock('@/lib/st-extension-host', () => host)

import { runStGenerateAfterDataBridge, runStGenerationBeforeEndBridge, runStPromptLifecycleBridge } from '@/lib/st-extension-bridge'

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
    expect(host.eventSource.emit).not.toHaveBeenCalledWith(
      host.event_types.CHAT_COMPLETION_SETTINGS_READY,
      expect.anything(),
    )
  })

  it('chains generate-after-data mutations into chat-completion-settings-ready in ST order', async () => {
    let chatCompletionInput: unknown
    host.eventSource.emit.mockImplementation(async (event: string, payload: unknown) => {
      if (event === host.event_types.GENERATE_AFTER_DATA) {
        const data = payload as { prompt: Array<{ role: string; content: string }> }
        data.prompt = [{ role: 'user', content: 'generate-after mutation' }]
      }
      if (event === host.event_types.CHAT_COMPLETION_SETTINGS_READY) {
        const data = payload as { messages: Array<{ role: string; content: string }> }
        chatCompletionInput = structuredClone(data.messages)
        data.messages = [{ role: 'system', content: 'chat hook mutation' }]
      }
    })

    const result = await runStPromptLifecycleBridge([
      { role: 'user', content: 'original' },
    ], 'normal', 'chat_completion')

    expect(result).toEqual([{ role: 'system', content: 'chat hook mutation' }])
    expect(chatCompletionInput).toEqual([{ role: 'user', content: 'generate-after mutation' }])
    expect(host.eventSource.emit).toHaveBeenNthCalledWith(
      1,
      host.event_types.GENERATION_AFTER_COMMANDS,
      'normal',
      {},
      false,
    )
    expect(host.eventSource.emit).toHaveBeenNthCalledWith(
      2,
      host.event_types.GENERATE_AFTER_DATA,
      { prompt: [{ role: 'user', content: 'generate-after mutation' }], type: 'normal' },
      false,
    )
    expect(host.eventSource.emit).toHaveBeenNthCalledWith(
      3,
      host.event_types.CHAT_COMPLETION_SETTINGS_READY,
      { messages: [{ role: 'system', content: 'chat hook mutation' }], type: 'normal' },
    )
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
