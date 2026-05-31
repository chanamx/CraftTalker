import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Globe, Key, Cpu, Zap, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { LLMConfig } from '@/types'

export type { LLMConfig }

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  config: LLMConfig
  onSave: (config: LLMConfig) => void
}

const API_TYPES: { value: LLMConfig['type']; label: string }[] = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'kobold', label: 'KoboldAI' },
  { value: 'textgen', label: 'Text Generation UI' },
  { value: 'novel', label: 'NovelAI' },
  { value: 'custom', label: '自定义' },
]

export function SettingsDialog({ open, onClose, config, onSave }: SettingsDialogProps) {
  const [local, setLocal] = useState(config)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null)
  const [tab, setTab] = useState<'llm' | 'ui'>('llm')

  const handleSave = () => {
    onSave(local)
    onClose()
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.testConnection(local)
      setTestResult(res.success ? 'success' : 'fail')
    } catch {
      setTestResult('fail')
    }
    setTesting(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
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
              className="w-full max-w-lg bg-[var(--color-bg-elevated)] rounded-2xl shadow-2xl border border-[var(--color-border-subtle)] overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]">
                <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                  设置
                </h2>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  aria-label="关闭设置"
                  className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] transition-all"
                >
                  <X size={18} />
                </motion.button>
              </div>

              <div className="flex border-b border-[var(--color-border-subtle)]">
                {(['llm', 'ui'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      'flex-1 py-2.5 text-sm font-medium transition-all duration-150 relative',
                      tab === t
                        ? 'text-[var(--color-accent)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                    )}
                  >
                    {t === 'llm' ? 'LLM 连接' : '界面设置'}
                    {tab === t && (
                      <motion.div
                        layoutId="settings-tab"
                        className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[var(--color-accent)] rounded-full"
                        transition={{ duration: 0.2 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                {tab === 'llm' && (
                  <>
                    <Field label="API 类型" icon={<Globe size={15} />}>
                      <select
                        value={local.type}
                        onChange={e => setLocal(s => ({ ...s, type: e.target.value as LLMConfig['type'] }))}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                      >
                        {API_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="API 地址" icon={<Globe size={15} />}>
                      <input
                        type="text"
                        value={local.apiUrl}
                        onChange={e => setLocal(s => ({ ...s, apiUrl: e.target.value }))}
                        placeholder="http://localhost:1234/v1"
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                      />
                    </Field>

                    <Field label="API 密钥" icon={<Key size={15} />}>
                      <input
                        type="password"
                        value={local.apiKey}
                        onChange={e => setLocal(s => ({ ...s, apiKey: e.target.value }))}
                        placeholder="留空则无需密钥"
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                      />
                    </Field>

                    <Field label="模型名称" icon={<Cpu size={15} />}>
                      <input
                        type="text"
                        value={local.model}
                        onChange={e => setLocal(s => ({ ...s, model: e.target.value }))}
                        placeholder="gpt-4o-mini"
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                      />
                    </Field>

                    <div className="flex items-center gap-2 pt-2">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleTest}
                        disabled={testing}
                        className={cn(
                          'flex items-center gap-2 h-9 px-4 rounded-lg border text-sm font-medium transition-all',
                          'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-default)]',
                          testing && 'opacity-60'
                        )}
                      >
                        {testing ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Zap size={14} />
                        )}
                        测试连接
                      </motion.button>

                      {testResult === 'success' && (
                        <span className="flex items-center gap-1 text-xs text-[var(--color-success)]">
                          <Check size={12} /> 连接成功
                        </span>
                      )}
                      {testResult === 'fail' && (
                        <span className="text-xs text-[var(--color-danger)]">
                          连接失败
                        </span>
                      )}
                    </div>
                  </>
                )}

                {tab === 'ui' && (
                  <div className="space-y-3">
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      界面设置将在后续版本中提供更多选项。
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-border-subtle)]">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="h-9 px-4 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] transition-all"
                >
                  取消
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  className="h-9 px-5 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-all"
                >
                  保存设置
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
        {icon}
        {label}
      </label>
      {children}
    </div>
  )
}
