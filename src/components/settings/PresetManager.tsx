import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Sliders, Save, Cpu, Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePresets } from '@/hooks/use-presets'
import { useToast } from '@/lib/toast'
import type { GenerationPreset, PresetType } from '@/lib/api'
import { api } from '@/lib/api'

interface PresetManagerProps {
  open: boolean
  onClose: () => void
}

const PRESET_TYPES: { value: PresetType; label: string }[] = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'kobold', label: 'KoboldAI' },
  { value: 'textgen', label: 'Text Generation UI' },
  { value: 'novel', label: 'NovelAI' },
]

type NumericParamKey = {
  [K in keyof GenerationPreset]: GenerationPreset[K] extends number ? K : never
}[keyof GenerationPreset]

const PARAM_DEFS: { key: NumericParamKey; label: string; step?: number }[] = [
  { key: 'temperature', label: 'Temperature' },
  { key: 'top_p', label: 'Top-P' },
  { key: 'top_k', label: 'Top-K', step: 1 },
  { key: 'top_a', label: 'Top-A' },
  { key: 'min_p', label: 'Min-P' },
  { key: 'max_tokens', label: 'Max Tokens', step: 1 },
  { key: 'repetition_penalty', label: 'Repetition Penalty' },
  { key: 'frequency_penalty', label: 'Frequency Penalty' },
  { key: 'presence_penalty', label: 'Presence Penalty' },
  { key: 'typical_p', label: 'Typical-P' },
  { key: 'tfs', label: 'TFS' },
]

export function PresetManager({ open, onClose }: PresetManagerProps) {
  const [activeType, setActiveType] = useState<PresetType>('openai')
  const { data: presetNames, isLoading } = usePresets(activeType)
  const toast = useToast()
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [editing, setEditing] = useState<GenerationPreset | null>(null)
  const [isNew, setIsNew] = useState<boolean>(false)

  useEffect(() => {
    if (!selectedPreset) return
    api.presets.get(activeType, selectedPreset).then(setEditing).catch(() => toast.error('加载预设失败'))
  }, [selectedPreset, activeType])

  const handleNew = () => {
    const blank: GenerationPreset = {
      name: '新预设',
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      top_a: 0,
      min_p: 0.1,
      max_tokens: 512,
      repetition_penalty: 1.1,
      repetition_penalty_range: 0,
      repetition_penalty_slope: 0,
      frequency_penalty: 0,
      presence_penalty: 0,
      typical_p: 1,
      tfs: 1,
      mirostat_mode: 0,
      mirostat_tau: 5,
      mirostat_eta: 0.1,
      sampler_order: [6, 0, 1, 3, 5, 2, 4],
      skip_special_tokens: true,
      ban_eos_token: false,
      add_bos_token: true,
      token_healing: false,
      seed: -1,
      grammar_string: '',
      guidance_scale: 1,
      negative_prompt: '',
      dry_allowed_length: 2,
      dry_multiplier: 0,
      dry_base: 1.75,
      dry_sequence_breakers: '',
      xtc_threshold: 0.1,
      xtc_probability: 0,
    }
    setEditing(blank)
    setIsNew(true)
  }

  const handleParamChange = (key: keyof GenerationPreset, value: string) => {
    if (!editing) return
    const num = Number(value)
    if (isNaN(num)) return
    setEditing({ ...editing, [key]: num })
  }

  const presetList = presetNames ?? []

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="w-full max-w-2xl bg-[var(--color-bg-elevated)] rounded-2xl shadow-2xl border border-[var(--color-border-subtle)] overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]">
                <div className="flex items-center gap-2">
                  <Sliders size={18} className="text-[var(--color-accent)]" />
                  <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                    预设管理
                  </h2>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]"
                >
                  <X size={18} />
                </motion.button>
              </div>

              <div className="flex border-b border-[var(--color-border-subtle)]">
                {PRESET_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setActiveType(t.value)
                      setSelectedPreset(null)
                      setEditing(null)
                      setIsNew(false)
                    }}
                    className={cn(
                      'flex-1 py-2.5 text-xs font-medium transition-all relative',
                      activeType === t.value
                        ? 'text-[var(--color-accent)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                    )}
                  >
                    {t.label}
                    {activeType === t.value && (
                      <motion.div
                        layoutId="preset-tab"
                        className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[var(--color-accent)] rounded-full"
                        transition={{ duration: 0.2 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex max-h-[60vh]">
                <div className="w-48 border-r border-[var(--color-border-subtle)] flex flex-col">
                  <div className="p-2 border-b border-[var(--color-border-subtle)]">
                    <button
                      onClick={handleNew}
                      className="flex items-center gap-1.5 w-full px-3 py-1.5 rounded-lg text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors"
                    >
                      <Plus size={12} /> 新建预设
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {isLoading && (
                      <div className="text-[10px] text-[var(--color-text-muted)] px-2 py-2">加载中...</div>
                    )}
                    {presetList.map(name => (
                      <motion.button
                        key={name}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => {
                          setSelectedPreset(name)
                          setIsNew(false)
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg text-xs transition-all truncate',
                          selectedPreset === name
                            ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Zap size={11} className="flex-shrink-0" />
                          <span className="truncate">{name}</span>
                        </div>
                      </motion.button>
                    ))}
                    {!isLoading && presetList.length === 0 && (
                      <div className="text-[10px] text-[var(--color-text-muted)] px-2 py-2">暂无预设</div>
                    )}
                  </div>
                </div>

                <div className="flex-1 p-4 overflow-y-auto">
                  {(editing || selectedPreset) ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Cpu size={14} className="text-[var(--color-text-muted)]" />
                        <input
                          type="text"
                          value={editing?.name ?? selectedPreset ?? ''}
                          onChange={e => editing && setEditing({ ...editing, name: e.target.value })}
                          className="flex-1 bg-transparent text-sm font-medium text-[var(--color-text-primary)] focus:outline-none border-b border-transparent focus:border-[var(--color-accent)]/30 px-1"
                        />
                        {isNew && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)]">
                            新建
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {PARAM_DEFS.map(def => (
                          <div key={def.key} className="flex items-center justify-between gap-2">
                            <label className="text-[11px] text-[var(--color-text-secondary)] flex-shrink-0">
                              {def.label}
                            </label>
                            <input
                              type="number"
                              step={def.step ?? 0.01}
                              value={editing?.[def.key] ?? 0}
                              onChange={e => handleParamChange(def.key, e.target.value)}
                              className="w-20 h-7 px-2 rounded-md bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-primary)] text-right focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="h-8 px-4 rounded-lg text-xs font-medium bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] flex items-center gap-1.5"
                        >
                          <Save size={12} /> 保存
                        </motion.button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-muted)]">
                      选择已有预设或新建一个
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Plus({ size, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size ?? 16}
      height={size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
