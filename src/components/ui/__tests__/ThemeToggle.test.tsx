import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    localStorage.removeItem('luker-theme')
  })

  it('renders a button with sun or moon icon', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  it('toggles dark class on document element', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button')

    expect(document.documentElement.classList.contains('dark')).toBe(false)

    fireEvent.click(button)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    fireEvent.click(button)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists theme preference to localStorage', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button')

    fireEvent.click(button)
    expect(localStorage.getItem('luker-theme')).toBe('dark')

    fireEvent.click(button)
    expect(localStorage.getItem('luker-theme')).toBe('light')
  })
})
