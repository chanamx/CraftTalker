import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { api } from '@/lib/api'
import { useSettingsStore } from '@/stores/settings-store'
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

describe('SettingsDialog API provider handling', () => {
  beforeEach(() => {
    useSettingsStore.setState({ developerMode: false })
    vi.clearAllMocks()
  })

  it('hides fixed endpoint and legacy API type controls outside developer mode', () => {
    render(
      <SettingsDialog
        open
        config={config}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('API 类型')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('API 地址')).not.toBeInTheDocument()
    expect(screen.getByText('https://api.openai.com/v1')).toBeInTheDocument()
  })

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
      apiUrl: 'https://api.openai.com/v1',
      apiKey: '',
      apiKeySessionId: 'session-1',
    })
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('sk-plain')
  })

  it('syncs fixed provider endpoint and format when switching sources', async () => {
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
        config={{ ...config, model: 'gpt-4o-mini' }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByDisplayValue('OpenAI'), 'openrouter')
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      source: 'openrouter',
      apiUrl: 'https://openrouter.ai/api/v1',
      customApiFormat: 'openai_chat',
      model: 'openai/gpt-4o-mini',
      apiKey: '',
      apiKeySessionId: 'session-openrouter',
    }))
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('sk-plain')
  })

  it('shows and preserves custom endpoints for custom OpenAI-compatible providers', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const customConfig: LLMConfig = {
      ...config,
      source: 'custom_openai_chat',
      apiUrl: 'https://proxy.example.test/v1',
      apiKey: '',
      model: 'proxy-model',
      type: 'custom',
    }

    render(
      <SettingsDialog
        open
        config={customConfig}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    )

    const endpoint = screen.getByLabelText('API 地址')
    await user.clear(endpoint)
    await user.type(endpoint, 'https://another-proxy.example/v1')
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      source: 'custom_openai_chat',
      apiUrl: 'https://another-proxy.example/v1',
      customApiFormat: 'openai_chat',
      apiKey: '',
    }))
    expect(api.llmSessions.create).not.toHaveBeenCalled()
  })

  it('shows advanced endpoint controls in developer mode', () => {
    useSettingsStore.setState({ developerMode: true })

    render(
      <SettingsDialog
        open
        config={config}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('API 类型')).toBeInTheDocument()
    expect(screen.getByLabelText('API 地址')).toHaveValue('https://api.example.test/v1')
    expect(screen.getByLabelText('接口格式')).toBeInTheDocument()
  })
})
