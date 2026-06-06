import { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import type { ChatAreaProps, ChatMessage } from '@/types'

export function ChatArea({ character, messages, isStreaming, onSend, onStop, onDeleteMessage, onEditMessage, onRegenerate, onSwipe, onContinue }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(messages.length)
  const isAtBottomRef = useRef(true)

  const streamingMsg: ChatMessage | null =
    isStreaming && messages.length > 0 && messages[messages.length - 1].id === 'streaming'
      ? messages[messages.length - 1]
      : null

  const displayMessages = streamingMsg ? messages.slice(0, -1) : messages

  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  })

  // track whether user is near bottom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // scroll to bottom when new message added
  useEffect(() => {
    const len = displayMessages.length
    if (len > 0 && len > prevLenRef.current) {
      virtualizer.scrollToIndex(len - 1, { align: 'end' })
      isAtBottomRef.current = true
    }
    prevLenRef.current = len
  }, [displayMessages.length])

  // auto-scroll during streaming if user hasn't scrolled up
  useEffect(() => {
    if (!isStreaming || !streamingMsg || !isAtBottomRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [streamingMsg?.content])

  // scroll to bottom when streaming starts (loading dots appear)
  useEffect(() => {
    if (!isStreaming) return
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      isAtBottomRef.current = true
    }
  }, [isStreaming])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 sm:px-4 py-3 sm:py-4"
      >
        {messages.length === 0 && !isStreaming ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex flex-col items-center justify-center h-full text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent-muted)] flex items-center justify-center mb-4">
              <span className="text-2xl font-bold text-[var(--color-accent)]">
                {character.name[0]}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
              {character.name}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-sm line-clamp-3">
              {character.description}
            </p>
          </motion.div>
        ) : (
          <div
            className="max-w-3xl mx-auto relative"
            style={{ height: `${virtualizer.getTotalSize() + (isStreaming ? 60 : 0)}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const msg = displayMessages[virtualItem.index]
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <MessageBubble
                    message={msg}
                    characterName={character.name}
                    showActions
                    onEdit={onEditMessage}
                    onDelete={onDeleteMessage}
                    onRegenerate={onRegenerate}
                    onSwipe={onSwipe}
                  />
                </div>
              )
            })}

            {streamingMsg && (
              <div
                className="absolute top-0 left-0 w-full"
                style={{
                  transform: `translateY(${virtualizer.getTotalSize()}px)`,
                }}
              >
                <MessageBubble
                  message={streamingMsg}
                  characterName={character.name}
                />
              </div>
            )}

            {isStreaming && !streamingMsg && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 max-w-3xl absolute top-0 left-0 w-full"
                style={{
                  transform: `translateY(${virtualizer.getTotalSize()}px)`,
                }}
              >
                <div className="w-8 h-8 rounded-xl bg-[var(--color-accent-muted)] flex items-center justify-center text-[var(--color-accent)] text-xs font-semibold flex-shrink-0 mt-0.5">
                  {character.name[0]}
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-[var(--color-bot-bubble)]">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      <div className="flex-shrink-0">
        {onContinue && !isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
          <div className="flex justify-center pb-1">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onContinue}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors"
            >
              <ArrowRight size={12} /> 继续生成
            </motion.button>
          </div>
        )}
        <ChatInput onSend={onSend} onStop={onStop} disabled={isStreaming} isStreaming={isStreaming} />
      </div>
    </div>
  )
}
