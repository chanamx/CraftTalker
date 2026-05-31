import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatInput } from '@/components/chat/ChatInput'

function getSendButton() {
  const buttons = screen.getAllByRole('button')
  return buttons[buttons.length - 1]
}

describe('ChatInput', () => {
  it('renders the input field', () => {
    render(<ChatInput onSend={vi.fn()} />)
    expect(screen.getByPlaceholderText(/chat.input/)).toBeInTheDocument()
  })

  it('calls onSend with input value on button click', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    const input = screen.getByPlaceholderText(/chat.input/)
    fireEvent.change(input, { target: { value: 'Test message' } })

    fireEvent.click(getSendButton())

    expect(onSend).toHaveBeenCalledWith('Test message')
  })

  it('calls onSend with input value on Enter key', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    const input = screen.getByPlaceholderText(/chat.input/)
    fireEvent.change(input, { target: { value: 'Enter test' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    expect(onSend).toHaveBeenCalledWith('Enter test')
  })

  it('does not call onSend on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    const input = screen.getByPlaceholderText(/chat.input/)
    fireEvent.change(input, { target: { value: 'Shift enter' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('clears input after sending', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    const input = screen.getByPlaceholderText(/chat.input/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'To be cleared' } })
    fireEvent.click(getSendButton())

    expect(input.value).toBe('')
  })

  it('does not send empty messages', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    fireEvent.click(getSendButton())

    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not send whitespace-only messages', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    const input = screen.getByPlaceholderText(/chat.input/)
    fireEvent.change(input, { target: { value: '   ' } })

    fireEvent.click(getSendButton())

    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables input when disabled prop is true', () => {
    render(<ChatInput onSend={vi.fn()} disabled />)
    const input = screen.getByPlaceholderText(/chat.input/)
    expect(input).toBeDisabled()
  })

  it('disables send button when disabled prop is true', () => {
    render(<ChatInput onSend={vi.fn()} disabled />)
    const sendBtn = getSendButton()
    expect(sendBtn).toBeDisabled()
  })
})
