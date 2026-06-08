import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatArea } from '@/components/chat/ChatArea'
import type { Character } from '@/types'

const character: Character = {
  id: 'RecoverBot',
  name: 'RecoverBot',
  avatar: null,
  description: 'A recovery test character',
  model: 'default',
  lastMessage: '',
  pinned: false,
  file_name: 'RecoverBot',
  world: null,
}

describe('ChatArea recovery banner', () => {
  it('shows recoverable partial content and calls recovery actions', async () => {
    const user = userEvent.setup()
    const onCommitRun = vi.fn()
    const onDiscardRun = vi.fn()

    render(
      <ChatArea
        character={character}
        messages={[]}
        isStreaming={false}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onDeleteMessage={vi.fn()}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        recoverableRun={{
          runId: 'run-1',
          characterName: 'RecoverBot',
          chatId: 'chat-1',
          operation: 'generate',
          status: 'interrupted',
          createdAt: '2026-06-09T00:00:00.000Z',
          updatedAt: '2026-06-09T00:00:01.000Z',
          startedAt: '2026-06-09T00:00:00.000Z',
          partialContent: 'Recovered text preview',
        }}
        onCommitRun={onCommitRun}
        onDiscardRun={onDiscardRun}
      />
    )

    expect(screen.getByText('发现未保存回复')).toBeInTheDocument()
    expect(screen.getByText('Recovered text preview')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '恢复到聊天' }))
    expect(onCommitRun).toHaveBeenCalledWith('run-1')

    await user.click(screen.getByRole('button', { name: '忽略未保存回复' }))
    expect(onDiscardRun).toHaveBeenCalledWith('run-1')
  })
})
