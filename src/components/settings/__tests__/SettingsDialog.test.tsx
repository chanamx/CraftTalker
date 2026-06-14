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
    llm: {
      models: vi.fn(),
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

  it('hides fixed endpoint, format, summary, and legacy API type controls outside developer mode', () => {
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
    expect(screen.queryByLabelText('接口格式')).not.toBeInTheDocument()
    expect(screen.queryByText('连接摘要')).not.toBeInTheDocument()
    expect(screen.queryByText('https://api.openai.com/v1')).not.toBeInTheDocument()
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

  it('refreshes model options through the server-side model list endpoint', async () => {
    const user = userEvent.setup()
    vi.mocked(api.llmSessions.create).mockResolvedValue({
      sessionId: 'session-models',
      label: 'openai:example-model',
      createdAt: '2026-06-09T00:00:00.000Z',
      updatedAt: '2026-06-09T00:00:00.000Z',
      hasApiKey: true,
    })
    vi.mocked(api.llm.models).mockResolvedValue(['gpt-4o-mini', 'gpt-5.1'])

    const { container } = render(
      <SettingsDialog
        open
        config={config}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '刷新模型列表' }))

    await waitFor(() => expect(api.llm.models).toHaveBeenCalled())
    expect(api.llm.models).toHaveBeenCalledWith(expect.objectContaining({
      source: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: '',
      apiKeySessionId: 'session-models',
    }))
    expect(JSON.stringify(vi.mocked(api.llm.models).mock.calls)).not.toContain('sk-plain')
    expect(container.querySelector('datalist option[value="gpt-5.1"]')).not.toBeNull()
    expect(screen.getByText('已获取 2 个模型')).toBeInTheDocument()
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

    await user.selectOptions(screen.getByLabelText('API 服务'), 'openrouter')
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

  it('shows advanced endpoint controls in developer mode without legacy API type for catalog providers', () => {
    useSettingsStore.setState({ developerMode: true })

    render(
      <SettingsDialog
        open
        config={config}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('API 类型')).not.toBeInTheDocument()
    expect(screen.getByLabelText('API 地址')).toHaveValue('https://api.example.test/v1')
    expect(screen.getByLabelText('接口格式')).toBeInTheDocument()
    expect(screen.getByText('连接摘要')).toBeInTheDocument()
  })

  it('keeps developer mode edits local until the user saves settings', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <SettingsDialog
        open
        config={{ ...config, apiKey: '' }}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: '界面设置' }))
    await user.click(screen.getByRole('switch'))

    expect(useSettingsStore.getState().developerMode).toBe(false)

    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(screen.getByRole('alertdialog', { name: '设置有未保存的更改' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '放弃更改' }))

    expect(onClose).toHaveBeenCalled()
    expect(useSettingsStore.getState().developerMode).toBe(false)
  })

  it('persists developer mode only when saving settings', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <SettingsDialog
        open
        config={{ ...config, apiKey: '' }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '界面设置' }))
    await user.click(screen.getByRole('switch'))
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(useSettingsStore.getState().developerMode).toBe(true)
  })

  it('shows vendor endpoint editing only in the local developer draft', async () => {
    const user = userEvent.setup()

    render(
      <SettingsDialog
        open
        config={{ ...config, apiKey: '' }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('API 地址')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '界面设置' }))
    await user.click(screen.getByRole('switch'))
    await user.click(screen.getByRole('button', { name: 'LLM 连接' }))

    expect(screen.getByLabelText('API 地址')).toHaveValue('https://api.example.test/v1')
    expect(useSettingsStore.getState().developerMode).toBe(false)
  })

  it('syncs vendor endpoints when switching providers in developer mode', async () => {
    const user = userEvent.setup()
    useSettingsStore.setState({ developerMode: true })

    render(
      <SettingsDialog
        open
        config={{
          ...config,
          apiKey: '',
          apiUrl: 'https://openai-proxy.example/v1',
        }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('API 地址')).toHaveValue('https://openai-proxy.example/v1')

    await user.selectOptions(screen.getByLabelText('API 服务'), 'openrouter')

    expect(screen.getByLabelText('API 地址')).toHaveValue('https://openrouter.ai/api/v1')
  })

  it('resets provider search when toggling the local developer draft', async () => {
    const user = userEvent.setup()

    render(
      <SettingsDialog
        open
        config={{ ...config, apiKey: '' }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('搜索 API 服务'), 'gemini')
    expect(screen.queryByRole('option', { name: 'DeepSeek' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '界面设置' }))
    await user.click(screen.getByRole('switch'))
    await user.click(screen.getByRole('button', { name: 'LLM 连接' }))

    expect(screen.getByLabelText('搜索 API 服务')).toHaveValue('')
    expect(screen.getByRole('option', { name: 'DeepSeek' })).toBeInTheDocument()
  })

  it('preserves unsaved local edits across parent rerenders while open', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onClose = vi.fn()
    const draftConfig = { ...config, apiKey: '' }

    const { rerender } = render(
      <SettingsDialog
        open
        config={draftConfig}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    const model = screen.getByLabelText('模型名称')
    await user.clear(model)
    await user.type(model, 'draft-model')

    rerender(
      <SettingsDialog
        open
        config={{ ...draftConfig }}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    expect(screen.getByLabelText('模型名称')).toHaveValue('draft-model')
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByRole('alertdialog', { name: '设置有未保存的更改' })).toBeInTheDocument()
  })

  it('filters the unified provider list without losing the selected source', async () => {
    const user = userEvent.setup()

    render(
      <SettingsDialog
        open
        config={config}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const search = screen.getByLabelText('搜索 API 服务')
    await user.type(search, 'gemini')

    expect(screen.getByRole('option', { name: 'Gemini' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'OpenAI' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'DeepSeek' })).not.toBeInTheDocument()
  })

  it('locks custom Claude to Claude Messages in normal mode even from stale configs', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <SettingsDialog
        open
        config={{
          ...config,
          source: 'custom_claude',
          apiUrl: 'https://claude-proxy.example/v1',
          apiKey: '',
          model: 'claude-compatible-model',
          type: 'custom',
          customApiFormat: 'openai_chat',
        }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('接口格式')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      source: 'custom_claude',
      customApiFormat: 'anthropic_messages',
      apiUrl: 'https://claude-proxy.example/v1',
      apiKey: '',
    }))
  })

  it('shows developer format controls as locked protocol selectors for protocol-specific custom sources', () => {
    useSettingsStore.setState({ developerMode: true })

    render(
      <SettingsDialog
        open
        config={{
          ...config,
          source: 'custom_claude',
          apiUrl: 'https://claude-proxy.example/v1',
          model: 'claude-compatible-model',
          type: 'custom',
          customApiFormat: 'openai_chat',
        }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const format = screen.getByLabelText('接口格式')
    expect(format).toHaveValue('anthropic_messages')
    expect(format).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Claude Messages' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'OpenAI Chat Completions' })).not.toBeInTheDocument()
  })

  it('keeps legacy sources visible as the current configuration instead of selecting the wrong provider', () => {
    useSettingsStore.setState({ developerMode: true })

    render(
      <SettingsDialog
        open
        config={{
          ...config,
          source: 'kobold',
          apiUrl: 'http://localhost:5001/v1',
          apiKey: '',
          model: 'legacy-model',
          type: 'kobold',
          customApiFormat: 'openai_completion',
        }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('API 服务')).toHaveValue('kobold')
    expect(screen.getByRole('option', { name: '当前配置：kobold' })).toBeInTheDocument()
    expect(screen.getByLabelText('API 类型')).toHaveValue('kobold')
    expect(screen.getByLabelText('接口格式')).toHaveValue('openai_completion')
    expect(screen.getByLabelText('API 地址')).toHaveValue('http://localhost:5001/v1')
  })
})
