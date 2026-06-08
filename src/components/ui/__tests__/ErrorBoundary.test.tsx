import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useSettingsStore } from '@/stores/settings-store'

const throwingError = new Error('Exploded while rendering the message list')
throwingError.name = 'RenderExplosion'
throwingError.stack = [
  'RenderExplosion: Exploded while rendering the message list',
  '    at MessageList (src/components/chat/MessageList.tsx:12:3)',
].join('\n')

function ThrowingChild(): never {
  throw throwingError
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    useSettingsStore.setState({ developerMode: false })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the short error message without diagnostics by default', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )

    expect(screen.getByText('出了点问题')).toBeInTheDocument()
    expect(screen.getByText('Exploded while rendering the message list')).toBeInTheDocument()
    expect(screen.queryByText('开发者错误详情')).not.toBeInTheDocument()
    expect(screen.queryByText(/React Component Stack/)).not.toBeInTheDocument()
  })

  it('shows stack and component details when developer mode is enabled', () => {
    useSettingsStore.setState({ developerMode: true })

    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )

    expect(screen.getByText('开发者错误详情')).toBeInTheDocument()
    expect(screen.getByText(/Name: RenderExplosion/)).toBeInTheDocument()
    expect(screen.getByText(/Stack:/)).toBeInTheDocument()
    expect(screen.getByText(/MessageList/)).toBeInTheDocument()
    expect(screen.getByText(/React Component Stack:/)).toBeInTheDocument()
    expect(screen.getByText(/ThrowingChild/)).toBeInTheDocument()
  })
})
