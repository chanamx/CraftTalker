import { useState } from 'react'
import { motion } from 'framer-motion'
import { User, Pencil, Trash2, RefreshCw, Copy, Check, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { messageIn } from '@/lib/motion'
import { Markdown } from './Markdown'
import type { ChatMessage } from '@/types'

interface MessageBubbleProps {
  message: ChatMessage
  characterName: string
  showActions?: boolean
  onEdit?: (lineIndex: number, content: string) => void
  onDelete?: (lineIndex: number) => void
  onRegenerate?: (lineIndex: number) => void
  onSwipe?: (lineIndex: number, swipeId: number) => void
}

export function MessageBubble({ message, characterName, showActions, onEdit, onDelete, onRegenerate, onSwipe }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(message.content)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const handleSaveEdit = () => {
    if (message.lineIndex != null && onEdit && editValue.trim()) {
      onEdit(message.lineIndex, editValue.trim())
    }
    setEditing(false)
  }

  const handleCancelEdit = () => {
    setEditValue(message.content)
    setEditing(false)
  }

  if (isSystem) {
    return (
      <motion.div variants={messageIn} initial="hidden" animate="visible" className="flex justify-center px-4">
        <div className="px-3 py-1 rounded-lg bg-[var(--color-accent-muted)] text-[10px] text-[var(--color-text-secondary)] italic max-w-lg text-center">
          {message.content}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={messageIn}
      initial="hidden"
      animate="visible"
      className={cn('flex gap-3 group', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      <motion.div
        whileHover={{ scale: 1.05 }}
        className={cn(
          'w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
          isUser ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]',
        )}
      >
        {isUser ? (
          <User size={13} className="sm:w-[14px] sm:h-[14px]" />
        ) : (
          <span className="text-[11px] sm:text-xs font-semibold">{characterName[0]}</span>
        )}
      </motion.div>

      <div className={cn('flex flex-col max-w-[85%] sm:max-w-[75%]', isUser ? 'items-end' : 'items-start')}>
        <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 px-1">
          <span className="text-[11px] sm:text-xs font-medium text-[var(--color-text-secondary)]">
            {isUser ? '你' : characterName}
          </span>
          <span className="text-[9px] sm:text-[10px] text-[var(--color-text-muted)]">
            {formatTime(message.timestamp)}
          </span>
        </div>

        {editing ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
          >
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full min-w-[200px] px-3 py-2 rounded-xl text-[13px] sm:text-sm bg-[var(--color-bg-surface)] border border-[var(--color-accent)]/30 text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 resize-none"
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSaveEdit()
                }
                if (e.key === 'Escape') handleCancelEdit()
              }}
            />
            <div className="flex items-center gap-1.5 mt-1.5">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSaveEdit}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--color-accent)] text-white text-[11px] font-medium"
              >
                <Check size={12} /> 保存
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCancelEdit}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] text-[11px] font-medium border border-[var(--color-border-subtle)]"
              >
                <X size={12} /> 取消
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            whileHover={{ scale: 1.01 }}
            className={cn(
              'px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap break-words',
              isUser
                ? 'rounded-tr-md bg-[var(--color-user-bubble)] text-white'
                : 'rounded-tl-md bg-[var(--color-bot-bubble)] text-[var(--color-text-primary)]',
            )}
          >
            <Markdown content={message.content} isUser={isUser} />
          </motion.div>
        )}

        {!isUser && message.swipes && message.swipes.length > 1 && !editing && (
          <div className="flex items-center gap-2 mt-1 px-1">
            <button
              onClick={() => onSwipe?.(message.lineIndex!, (message.swipeId ?? 0) - 1)}
              disabled={(message.swipeId ?? 0) <= 0}
              className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {(message.swipeId ?? 0) + 1}/{message.swipes.length}
            </span>
            <button
              onClick={() => onSwipe?.(message.lineIndex!, (message.swipeId ?? 0) + 1)}
              disabled={(message.swipeId ?? 0) >= message.swipes.length - 1}
              className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {showActions && message.lineIndex != null && !editing && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'flex items-center gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150',
              isUser ? 'flex-row-reverse' : 'flex-row',
            )}
          >
            <ActionButton icon={<Copy size={11} />} label={copied ? '已复制' : '复制'} onClick={handleCopy} />
            {onEdit && (
              <ActionButton icon={<Pencil size={11} />} label="编辑" onClick={() => {
                setEditValue(message.content)
                setEditing(true)
              }} />
            )}
            {onRegenerate && !isUser && (
              <ActionButton icon={<RefreshCw size={11} />} label="重新生成" onClick={() => onRegenerate(message.lineIndex!)} />
            )}
            {onDelete && (
              <ActionButton icon={<Trash2 size={11} />} label="删除" danger onClick={() => onDelete(message.lineIndex!)} />
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

function ActionButton({ icon, label, danger, onClick }: { icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-colors duration-100',
        danger
          ? 'text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </motion.button>
  )
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
