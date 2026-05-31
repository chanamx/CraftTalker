import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageBubble } from '@/components/chat/MessageBubble'
import type { ChatMessage } from '@/types'

describe('MessageBubble', () => {
  const userMessage: ChatMessage = {
    id: '1',
    role: 'user',
    content: 'Hello there!',
    timestamp: Date.now(),
  }

  const assistantMessage: ChatMessage = {
    id: '2',
    role: 'assistant',
    content: 'Hi! How can I help?',
    timestamp: Date.now(),
  }

  it('renders user message with content', () => {
    render(<MessageBubble message={userMessage} characterName="Allen" />)
    expect(screen.getByText('Hello there!')).toBeInTheDocument()
  })

  it('renders assistant message with content', () => {
    render(<MessageBubble message={assistantMessage} characterName="Allen" />)
    expect(screen.getByText('Hi! How can I help?')).toBeInTheDocument()
  })

  it('shows character initial for assistant messages', () => {
    render(<MessageBubble message={assistantMessage} characterName="Allen" />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('shows user label for user messages', () => {
    render(<MessageBubble message={userMessage} characterName="Allen" />)
    expect(screen.getByText('你')).toBeInTheDocument()
  })

  it('formats timestamp correctly', () => {
    render(<MessageBubble message={userMessage} characterName="Allen" />)
    const time = new Date(userMessage.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    expect(screen.getByText(time)).toBeInTheDocument()
  })

  it('renders multiline content', () => {
    const multiline: ChatMessage = {
      id: '3',
      role: 'user',
      content: 'Line 1\nLine 2\nLine 3',
      timestamp: Date.now(),
    }
    render(<MessageBubble message={multiline} characterName="Allen" />)
    expect(screen.getByText(/Line 1/)).toBeInTheDocument()
    expect(screen.getByText(/Line 2/)).toBeInTheDocument()
    expect(screen.getByText(/Line 3/)).toBeInTheDocument()
  })

  it('renders empty content gracefully', () => {
    const empty: ChatMessage = {
      id: '4',
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    render(<MessageBubble message={empty} characterName="Allen" />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('renders code-style content in monospace', () => {
    const codeMsg: ChatMessage = {
      id: '5',
      role: 'assistant',
      content: 'const x = 42',
      timestamp: Date.now(),
    }
    render(<MessageBubble message={codeMsg} characterName="Allen" />)
    expect(screen.getByText('const x = 42')).toBeInTheDocument()
  })
})
