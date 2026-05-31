import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Send, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (content: string) => void
  onStop?: () => void
  disabled?: boolean
  isStreaming?: boolean
}

export function ChatInput({ onSend, onStop, disabled, isStreaming }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { t } = useTranslation()

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    textareaRef.current?.focus()
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex-shrink-0 px-2 sm:px-4 pb-3 sm:pb-4 pt-2"
    >
      <div className="max-w-3xl mx-auto">
        <div className={cn(
          'flex items-end gap-2 p-2 rounded-2xl border transition-all duration-200',
          'bg-[var(--color-bg-surface)] border-[var(--color-border-subtle)]',
          'focus-within:border-[var(--color-accent)]/30 focus-within:ring-2 focus-within:ring-[var(--color-accent)]/10'
        )}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMobile ? t('chat.inputPlaceholder') : t('chat.inputPlaceholderDesktop')}
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none bg-transparent text-[13px] sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none py-1.5 max-h-32"
          />

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            onClick={isStreaming ? onStop : handleSend}
            disabled={!isStreaming && (!value.trim() || disabled)}
            aria-label={isStreaming ? '停止生成' : t('chat.sendAria')}
            className={cn(
              'p-1.5 sm:p-2 rounded-xl flex-shrink-0 transition-all duration-200',
              isStreaming
                ? 'bg-[var(--color-danger)] text-white hover:opacity-90'
                : value.trim() && !disabled
                  ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'
                  : 'bg-[var(--color-border-subtle)] text-[var(--color-text-muted)] cursor-not-allowed'
            )}
          >
            {isStreaming ? <Square size={15} className="sm:w-[16px] sm:h-[16px]" /> : <Send size={15} className="sm:w-[16px] sm:h-[16px]" />}
          </motion.button>
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] text-center mt-2">
          {t('app.disclaimer')}
        </p>
      </div>
    </motion.div>
  )
}
