import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { api } from '@/lib/api'
import type { LLMConfig } from '@/types'

vi.mock('@/lib/api', () => ({
  api: {
    llmSessions: {
      create: vi.fn(),
    },
    testConnection: vi.fn(),
  },
}))

const config: LLMConfig = {
  source: 'openai',
  apiUrl: 'https://api.example.test/v1',
  apiKey: 'sk-plain',
  model: 'example-model',
  type: 'openai',
  customApiFormat: 'openai_chat',
}

describe('SettingsDialog API key session handling', () => {
  it('stores a new API key in a server-side session before saving settings', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onClose = vi.fn()
    vi.mocked(api.llmSessions.create).mockResolvedValue({
      sessionId: 'session-1',
      label: 'openai:example-model',
      createdAt: '2026-06-09T00:00:00.000Z',
      updatedAt: '2026-06-09T00:00:00.000Z',
      hasApiKey: true,
    })

    render(
      <SettingsDialog
        open
        config={config}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(api.llmSessions.create).toHaveBeenCalledWith({
      apiKey: 'sk-plain',
      label: 'openai:example-model',
    })
    expect(onSave).toHaveBeenCalledWith({
      ...config,
      apiKey: '',
      apiKeySessionId: 'session-1',
    })
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('sk-plain')
  })

  it('persists selected provider metadata while keeping API keys out of settings', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    vi.mocked(api.llmSessions.create).mockResolvedValue({
      sessionId: 'session-openrouter',
      label: 'openrouter:example-model',
      createdAt: '2026-06-09T00:00:00.000Z',
      updatedAt: '2026-06-09T00:00:00.000Z',
      hasApiKey: true,
    })

    render(
      <SettingsDialog
        open
        config={config}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByDisplayValue('OpenAI'), 'openrouter')
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      source: 'openrouter',
      apiUrl: 'https://api.example.test/v1',
      customApiFormat: 'openai_chat',
      apiKey: '',
      apiKeySessionId: 'session-openrouter',
    }))
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('sk-plain')
  })
})
