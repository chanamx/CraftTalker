import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import type { Character } from '@/types'

describe('Sidebar', () => {
  const characters: Character[] = [
    { id: '1', name: 'Allen', avatar: null, description: 'AI helper', model: '', lastMessage: '', pinned: false, file_name: 'Allen', world: null },
    { id: '2', name: 'Luna', avatar: null, description: 'Elf girl', model: '', lastMessage: 'Hello', pinned: true, file_name: 'Luna', world: null },
    { id: '3', name: 'Bot3', avatar: null, description: 'Bot', model: '', lastMessage: '', pinned: false, file_name: 'Bot3', world: null },
  ]

  const defaultProps = {
    characters,
    activeId: '1',
    collapsed: false,
    onSelect: vi.fn(),
  }

  it('renders all characters in the list', () => {
    render(<Sidebar {...defaultProps} />)
    characters.forEach(char => {
      expect(screen.getByText(char.name)).toBeInTheDocument()
    })
  })

  it('shows pinned characters in pinned section', () => {
    render(<Sidebar {...defaultProps} />)
    const pinnedLuna = screen.getByText('Luna')
    expect(pinnedLuna).toBeInTheDocument()
  })

  it('filters characters by search query', () => {
    render(<Sidebar {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText('sidebar.searchPlaceholder')
    fireEvent.change(searchInput, { target: { value: 'Len' } })

    expect(screen.queryByText('Allen')).toBeInTheDocument()
    expect(screen.queryByText('Luna')).not.toBeInTheDocument()
    expect(screen.queryByText('Bot3')).not.toBeInTheDocument()
  })

  it('shows empty message when search has no results', () => {
    render(<Sidebar {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText('sidebar.searchPlaceholder')
    fireEvent.change(searchInput, { target: { value: 'Nonexistent' } })

    expect(screen.getByText('sidebar.noResults')).toBeInTheDocument()
  })

  it('calls onSelect when clicking a character', () => {
    const onSelect = vi.fn()
    render(<Sidebar {...defaultProps} onSelect={onSelect} />)

    fireEvent.click(screen.getByText('Luna'))
    expect(onSelect).toHaveBeenCalledWith(characters[1])
  })

  it('renders when collapsed', () => {
    render(<Sidebar {...defaultProps} collapsed />)
    characters.forEach(char => {
      expect(screen.queryByText(char.name)).toBeNull()
    })
  })

  it('renders import button when onImport is provided', () => {
    render(<Sidebar {...defaultProps} onImport={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    const importBtn = buttons.find(b => b.getAttribute('title') === 'sidebar.importTitle')
    expect(importBtn).toBeInTheDocument()
  })

  it('does not render import button without onImport', () => {
    render(<Sidebar {...defaultProps} />)
    const buttons = screen.getAllByRole('button')
    const importBtn = buttons.find(b => b.getAttribute('title') === 'sidebar.importTitle')
    expect(importBtn).toBeUndefined()
  })
})
