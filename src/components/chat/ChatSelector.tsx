import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, MessageCircle, Check, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatInfo } from '@/lib/api'

interface ChatSelectorProps {
  chats: ChatInfo[]
  activeChatId: string | null
  onSelect: (chatId: string) => void
  onNew: () => void
  onDelete: (chatId: string) => void
  onRename?: (chatId: string, name: string) => void
}

export function ChatSelector({ chats, activeChatId, onSelect, onNew, onDelete, onRename }: ChatSelectorProps) {
  const [open, setOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const activeChat = chats.find(c => c.file_id === activeChatId)

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 h-7 px-2.5 rounded-lg text-xs transition-all duration-150',
          'bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]',
          'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)]'
        )}
      >
        <MessageCircle size={12} />
        <span className="max-w-[100px] truncate">
          {activeChat?.mes?.slice(0, 20) || '新对话'}
        </span>
        <span className="text-[var(--color-text-muted)]">▾</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute left-0 top-full mt-1 w-72 bg-[var(--color-bg-elevated)] rounded-xl shadow-xl border border-[var(--color-border-subtle)] overflow-hidden z-50"
            >
              <div className="max-h-64 overflow-y-auto">
                {chats.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">
                    暂无对话记录
                  </div>
                )}
                {chats.map(chat => (
                  <div
                    key={chat.file_id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors group',
                      chat.file_id === activeChatId
                        ? 'bg-[var(--color-accent-muted)]'
                        : 'hover:bg-[var(--color-bg-surface)]'
                    )}
                    onClick={() => {
                      if (renamingId !== chat.file_id) {
                        onSelect(chat.file_id)
                        setOpen(false)
                      }
                    }}
                  >
                    <MessageCircle
                      size={13}
                      className={cn(
                        'flex-shrink-0',
                        chat.file_id === activeChatId
                          ? 'text-[var(--color-accent)]'
                          : 'text-[var(--color-text-muted)]'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      {renamingId === chat.file_id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && renameValue.trim()) {
                              onRename?.(chat.file_id, renameValue.trim())
                              setRenamingId(null)
                            }
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          onBlur={() => setRenamingId(null)}
                          onClick={e => e.stopPropagation()}
                          className="w-full text-xs bg-transparent border-b border-[var(--color-accent)] text-[var(--color-text-primary)] focus:outline-none"
                        />
                      ) : (
                        <>
                          <p className="text-xs text-[var(--color-text-primary)] truncate">
                            {chat.file_name || chat.mes?.slice(0, 40) || '空对话'}
                          </p>
                          <p className="text-[10px] text-[var(--color-text-muted)]">
                            {chat.chat_items} 条消息
                          </p>
                        </>
                      )}
                    </div>
                    {chat.file_id === activeChatId && (
                      <Check size={13} className="text-[var(--color-accent)] flex-shrink-0" />
                    )}
                    {onRename && renamingId !== chat.file_id && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={e => {
                          e.stopPropagation()
                          setRenamingId(chat.file_id)
                          setRenameValue(chat.file_name || '')
                        }}
                        className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Pencil size={12} />
                      </motion.button>
                    )}
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={e => {
                        e.stopPropagation()
                        onDelete(chat.file_id)
                      }}
                      className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={12} />
                    </motion.button>
                  </div>
                ))}
              </div>
              <div className="border-t border-[var(--color-border-subtle)] p-1">
                <button
                  onClick={() => {
                    onNew()
                    setOpen(false)
                  }}
                  className="flex items-center gap-2 w-full px-4 py-2 rounded-lg text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors"
                >
                  <Plus size={13} />
                  新建对话
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
