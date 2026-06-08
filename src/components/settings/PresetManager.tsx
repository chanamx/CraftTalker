import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Cpu, FileJson, Plus, Save, Sliders, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePresets } from '@/hooks/use-presets'
import { useToast } from '@/lib/toast'
import { api, type GenerationPreset, type PresetData, type PresetType } from '@/lib/api'

interface PresetManagerProps {
  open: boolean
  onClose: () => void
}

const PRESET_TYPES: { value: PresetType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'kobold', label: 'KoboldAI' },
  { value: 'textgen', label: 'TextGen' },
  { value: 'novel', label: 'NovelAI' },
  { value: 'instruct', label: 'Instruct' },
  { value: 'context', label: 'Context' },
  { value: 'sysprompt', label: 'System' },
  { value: 'reasoning', label: 'Reasoning' },
]

const TEMPLATE_PRESET_TYPES = new Set<PresetType>(['instruct', 'context', 'sysprompt', 'reasoning'])

type NumericParamKey =
  | 'temperature'
  | 'top_p'
  | 'top_k'
  | 'top_a'
  | 'min_p'
  | 'max_tokens'
  | 'repetition_penalty'
  | 'frequency_penalty'
  | 'presence_penalty'
  | 'typical_p'
  | 'tfs'

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

function createGenerationPreset(): GenerationPreset {
  return {
    name: 'New Preset',
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
}

function getNumericValue(preset: PresetData, key: NumericParamKey): number {
  const value = preset[key]
  return typeof value === 'number' ? value : 0
}

export function PresetManager({ open, onClose }: PresetManagerProps) {
  const [activeType, setActiveType] = useState<PresetType>('openai')
  const { data: presetNames, isLoading, refetch } = usePresets(activeType)
  const toast = useToast()
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [editing, setEditing] = useState<PresetData | null>(null)
  const [jsonDraft, setJsonDraft] = useState('')
  const [isNew, setIsNew] = useState(false)
  const isTemplateType = TEMPLATE_PRESET_TYPES.has(activeType)
  const presetList = presetNames ?? []

  useEffect(() => {
    if (!selectedPreset) return
    api.presets.get(activeType, selectedPreset)
      .then((preset) => {
        setEditing(preset)
        setJsonDraft(JSON.stringify(preset, null, 2))
      })
      .catch(() => toast.error('加载预设失败'))
  }, [selectedPreset, activeType, toast])

  const parsedJsonName = useMemo(() => {
    if (!isTemplateType) return editing?.name ?? ''
    try {
      const parsed = JSON.parse(jsonDraft) as { name?: unknown }
      return typeof parsed.name === 'string' ? parsed.name : ''
    } catch {
      return ''
    }
  }, [editing?.name, isTemplateType, jsonDraft])

  const handleTypeChange = (type: PresetType) => {
    setActiveType(type)
    setSelectedPreset(null)
    setEditing(null)
    setJsonDraft('')
    setIsNew(false)
  }

  const handleNew = () => {
    const blank: PresetData = isTemplateType ? { name: 'New Preset' } : createGenerationPreset()
    setEditing(blank)
    setJsonDraft(JSON.stringify(blank, null, 2))
    setSelectedPreset(null)
    setIsNew(true)
  }

  const handleParamChange = (key: keyof GenerationPreset, value: string) => {
    if (!editing) return
    const num = Number(value)
    if (Number.isNaN(num)) return
    setEditing({ ...editing, [key]: num })
  }

  const handleSave = async () => {
    if (!editing) return
    try {
      const preset = isTemplateType ? JSON.parse(jsonDraft) as PresetData : editing
      if (typeof preset.name !== 'string' || !preset.name.trim()) {
        toast.error('预设名称不能为空')
        return
      }

      const saved = await api.presets.save(activeType, preset)
      setEditing(saved)
      setJsonDraft(JSON.stringify(saved, null, 2))
      setSelectedPreset(saved.name)
      setIsNew(false)
      await refetch()
      toast.success('预设已保存')
    } catch (error) {
      toast.error(error instanceof SyntaxError ? 'JSON 格式无效' : '保存预设失败')
    }
  }

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
              className="w-full max-w-3xl bg-[var(--color-bg-elevated)] rounded-2xl shadow-2xl border border-[var(--color-border-subtle)] overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]">
                <div className="flex items-center gap-2">
                  <Sliders size={18} className="text-[var(--color-accent)]" />
                  <h2 className="text-base font-semibold text-[var(--color-text-primary)]">预设管理</h2>
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

              <div className="grid grid-cols-4 border-b border-[var(--color-border-subtle)]">
                {PRESET_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => handleTypeChange(t.value)}
                    className={cn(
                      'py-2.5 text-xs font-medium transition-all relative',
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

              <div className="flex max-h-[64vh]">
                <div className="w-52 border-r border-[var(--color-border-subtle)] flex flex-col">
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
                          {isTemplateType ? <FileJson size={11} /> : <Zap size={11} />}
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
                  {editing ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        {isTemplateType ? (
                          <FileJson size={14} className="text-[var(--color-text-muted)]" />
                        ) : (
                          <Cpu size={14} className="text-[var(--color-text-muted)]" />
                        )}
                        <input
                          type="text"
                          value={isTemplateType ? parsedJsonName : editing.name}
                          disabled={isTemplateType}
                          onChange={e => setEditing({ ...editing, name: e.target.value })}
                          className="flex-1 bg-transparent text-sm font-medium text-[var(--color-text-primary)] focus:outline-none border-b border-transparent focus:border-[var(--color-accent)]/30 px-1 disabled:opacity-80"
                        />
                        {isNew && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)]">
                            新建
                          </span>
                        )}
                      </div>

                      {isTemplateType ? (
                        <textarea
                          value={jsonDraft}
                          onChange={e => setJsonDraft(e.target.value)}
                          spellCheck={false}
                          className="w-full min-h-64 resize-y rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] p-3 font-mono text-xs leading-relaxed text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
                        />
                      ) : (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {PARAM_DEFS.map(def => (
                            <div key={def.key} className="flex items-center justify-between gap-2">
                              <label className="text-[11px] text-[var(--color-text-secondary)] flex-shrink-0">
                                {def.label}
                              </label>
                              <input
                                type="number"
                                step={def.step ?? 0.01}
                                value={getNumericValue(editing, def.key)}
                                onChange={e => handleParamChange(def.key, e.target.value)}
                                className="w-20 h-7 px-2 rounded-md bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-primary)] text-right focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-2">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleSave}
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
