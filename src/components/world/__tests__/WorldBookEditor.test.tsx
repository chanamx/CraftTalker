import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorldBookEditor } from '@/components/world/WorldBookEditor'
import { useSettingsStore } from '@/stores/settings-store'

vi.mock('@/hooks/use-worlds', () => ({
  useWorlds: () => ({
    data: [{
      name: 'Lore',
      description: '',
      entry_count: 1,
      enabled: true,
      global_enabled: false,
      bound_to: [],
    }],
  }),
  useWorld: () => ({
    data: {
      name: 'Lore',
      description: '',
      enabled: true,
      global_enabled: false,
      entries: {},
      global_selective: false,
      selective_default: false,
      recursive_scanning: false,
      scan_depth: 100,
      token_budget: 500,
      recursive_scanning_depth: 2,
      extensions: {},
    },
  }),
  useCreateWorld: () => ({ mutate: vi.fn() }),
  useUpdateWorld: () => ({ mutate: vi.fn() }),
  useDeleteWorld: () => ({ mutate: vi.fn() }),
  useAddWorldEntry: () => ({ mutate: vi.fn() }),
  useUpdateWorldEntry: () => ({ mutate: vi.fn() }),
  useDeleteWorldEntry: () => ({ mutate: vi.fn() }),
  useBindWorld: () => ({ mutate: vi.fn() }),
  useUnbindWorld: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/hooks/use-characters', () => ({
  useCharacters: () => ({ data: [] }),
}))

describe('WorldBookEditor developer mode controls', () => {
  beforeEach(() => {
    useSettingsStore.setState({ developerMode: false })
  })

  it('hides whole-book scope controls outside developer mode', () => {
    render(<WorldBookEditor open onClose={vi.fn()} initialWorld="Lore" />)

    expect(screen.queryByTitle('关闭整本世界书')).not.toBeInTheDocument()
    expect(screen.queryByTitle('设为全局生效')).not.toBeInTheDocument()
  })

  it('shows whole-book scope controls in developer mode', () => {
    useSettingsStore.setState({ developerMode: true })

    render(<WorldBookEditor open onClose={vi.fn()} initialWorld="Lore" />)

    expect(screen.getAllByTitle('关闭整本世界书').length).toBeGreaterThan(0)
    expect(screen.getByTitle('设为全局生效')).toBeInTheDocument()
  })
})
