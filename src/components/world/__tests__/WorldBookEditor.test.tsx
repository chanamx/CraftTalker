import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorldBookEditor } from '@/components/world/WorldBookEditor'
import { useSettingsStore } from '@/stores/settings-store'

const mocks = vi.hoisted(() => ({
  updateWorldMutate: vi.fn(),
  addEntryMutate: vi.fn(),
  updateEntryMutate: vi.fn(),
  worldList: [{
    name: 'Lore',
    description: '',
    entry_count: 1,
    enabled: true,
    global_enabled: false,
    bound_to: [],
  }],
  world: {
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
}))

vi.mock('@/hooks/use-worlds', () => ({
  useWorlds: () => ({
    data: mocks.worldList,
  }),
  useWorld: () => ({
    data: mocks.world,
  }),
  useCreateWorld: () => ({ mutate: vi.fn() }),
  useUpdateWorld: () => ({ mutate: mocks.updateWorldMutate }),
  useDeleteWorld: () => ({ mutate: vi.fn() }),
  useAddWorldEntry: () => ({ mutate: mocks.addEntryMutate }),
  useUpdateWorldEntry: () => ({ mutate: mocks.updateEntryMutate }),
  useDeleteWorldEntry: () => ({ mutate: vi.fn() }),
  useBindWorld: () => ({ mutate: vi.fn() }),
  useUnbindWorld: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/hooks/use-characters', () => ({
  useCharacters: () => ({ data: [] }),
}))

describe('WorldBookEditor developer mode controls', () => {
  beforeEach(() => {
    mocks.updateWorldMutate.mockReset()
    mocks.addEntryMutate.mockReset()
    mocks.updateEntryMutate.mockReset()
    mocks.worldList = [{
      name: 'Lore',
      description: '',
      entry_count: 1,
      enabled: true,
      global_enabled: false,
      bound_to: [],
    }]
    mocks.world = {
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
    }
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

  it('turns off the whole world without changing global or bound scopes', async () => {
    useSettingsStore.setState({ developerMode: true })
    const user = userEvent.setup()

    render(<WorldBookEditor open onClose={vi.fn()} initialWorld="Lore" />)

    await user.click(screen.getAllByTitle('关闭整本世界书')[0])

    expect(mocks.updateWorldMutate).toHaveBeenCalledWith({
      name: 'Lore',
      data: { enabled: false },
    })
  })

  it('creates new entries with ST-compatible defaults', async () => {
    const user = userEvent.setup()

    render(<WorldBookEditor open onClose={vi.fn()} initialWorld="Lore" />)

    await user.click(screen.getByRole('button', { name: /添加条目/ }))

    expect(mocks.addEntryMutate).toHaveBeenCalledWith({
      worldName: 'Lore',
      entry: expect.objectContaining({
        key: [''],
        keysecondary: [],
        content: '',
        constant: false,
        selective: true,
        selectiveLogic: 0,
        addMemo: false,
        probability: 100,
        useProbability: true,
      }),
    })
  })

  it('keeps ST outlet entries editable in the advanced position controls', async () => {
    const user = userEvent.setup()
    mocks.world.entries = {
      '7': {
        uid: 7,
        key: ['portal'],
        keysecondary: [],
        comment: 'Outlet lore',
        content: 'Routed lore',
        constant: true,
        selective: false,
        insertion_order: 100,
        enabled: true,
        position: 7,
        depth: 4,
        order: 100,
        use_regexp: false,
        probability: 100,
        group: '',
        group_override: false,
        exclude_recursion: false,
        prevent_recursion: false,
        delay_until_recursion: false,
        scan_depth: 100,
        match_whole_words: false,
        use_group_scoring: false,
        case_sensitive: false,
        automation_id: '',
        role: 0,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        display_index: 7,
        outletName: 'memo',
      },
    }

    render(<WorldBookEditor open onClose={vi.fn()} initialWorld="Lore" />)

    await user.click(screen.getByTitle('展开条目'))

    expect(screen.getByDisplayValue('扩展出口')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('memo'), { target: { value: 'journal' } })

    expect(mocks.updateEntryMutate).toHaveBeenCalledWith({
      worldName: 'Lore',
      uid: 7,
      entry: { outletName: 'journal' },
    })
  })
})
