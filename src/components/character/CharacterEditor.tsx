import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, User, BookOpen, Tag, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fadeIn } from '@/lib/motion'
import type { CharacterDetail } from '@/lib/api'

interface CharacterEditorProps {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<CharacterDetail>) => Promise<void>
  initial?: CharacterDetail | null
}

type Tab = 'basic' | 'advanced' | 'prompt' | 'tags'

export function CharacterEditor({ open, onClose, onSave, initial }: CharacterEditorProps) {
  const [tab, setTab] = useState<Tab>('basic')
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [personality, setPersonality] = useState(initial?.personality ?? '')
  const [scenario, setScenario] = useState(initial?.scenario ?? '')
  const [firstMes, setFirstMes] = useState(initial?.first_mes ?? '')
  const [mesExample, setMesExample] = useState(initial?.mes_example ?? '')
  const [creatorNotes, setCreatorNotes] = useState(initial?.creator_notes ?? '')
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? '')
  const [postHistory, setPostHistory] = useState(initial?.post_history_instructions ?? '')
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '')
  const [creator, setCreator] = useState(initial?.creator ?? '')
  const [charVersion, setCharVersion] = useState(initial?.character_version ?? '')

  const tabs: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: 'basic', icon: <User size={14} />, label: '基础' },
    { key: 'advanced', icon: <BookOpen size={14} />, label: '高级' },
    { key: 'prompt', icon: <Settings size={14} />, label: '提示词' },
    { key: 'tags', icon: <Tag size={14} />, label: '标签' },
  ]

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description,
        personality,
        scenario,
        first_mes: firstMes,
        mes_example: mesExample,
        creator_notes: creatorNotes,
        system_prompt: systemPrompt,
        post_history_instructions: postHistory,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        creator,
        character_version: charVersion,
      })
      onClose()
    } catch {
    } finally {
      setSaving(false)
    }
  }

  const Field = ({ label, value, onChange, placeholder, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">{label}</span>
      {rows > 1 ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/30 focus:ring-2 focus:ring-[var(--color-accent)]/10 resize-none"
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/30 focus:ring-2 focus:ring-[var(--color-accent)]/10"
        />
      )}
    </label>
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={e => e.stopPropagation()}
            className="bg-[var(--color-bg-elevated)] rounded-2xl shadow-2xl border border-[var(--color-border-subtle)] w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border-subtle)]">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                {initial ? '编辑角色' : '创建角色'}
              </h2>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] transition-colors"
              >
                <X size={16} />
              </motion.button>
            </div>

            <div className="flex border-b border-[var(--color-border-subtle)]">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 text-xs transition-colors border-b-2 -mb-px',
                    tab === t.key
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5">
              {tab === 'basic' && (
                <motion.div variants={fadeIn} initial="hidden" animate="visible" className="flex flex-col gap-3.5">
                  <Field label="角色名称" value={name} onChange={setName} placeholder="输入角色名称" rows={1} />
                  <Field label="描述" value={description} onChange={setDescription} placeholder="角色的简短描述" rows={3} />
                  <Field label="性格" value={personality} onChange={setPersonality} placeholder="角色的性格特征" rows={3} />
                  <Field label="场景设定" value={scenario} onChange={setScenario} placeholder="对话发生的场景" rows={3} />
                </motion.div>
              )}
              {tab === 'advanced' && (
                <motion.div variants={fadeIn} initial="hidden" animate="visible" className="flex flex-col gap-3.5">
                  <Field label="首条消息 (first_mes)" value={firstMes} onChange={setFirstMes} placeholder="角色的开场白" rows={4} />
                  <Field label="对话示例 (mes_example)" value={mesExample} onChange={setMesExample} placeholder="用 <START> 分隔多轮示例对话" rows={4} />
                  <Field label="创作者备注" value={creatorNotes} onChange={setCreatorNotes} placeholder="创作者说明" rows={2} />
                  <Field label="创建者" value={creator} onChange={setCreator} placeholder="创建者名称" rows={1} />
                  <Field label="版本" value={charVersion} onChange={setCharVersion} placeholder="角色版本号" rows={1} />
                </motion.div>
              )}
              {tab === 'prompt' && (
                <motion.div variants={fadeIn} initial="hidden" animate="visible" className="flex flex-col gap-3.5">
                  <Field label="系统提示词 (system_prompt)" value={systemPrompt} onChange={setSystemPrompt} placeholder="角色的全局系统提示词" rows={5} />
                  <Field label="历史后指令 (post_history_instructions)" value={postHistory} onChange={setPostHistory} placeholder="注入在对话历史之后的指令" rows={4} />
                </motion.div>
              )}
              {tab === 'tags' && (
                <motion.div variants={fadeIn} initial="hidden" animate="visible" className="flex flex-col gap-3.5">
                  <Field label="标签" value={tags} onChange={setTags} placeholder="以逗号分隔: 助手, 温柔, 奇幻" rows={2} />
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    标签将帮助你在侧边栏中分类和筛选角色
                  </p>
                </motion.div>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border-subtle)]">
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {initial ? '编辑后将更新角色卡数据' : '创建后可在侧边栏找到新角色'}
              </p>
              <div className="flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-lg text-xs text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-surface)] transition-colors"
                >
                  取消
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  disabled={!name.trim() || saving}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                    name.trim() && !saving
                      ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'
                      : 'bg-[var(--color-border-subtle)] text-[var(--color-text-muted)] cursor-not-allowed',
                  )}
                >
                  <Save size={13} />
                  {saving ? '保存中...' : '保存'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
