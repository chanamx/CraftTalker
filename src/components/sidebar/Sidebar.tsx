import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Search, Pin, MessageCircle, Import, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fadeIn, staggerContainer, slideInLeft } from '@/lib/motion'
import { SidebarSkeleton } from '@/components/ui/Skeleton'
import type { SidebarProps, Character } from '@/types'

interface SidebarPropsExtended extends SidebarProps {
  onImport?: () => void
}

export function Sidebar({ characters, activeId, onSelect, onImport, onCreate, loading, collapsed }: SidebarPropsExtended) {
  const [search, setSearch] = useState('')
  const { t } = useTranslation()

  const pinned = characters.filter(c => c.pinned)
  const unpinned = characters.filter(c => !c.pinned)
  const filtered = search
    ? characters.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : null

  if (collapsed) {
    return (
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center h-full py-3 gap-2"
      >
        {onCreate && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onCreate}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors duration-150"
            title="创建角色"
          >
            <Plus size={16} />
          </motion.button>
        )}
        {onImport && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onImport}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors duration-150"
            title={t('sidebar.importTitle')}
          >
            <Import size={16} />
          </motion.button>
        )}
      </motion.div>
    )
  }

  if (loading) {
    return <SidebarSkeleton />
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="flex flex-col h-full"
    >
      <div className="p-3 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-sm font-semibold text-[var(--color-text-primary)] tracking-tight">
            CraftTalker
          </h1>
          <div className="flex items-center gap-1">
            {onCreate && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onCreate}
                className="p-1.5 rounded-lg hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors duration-150"
                title="创建角色"
                aria-label="创建角色"
              >
                <Plus size={16} />
              </motion.button>
            )}
            {onImport && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onImport}
                className="p-1.5 rounded-lg hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors duration-150"
                title={t('sidebar.importTitle')}
                aria-label={t('sidebar.importAria')}
              >
                <Import size={16} />
              </motion.button>
            )}
          </div>
        </div>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('sidebar.searchPlaceholder')}
            aria-label={t('sidebar.searchAria')}
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30 transition-all duration-150"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered ? (
          filtered.length > 0 ? (
            <CharacterSection
              title={t('sidebar.searchResults')}
              characters={filtered}
              activeId={activeId}
              onSelect={onSelect}
            />
          ) : (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-[var(--color-text-muted)]">{t('sidebar.noResults')}</span>
            </div>
          )
        ) : (
          <>
            {pinned.length > 0 && (
              <CharacterSection
                title={t('sidebar.pinned')}
                icon={<Pin size={12} />}
                characters={pinned}
                activeId={activeId}
                onSelect={onSelect}
              />
            )}
            <CharacterSection
              title={t('sidebar.recent')}
              icon={<MessageCircle size={12} />}
              characters={unpinned}
              activeId={activeId}
              onSelect={onSelect}
            />
          </>
        )}
      </div>

      <div className="p-3 border-t border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
          <span>{t('sidebar.connected')}</span>
        </div>
      </div>
    </motion.div>
  )
}

function CharacterSection({
  title,
  icon,
  characters,
  activeId,
  onSelect,
}: {
  title: string
  icon?: React.ReactNode
  characters: Character[]
  activeId: string
  onSelect: (char: Character) => void
}) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 px-3 py-2">
        {icon && <span className="text-[var(--color-text-muted)]">{icon}</span>}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {title}
        </span>
      </div>
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {characters.map((char, i) => (
          <motion.button
            key={char.id}
            variants={slideInLeft}
            custom={i}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(char)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 group',
              activeId === char.id
                ? 'bg-[var(--color-accent-muted)] border-r-2 border-r-[var(--color-accent)]'
                : 'hover:bg-[var(--color-bg-surface)] border-r-2 border-r-transparent'
            )}
          >
            <CharacterAvatar name={char.name} avatar={char.avatar} active={activeId === char.id} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  'text-sm font-medium truncate',
                  activeId === char.id
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-primary)]'
                )}>
                  {char.name}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">
                {char.lastMessage}
              </p>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}

function CharacterAvatar({ name, avatar, active }: { name: string; avatar: string | null; active: boolean }) {
  const colors = [
    'bg-oklch(0.65 0.2 280)', 'bg-oklch(0.6 0.2 200)',
    'bg-oklch(0.65 0.2 40)', 'bg-oklch(0.6 0.2 320)',
    'bg-oklch(0.6 0.2 140)',
  ]
  const colorIndex = name.charCodeAt(0) % colors.length

  if (avatar) {
    return (
      <div className={cn(
        'w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden ring-2 ring-offset-1 transition-all duration-200',
        active ? 'ring-[var(--color-accent)] ring-offset-[var(--color-bg-elevated)]' : 'ring-transparent'
      )}>
        <img src={avatar} alt={name} className="w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <div className={cn(
      'w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-sm font-semibold transition-all duration-200',
      colors[colorIndex],
      active ? 'ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-bg-elevated)]' : ''
    )}>
      {name[0]}
    </div>
  )
}
