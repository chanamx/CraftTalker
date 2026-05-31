import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, BookOpen, Sliders, X } from 'lucide-react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ChatArea } from '@/components/chat/ChatArea'
import { CharacterPanel } from '@/components/character/CharacterPanel'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'
import type { SidebarProps, ChatAreaProps, CharacterPanelProps, Character } from '@/types'
import type { ChatInfo } from '@/lib/api'
import { ChatSelector } from '@/components/chat/ChatSelector'

interface AppLayoutProps {
  sidebarCollapsed: boolean
  panelCollapsed: boolean
  onToggleSidebar: () => void
  onTogglePanel: () => void
  onOpenSettings: () => void
  onOpenWorldBook: () => void
  onOpenPresets: () => void
  chats: ChatInfo[]
  activeChatId: string | null
  onSelectChat: (chatId: string) => void
  onNewChat: () => void
  onDeleteChat: (chatId: string) => void
  onRenameChat?: (chatId: string, name: string) => void
  sidebar: SidebarProps
  chat: ChatAreaProps
  panel: CharacterPanelProps
}

const springTransition = { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } as const

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

export function AppLayout({
  sidebarCollapsed,
  panelCollapsed,
  onToggleSidebar,
  onTogglePanel,
  onOpenSettings,
  onOpenWorldBook,
  onOpenPresets,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  sidebar,
  chat,
  panel,
}: AppLayoutProps) {
  const isMobile = useMediaQuery('(max-width: 767px)')

  const handleSidebarSelect = useCallback((char: Character) => {
    sidebar.onSelect(char)
    if (isMobile) onToggleSidebar()
  }, [sidebar.onSelect, isMobile, onToggleSidebar])

  const mobileSidebarProps: SidebarProps = { ...sidebar, onSelect: handleSidebarSelect }

  const headerContent = (
    <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150 flex-shrink-0"
          aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <PanelLeftIcon />
        </button>
        <div className="hidden sm:block h-4 w-px bg-[var(--color-border-default)]" />
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {chat.character.name}
        </span>
        <ChatSelector
          chats={chats}
          activeChatId={activeChatId}
          onSelect={onSelectChat}
          onNew={onNewChat}
          onDelete={onDeleteChat}
          onRename={onRenameChat}
        />
        <span className="hidden sm:inline text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-surface)] px-2 py-0.5 rounded-full truncate">
          {chat.character.model}
        </span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenWorldBook}
          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150"
          title="世界书编辑器"
          aria-label="世界书编辑器"
        >
          <BookOpen size={17} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenPresets}
          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150"
          title="预设管理"
          aria-label="预设管理"
        >
          <Sliders size={17} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150"
          aria-label="设置"
        >
          <Settings size={17} />
        </motion.button>
        <ThemeToggle />
        <button
          onClick={onTogglePanel}
          aria-label={panelCollapsed ? '展开角色面板' : '收起角色面板'}
          className={cn(
            'p-1.5 rounded-lg transition-colors duration-150',
            !panelCollapsed
              ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
              : 'hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          )}
        >
          <PanelRightIcon />
        </button>
      </div>
    </header>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg-base)]">
      {/* === DESKTOP SIDEBAR (md+) === */}
      <AnimatePresence initial={false}>
        {!sidebarCollapsed && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={springTransition}
            className="hidden md:block flex-shrink-0 overflow-hidden border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]"
          >
            <Sidebar {...sidebar} />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* === MOBILE SIDEBAR OVERLAY (<md) === */}
      <AnimatePresence>
        {!sidebarCollapsed && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={onToggleSidebar}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={springTransition}
              className="md:hidden fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-[var(--color-bg-elevated)] border-r border-[var(--color-border-subtle)] shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Luker</span>
                <button
                  onClick={onToggleSidebar}
                  aria-label="关闭侧边栏"
                  className="p-1.5 rounded-lg hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]"
                >
                  <X size={18} />
                </button>
              </div>
              <Sidebar {...mobileSidebarProps} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* === MAIN CONTENT === */}
      <main className="flex flex-1 flex-col min-w-0">
        {headerContent}

        <ChatArea {...chat} />
      </main>

      {/* === DESKTOP CHARACTER PANEL (md+) === */}
      <AnimatePresence initial={false}>
        {!panelCollapsed && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={springTransition}
            className="hidden md:block flex-shrink-0 overflow-hidden border-l border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]"
          >
            <CharacterPanel {...panel} />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* === MOBILE CHARACTER PANEL OVERLAY (<md) === */}
      <AnimatePresence>
        {!panelCollapsed && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={onTogglePanel}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={springTransition}
              className="md:hidden fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] bg-[var(--color-bg-elevated)] border-l border-[var(--color-border-subtle)] shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">角色详情</span>
                <button
                  onClick={onTogglePanel}
                  aria-label="关闭角色面板"
                  className="p-1.5 rounded-lg hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]"
                >
                  <X size={18} />
                </button>
              </div>
              <CharacterPanel {...panel} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function PanelLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

function PanelRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
    </svg>
  )
}
