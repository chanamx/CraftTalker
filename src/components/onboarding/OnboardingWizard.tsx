import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Key, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings-store'
import type { LLMConfig, Character } from '@/types'

interface OnboardingWizardProps {
  characters: Character[]
  onSelectCharacter: (char: Character) => void
  onComplete: () => void
}

const STORAGE_KEY = 'luker-onboarding-complete'

export function useOnboarding() {
  const [show, setShow] = useState(() => !localStorage.getItem(STORAGE_KEY))
  const complete = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }
  return { showOnboarding: show, completeOnboarding: complete }
}

function StepContent({ icon, title, subtitle, children }: {
  icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[var(--color-accent)]">{icon}</span>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h3>
      </div>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">{subtitle}</p>
      {children}
    </motion.div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]/50'

export function OnboardingWizard({ characters, onSelectCharacter, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)
  const [selectedChar, setSelectedChar] = useState<Character | null>(null)
  const llmConfig = useSettingsStore((s) => s.llmConfig)
  const setLlmConfig = useSettingsStore((s) => s.setLlmConfig)
  const [localConfig, setLocalConfig] = useState<LLMConfig>(llmConfig)

  useEffect(() => { setLocalConfig(llmConfig) }, [llmConfig])

  const handleFinish = () => {
    setLlmConfig(localConfig)
    if (selectedChar) onSelectCharacter(selectedChar)
    onComplete()
  }

  const canNext = step === 0 ? !!selectedChar || characters.length === 0 : true

  const renderStep = () => {
    if (step === 0) {
      return (
        <StepContent key="s0" icon={<Sparkles size={20} />} title="选择角色" subtitle="选择你想对话的角色">
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {characters.map((char) => (
              <button
                key={char.id}
                onClick={() => setSelectedChar(char)}
                className={cn(
                  'flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all',
                  selectedChar?.id === char.id
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
                    : 'border-[var(--color-border-subtle)] hover:border-[var(--color-accent)]/30'
                )}
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-muted)] flex items-center justify-center text-xs font-semibold text-[var(--color-accent)] flex-shrink-0">
                  {char.name[0]}
                </div>
                <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">{char.name}</span>
              </button>
            ))}
            {characters.length === 0 && (
              <p className="col-span-2 text-sm text-[var(--color-text-muted)] text-center py-8">暂无角色，可跳过</p>
            )}
          </div>
        </StepContent>
      )
    }
    if (step === 1) {
      return (
        <StepContent key="s1" icon={<Key size={20} />} title="配置 API" subtitle="设置 LLM 服务连接">
          <div className="space-y-3">
            <Field label="API 地址">
              <input value={localConfig.apiUrl} onChange={(e) => setLocalConfig({ ...localConfig, apiUrl: e.target.value })} placeholder="http://localhost:1234/v1" className={inputCls} />
            </Field>
            <Field label="API Key（可选）">
              <input type="password" value={localConfig.apiKey} onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })} placeholder="sk-..." className={inputCls} />
            </Field>
            <Field label="模型名称">
              <input value={localConfig.model} onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })} placeholder="gpt-4o / local-model" className={inputCls} />
            </Field>
          </div>
        </StepContent>
      )
    }
    return (
      <StepContent key="s2" icon={<MessageCircle size={20} />} title="准备就绪！" subtitle="一切配置完成">
        <div className="flex flex-col items-center py-6">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent-muted)] flex items-center justify-center mb-3">
            <Sparkles size={28} className="text-[var(--color-accent)]" />
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] text-center">
            {selectedChar ? `即将与 ${selectedChar.name} 开始对话` : '点击下方按钮开始使用'}
          </p>
        </div>
      </StepContent>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-md bg-[var(--color-bg-elevated)] rounded-2xl shadow-2xl border border-[var(--color-border-subtle)] overflow-hidden"
      >
        <div className="flex gap-1 px-6 pt-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors duration-300', i <= step ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-subtle)]')} />
          ))}
        </div>

        <div className="px-6 py-5 min-h-[280px]">
          <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
        </div>

        <div className="flex justify-between px-6 pb-5">
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all', step === 0 ? 'opacity-0 pointer-events-none' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]')}
          >
            上一步
          </button>
          {step < 2 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canNext}
              className={cn('px-5 py-2 rounded-lg text-sm font-medium transition-all', canNext ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]' : 'bg-[var(--color-border-subtle)] text-[var(--color-text-muted)] cursor-not-allowed')}
            >
              下一步
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-all"
            >
              开始对话
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
