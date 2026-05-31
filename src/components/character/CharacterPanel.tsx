import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Globe, Info, MessageSquare, BookOpen, Sliders, Zap, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fadeIn, staggerContainer, slideInRight } from '@/lib/motion'
import type { CharacterPanelProps } from '@/types'

export function CharacterPanel({
  character,
  onTemperatureChange,
  onTopPChange,
  onContextLengthChange,
  onMaxReplyLengthChange,
  temperature = 0.7,
  topP = 0.9,
  contextLength = 4096,
  maxReplyLength = 512,
  onOpenWorldBook,
  onOpenPresets,
  onOpenSettings,
}: CharacterPanelProps) {
  const [showGenSettings, setShowGenSettings] = useState(false)
  const [showChatSettings, setShowChatSettings] = useState(false)
  const [showCharInfo, setShowCharInfo] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const colors = [
    'from-oklch(0.65 0.2 280) to-oklch(0.55 0.2 320)',
    'from-oklch(0.6 0.2 200) to-oklch(0.5 0.2 260)',
    'from-oklch(0.65 0.2 40) to-oklch(0.55 0.2 0)',
    'from-oklch(0.6 0.2 320) to-oklch(0.5 0.2 280)',
    'from-oklch(0.6 0.2 140) to-oklch(0.5 0.2 200)',
  ]
  const colorIndex = character.name.charCodeAt(0) % colors.length

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="flex flex-col h-full"
    >
      <div className={cn(
        'h-32 bg-gradient-to-br flex items-end p-4',
        colors[colorIndex]
      )}>
        {character.avatar ? (
          <div className="w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-white/30 translate-y-8">
            <img src={character.avatar} alt={character.name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-xl font-bold ring-2 ring-white/30 translate-y-8">
            {character.name[0]}
          </div>
        )}
      </div>

      <div className="px-4 pt-10 pb-2">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          {character.name}
        </h2>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
          {character.description}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-1"
        >
          <PanelItem icon={<Zap size={15} />} label="生成设置" onClick={() => setShowGenSettings(!showGenSettings)}>
            <ChevronDown
              size={13}
              className={cn(
                'text-[var(--color-text-muted)] transition-transform duration-200',
                showGenSettings && 'rotate-180'
              )}
            />
          </PanelItem>

          {showGenSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 px-3 py-2">
                <SliderField
                  label="Temperature"
                  value={temperature}
                  min={0}
                  max={5}
                  step={0.01}
                  onChange={onTemperatureChange}
                />
                <SliderField
                  label="Top-P"
                  value={topP}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={onTopPChange}
                />
                <SliderField
                  label="上下文长度"
                  value={contextLength}
                  min={512}
                  max={2000000}
                  step={1}
                  onChange={onContextLengthChange}
                />
                <SliderField
                  label="最大回复长度"
                  value={maxReplyLength}
                  min={1}
                  max={2000000}
                  step={1}
                  onChange={onMaxReplyLengthChange}
                />
              </div>
            </motion.div>
          )}

          <PanelItem
            icon={<MessageSquare size={15} />}
            label="聊天设置"
            onClick={() => setShowChatSettings(!showChatSettings)}
          >
            <ChevronDown
              size={13}
              className={cn(
                'text-[var(--color-text-muted)] transition-transform duration-200',
                showChatSettings && 'rotate-180'
              )}
            />
          </PanelItem>

          {showChatSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 px-3 py-2">
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  当前 LLM 配置已在全局设置中管理。点击下方按钮修改 API 地址、密钥及模型参数。
                </p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onOpenSettings}
                  className="w-full py-2 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] transition-colors duration-150"
                  aria-label="打开 LLM 设置"
                >
                  打开 LLM 设置
                </motion.button>
              </div>
            </motion.div>
          )}

          <PanelItem
            icon={<BookOpen size={15} />}
            label="世界书"
            badge={character.world || undefined}
            onClick={onOpenWorldBook}
          />
          <PanelItem
            icon={<Sliders size={15} />}
            label="生成预设"
            badge="默认"
            onClick={onOpenPresets}
          />
          <PanelItem
            icon={<Globe size={15} />}
            label="角色卡信息"
            onClick={() => setShowCharInfo(!showCharInfo)}
          >
            <ChevronDown
              size={13}
              className={cn(
                'text-[var(--color-text-muted)] transition-transform duration-200',
                showCharInfo && 'rotate-180'
              )}
            />
          </PanelItem>

          {showCharInfo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 px-3 py-2">
                <InfoRow label="角色名称" value={character.name} />
                <InfoRow label="模型" value={character.model || '默认'} />
                <InfoRow label="文件标识" value={character.file_name} />
                {character.description && (
                  <InfoRow
                    label="简介"
                    value={character.description.length > 60
                      ? character.description.slice(0, 60) + '...'
                      : character.description}
                  />
                )}
              </div>
            </motion.div>
          )}

          <PanelItem
            icon={<Info size={15} />}
            label="关于角色"
            onClick={() => setShowAbout(!showAbout)}
          >
            <ChevronDown
              size={13}
              className={cn(
                'text-[var(--color-text-muted)] transition-transform duration-200',
                showAbout && 'rotate-180'
              )}
            />
          </PanelItem>

          {showAbout && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 px-3 py-2">
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  {character.description || '暂无角色描述信息。'}
                </p>
                <div className="border-t border-[var(--color-border-subtle)] pt-2">
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    角色 ID: {character.id || character.file_name}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>

      <div className="p-3 border-t border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
          <span>模型: {character.model}</span>
        </div>
      </div>
    </motion.div>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange?: (value: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const displayValue = step < 1 ? value.toFixed(step === 0.01 ? 2 : 1) : String(value)

  function startEdit() {
    setInputVal(displayValue)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitEdit() {
    const n = parseFloat(inputVal)
    if (!isNaN(n)) {
      onChange?.(Math.min(max, Math.max(min, n)))
    }
    setEditing(false)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-text-muted)]">{label}</span>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            min={min}
            max={max}
            step={step}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
            className="w-20 text-[11px] font-mono font-medium text-right bg-[var(--color-bg-surface)] border border-[var(--color-accent)] rounded px-1 outline-none"
          />
        ) : (
          <button
            onClick={startEdit}
            className="text-[11px] font-mono font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors cursor-text"
          >
            {displayValue}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange?.(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-[var(--color-bg-surface)] cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-accent)]
          [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-[var(--color-accent)]/20
          [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150
          hover:[&::-webkit-slider-thumb]:scale-125"
      />
    </div>
  )
}

function PanelItem({
  icon,
  label,
  badge,
  children,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  badge?: string
  children?: React.ReactNode
  onClick?: () => void
}) {
  return (
    <motion.button
      variants={slideInRight}
      whileHover={{ x: 3, backgroundColor: 'var(--color-bg-surface)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-150"
    >
      <span className="text-[var(--color-text-secondary)]">{icon}</span>
      <span className="text-sm text-[var(--color-text-primary)] flex-1">{label}</span>
      {badge && (
        <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg-surface)] px-1.5 py-0.5 rounded-md">
          {badge}
        </span>
      )}
      {children}
    </motion.button>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">{label}</span>
      <span className="text-[11px] text-[var(--color-text-primary)] text-right break-all">{value}</span>
    </div>
  )
}
