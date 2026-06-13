import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plus, Trash2, BookOpen, Save, Eye, EyeOff,
  ArrowDown, GripVertical, User, Globe, Unlink, Code
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorlds, useWorld, useCreateWorld, useUpdateWorld, useDeleteWorld,
  useAddWorldEntry, useUpdateWorldEntry, useDeleteWorldEntry,
  useBindWorld, useUnbindWorld } from '@/hooks/use-worlds'
import { useCharacters } from '@/hooks/use-characters'
import { useSettingsStore } from '@/stores/settings-store'
import type { WorldBookEntry, WorldIndex } from '@/lib/api'

const POSITION_LABELS: Record<number, string> = {
  0: '角色定义前',
  1: '角色定义后',
  2: '作者注释顶部',
  3: '作者注释底部',
  4: '指定深度',
  5: '示例对话前',
  6: '示例对话后',
}

const TRIGGER_LABELS = {
  constant: '永久激活',
  keyword: '关键词触发',
} as const

interface WorldBookEditorProps {
  open: boolean
  onClose: () => void
  initialWorld?: string | null
}

function createDefaultEntry(): Partial<WorldBookEntry> {
  return {
    key: [''],
    keysecondary: [],
    comment: '',
    content: '',
    constant: false,
    selective: false,
    insertion_order: 100,
    enabled: true,
    position: 0,
    depth: 4,
    order: 100,
    probability: 100,
    group: '',
  }
}

export function WorldBookEditor({ open, onClose, initialWorld }: WorldBookEditorProps) {
  const { data: worldList } = useWorlds()
  const developerMode = useSettingsStore((s) => s.developerMode)
  const [selectedWorld, setSelectedWorld] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<string | null>(null)
  const [showNewWorld, setShowNewWorld] = useState(false)
  const [newWorldName, setNewWorldName] = useState('')
  const [newWorldDesc, setNewWorldDesc] = useState('')

  useEffect(() => {
    if (open && initialWorld) setSelectedWorld(initialWorld)
  }, [open, initialWorld])

  const { data: world } = useWorld(selectedWorld)
  const { data: characters } = useCharacters()
  const createWorld = useCreateWorld()
  const updateWorld = useUpdateWorld()
  const deleteWorld = useDeleteWorld()
  const addEntry = useAddWorldEntry()
  const updateEntry = useUpdateWorldEntry()
  const deleteEntry = useDeleteWorldEntry()
  const bindWorld = useBindWorld()
  const unbindWorld = useUnbindWorld()

  const handleCreateWorld = () => {
    if (!newWorldName.trim()) return
    createWorld.mutate({ name: newWorldName.trim(), description: newWorldDesc.trim() }, {
      onSuccess: () => {
        setSelectedWorld(newWorldName.trim())
        setShowNewWorld(false)
        setNewWorldName('')
        setNewWorldDesc('')
      },
    })
  }

  const handleAddEntry = () => {
    if (!selectedWorld) return
    addEntry.mutate({ worldName: selectedWorld, entry: createDefaultEntry() })
  }

  const handleToggleEntry = (uid: number, enabled: boolean) => {
    if (!selectedWorld) return
    updateEntry.mutate({ worldName: selectedWorld, uid, entry: { enabled } })
  }

  const handleUpdateEntryField = (
    uid: number,
    field: keyof WorldBookEntry,
    value: string | boolean | number | string[]
  ) => {
    if (!selectedWorld) return
    updateEntry.mutate({ worldName: selectedWorld, uid, entry: { [field]: value } })
  }

  const entries = world ? Object.values(world.entries).sort((a, b) => a.order - b.order) : []
  const selectedInfo = worldList?.find(w => w.name === selectedWorld)
  const unboundCharacters = (characters ?? []).filter(ch => !selectedInfo?.bound_to.includes(ch.file_name))
  const worldEnabled = selectedInfo?.enabled ?? world?.enabled ?? true
  const worldGlobalEnabled = selectedInfo?.global_enabled ?? world?.global_enabled ?? false

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
              className="w-full max-w-4xl h-[80vh] bg-[var(--color-bg-elevated)] rounded-2xl shadow-2xl border border-[var(--color-border-subtle)] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen size={18} className="text-[var(--color-accent)]" />
                  <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                    世界书编辑器
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

              <div className="flex flex-1 min-h-0">
                <div className="w-60 border-r border-[var(--color-border-subtle)] flex flex-col flex-shrink-0">
                  <div className="p-3 border-b border-[var(--color-border-subtle)]">
                    <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                      世界书列表
                    </h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {(worldList ?? []).map(w => (
                      <WorldListItem
                        key={w.name}
                        world={w}
                        selected={selectedWorld === w.name}
                        developerMode={developerMode}
                        onSelect={() => setSelectedWorld(w.name)}
                        onToggleEnabled={() => updateWorld.mutate({ name: w.name, data: { enabled: !w.enabled } })}
                        onDelete={() => {
                          if (confirm(`确定要删除世界书 "${w.name}" 吗？`)) {
                            deleteWorld.mutate(w.name, {
                              onSuccess: () => { if (selectedWorld === w.name) setSelectedWorld(null) },
                            })
                          }
                        }}
                      />
                    ))}
                    {(worldList ?? []).length === 0 && (
                      <div className="text-center text-xs text-[var(--color-text-muted)] py-4">
                        暂无世界书
                      </div>
                    )}
                  </div>

                  <div className="p-2 border-t border-[var(--color-border-subtle)]">
                    {showNewWorld ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={newWorldName}
                          onChange={e => setNewWorldName(e.target.value)}
                          placeholder="世界书名称"
                          className="w-full h-8 px-2.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={handleCreateWorld}
                            className="flex-1 h-7 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)]"
                          >
                            创建
                          </button>
                          <button
                            onClick={() => setShowNewWorld(false)}
                            className="flex-1 h-7 rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] text-xs font-medium hover:bg-[var(--color-bg-surface)]"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowNewWorld(true)}
                        className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors"
                      >
                        <Plus size={13} />
                        新建世界书
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-w-0">
                  {!selectedWorld ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-muted)]">
                      选择左侧世界书开始编辑
                    </div>
                  ) : (
                    <>
                      <div className="px-4 py-3 border-b border-[var(--color-border-subtle)] flex-shrink-0 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                                {selectedWorld}
                              </span>
                              {selectedInfo && <ScopeBadges world={selectedInfo} />}
                            </div>
                          </div>
                          {developerMode && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <ScopeToggle
                                icon={worldEnabled ? <EyeOff size={12} /> : <Eye size={12} />}
                                label={worldEnabled ? '关闭' : '启用'}
                                active={worldEnabled}
                                onClick={() => selectedWorld && selectedInfo && updateWorld.mutate({
                                  name: selectedWorld,
                                  data: { enabled: !selectedInfo.enabled },
                                })}
                                title={worldEnabled ? '关闭整本世界书' : '启用整本世界书'}
                              />
                              <ScopeToggle
                                icon={<Globe size={12} />}
                                label="全局"
                                active={worldGlobalEnabled}
                                onClick={() => selectedWorld && selectedInfo && updateWorld.mutate({
                                  name: selectedWorld,
                                  data: {
                                    global_enabled: !selectedInfo.global_enabled,
                                    enabled: !selectedInfo.global_enabled || selectedInfo.bound_to.length > 0,
                                  },
                                })}
                                title={worldGlobalEnabled ? '取消全局生效' : '设为全局生效'}
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value=""
                            onChange={e => {
                              if (e.target.value && selectedWorld) {
                                bindWorld.mutate({ worldName: selectedWorld, characterName: e.target.value })
                              }
                            }}
                            className="h-7 px-2 rounded-md text-[11px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]"
                          >
                            <option value="">绑定到角色...</option>
                            {unboundCharacters.map(ch => (
                              <option key={ch.file_name} value={ch.file_name}>{ch.name}</option>
                            ))}
                          </select>
                          {selectedInfo?.bound_to.map(charName => {
                            const character = characters?.find(ch => ch.file_name === charName)
                            return (
                              <button
                                key={charName}
                                onClick={() => selectedWorld && unbindWorld.mutate({ worldName: selectedWorld, characterName: charName })}
                                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] bg-[var(--color-accent-muted)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20"
                                title="解除角色绑定"
                              >
                                <User size={11} />
                                <span className="max-w-28 truncate">{character?.name ?? charName}</span>
                                <Unlink size={10} />
                              </button>
                            )
                          })}
                        </div>
                        <div className="flex items-center gap-1">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleAddEntry}
                            className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)]"
                          >
                            <Plus size={12} /> 添加条目
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              if (selectedWorld && world) {
                                updateWorld.mutate({ name: selectedWorld, data: world })
                              }
                            }}
                            className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-[var(--color-border-subtle)] text-xs font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-border-default)]"
                          >
                            <Save size={12} /> 保存
                          </motion.button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {entries.length === 0 && (
                          <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-muted)]">
                            暂无条目，点击上方按钮添加
                          </div>
                        )}
                        {entries.map(entry => (
                          <EntryCard
                            key={entry.uid}
                            entry={entry}
                            isEditing={editingEntry === String(entry.uid)}
                            onToggleEdit={() =>
                              setEditingEntry(editingEntry === String(entry.uid) ? null : String(entry.uid))
                            }
                            onToggleEnabled={() => handleToggleEntry(entry.uid, !entry.enabled)}
                            onUpdateField={(field, value) =>
                              handleUpdateEntryField(entry.uid, field, value)
                            }
                            onDelete={() => {
                              if (selectedWorld) deleteEntry.mutate({ worldName: selectedWorld, uid: entry.uid })
                            }}
                          />
                        ))}
                      </div>
                    </>
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

interface EntryCardProps {
  entry: WorldBookEntry
  isEditing: boolean
  onToggleEdit: () => void
  onToggleEnabled: () => void
  onUpdateField: (field: keyof WorldBookEntry, value: string | boolean | number | string[]) => void
  onDelete: () => void
}

function EntryCard({ entry, isEditing, onToggleEdit, onToggleEnabled, onUpdateField, onDelete }: EntryCardProps) {
  const developerMode = useSettingsStore((s) => s.developerMode)

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      className={cn(
        'rounded-xl border transition-all',
        entry.enabled
          ? 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/50 opacity-60'
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <GripVertical size={12} className="text-[var(--color-text-muted)]" />
        <div className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={entry.comment}
            onChange={e => onUpdateField('comment', e.target.value)}
            placeholder="条目标题（备忘用，不注入对话）"
            className="flex-1 bg-transparent text-xs font-medium text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
        </div>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onToggleEnabled}
          className={cn(
            'p-1 rounded-md text-xs transition-colors',
            entry.enabled
              ? 'text-[var(--color-success)] hover:bg-[var(--color-success)]/10'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)]'
          )}
          title={entry.enabled ? '禁用' : '启用'}
        >
          {entry.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onToggleEdit}
          className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]"
        >
          <ArrowDown size={13} className={cn('transition-transform', isEditing && 'rotate-180')} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onDelete}
          className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
        >
          <Trash2 size={13} />
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {isEditing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-2">
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--color-text-muted)]">触发关键词（逗号分隔）</span>
                <input
                  type="text"
                  value={entry.key.join(', ')}
                  onChange={e => onUpdateField('key', e.target.value.split(',').map(k => k.trim()))}
                  placeholder="关键词1, 关键词2, ..."
                  className="w-full h-7 px-2.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
                />
              </div>
              <textarea
                value={entry.content}
                onChange={e => onUpdateField('content', e.target.value)}
                placeholder="条目内容..."
                rows={3}
                className="w-full resize-none rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] px-3 py-2 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
              />

              <div className="grid grid-cols-4 gap-2">
                <MiniField label="触发策略">
                  <select
                    value={entry.constant ? 'constant' : 'keyword'}
                    onChange={e => onUpdateField('constant', e.target.value === 'constant')}
                    className="w-full h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-primary)]"
                  >
                    <option value="constant">{TRIGGER_LABELS.constant}</option>
                    <option value="keyword">{TRIGGER_LABELS.keyword}</option>
                  </select>
                </MiniField>
                <MiniField label="位置">
                  <select
                    value={entry.position}
                    onChange={e => onUpdateField('position', Number(e.target.value))}
                    className="w-full h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-primary)]"
                  >
                    {Object.entries(POSITION_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </MiniField>
                {entry.position === 4 && (
                  <MiniField label="深度">
                    <input
                      type="number"
                      value={entry.depth}
                      onChange={e => onUpdateField('depth', Number(e.target.value))}
                      min={0}
                      className="w-full h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-primary)]"
                    />
                  </MiniField>
                )}
                <MiniField label="顺序">
                  <input
                    type="number"
                    value={entry.order}
                    onChange={e => onUpdateField('order', Number(e.target.value))}
                    className="w-full h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-primary)]"
                  />
                </MiniField>
              </div>

              {developerMode && (
                <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] space-y-2">
                  <div className="flex items-center gap-1 mb-1">
                    <Code size={10} className="text-[var(--color-text-muted)]" />
                    <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">高级设置</span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-[var(--color-text-muted)]">次要关键词（选择性模式，逗号分隔）</span>
                    <input
                      type="text"
                      value={entry.keysecondary.join(', ')}
                      onChange={e => onUpdateField('keysecondary', e.target.value.split(',').map(k => k.trim()))}
                      placeholder="次要关键词..."
                      className="w-full h-7 px-2.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <MiniField label="概率%">
                      <input
                        type="number"
                        value={entry.probability}
                        onChange={e => onUpdateField('probability', Number(e.target.value))}
                        min={0} max={100}
                        className="w-full h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-primary)]"
                      />
                    </MiniField>
                    <MiniField label="扫描深度">
                      <input
                        type="number"
                        value={entry.scan_depth}
                        onChange={e => onUpdateField('scan_depth', Number(e.target.value))}
                        min={0}
                        className="w-full h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-primary)]"
                      />
                    </MiniField>
                    <MiniField label="分组">
                      <input
                        type="text"
                        value={entry.group}
                        onChange={e => onUpdateField('group', e.target.value)}
                        className="w-full h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-primary)]"
                      />
                    </MiniField>
                    <MiniField label="角色">
                      <select
                        value={entry.role}
                        onChange={e => onUpdateField('role', Number(e.target.value))}
                        className="w-full h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-primary)]"
                      >
                        <option value={0}>系统</option>
                        <option value={1}>用户</option>
                        <option value={2}>助手</option>
                      </select>
                    </MiniField>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <MiniField label="粘性">
                      <input
                        type="number"
                        value={entry.sticky}
                        onChange={e => onUpdateField('sticky', Number(e.target.value))}
                        min={0}
                        className="w-full h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-primary)]"
                      />
                    </MiniField>
                    <MiniField label="冷却">
                      <input
                        type="number"
                        value={entry.cooldown}
                        onChange={e => onUpdateField('cooldown', Number(e.target.value))}
                        min={0}
                        className="w-full h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-primary)]"
                      />
                    </MiniField>
                    <MiniField label="延迟">
                      <input
                        type="number"
                        value={entry.delay}
                        onChange={e => onUpdateField('delay', Number(e.target.value))}
                        min={0}
                        className="w-full h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-primary)]"
                      />
                    </MiniField>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={entry.selective} onChange={e => onUpdateField('selective', e.target.checked)} className="w-3 h-3 rounded" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]">选择性</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={entry.use_regexp} onChange={e => onUpdateField('use_regexp', e.target.checked)} className="w-3 h-3 rounded" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]">正则匹配</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={entry.case_sensitive} onChange={e => onUpdateField('case_sensitive', e.target.checked)} className="w-3 h-3 rounded" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]">区分大小写</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={entry.match_whole_words} onChange={e => onUpdateField('match_whole_words', e.target.checked)} className="w-3 h-3 rounded" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]">全词匹配</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={entry.group_override} onChange={e => onUpdateField('group_override', e.target.checked)} className="w-3 h-3 rounded" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]">分组覆盖</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={entry.use_group_scoring} onChange={e => onUpdateField('use_group_scoring', e.target.checked)} className="w-3 h-3 rounded" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]">分组评分</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={entry.exclude_recursion} onChange={e => onUpdateField('exclude_recursion', e.target.checked)} className="w-3 h-3 rounded" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]">排除递归</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={entry.prevent_recursion} onChange={e => onUpdateField('prevent_recursion', e.target.checked)} className="w-3 h-3 rounded" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]">阻止递归</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={entry.delay_until_recursion} onChange={e => onUpdateField('delay_until_recursion', e.target.checked)} className="w-3 h-3 rounded" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]">延迟至递归</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] text-[var(--color-text-muted)]">{label}</span>
      {children}
    </div>
  )
}

function ScopeBadges({ world }: { world: WorldIndex }) {
  if (!world.enabled) {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10px] bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]">
        <EyeOff size={10} /> 已关闭
      </span>
    )
  }

  const activeScopes = [
    world.global_enabled && { key: 'global', label: '全局', icon: <Globe size={10} /> },
    world.bound_to.length > 0 && { key: 'bound', label: `${world.bound_to.length} 角色`, icon: <User size={10} /> },
  ].filter(Boolean) as Array<{ key: string; label: string; icon: React.ReactNode }>

  if (activeScopes.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10px] bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]">
        <Eye size={10} /> 未生效
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      {activeScopes.map(scope => (
        <span
          key={scope.key}
          className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10px] bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
        >
          {scope.icon}
          {scope.label}
        </span>
      ))}
    </span>
  )
}

function ScopeToggle({ icon, label, active, disabled, title, onClick }: {
  icon: React.ReactNode
  label: string
  active: boolean
  disabled?: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-medium border transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        active
          ? 'border-[var(--color-accent)]/30 bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
          : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function WorldListItem({ world, selected, developerMode, onSelect, onDelete, onToggleEnabled }: {
  world: WorldIndex
  selected: boolean
  developerMode: boolean
  onSelect: () => void
  onDelete: () => void
  onToggleEnabled: () => void
}) {
  const enabled = world.enabled
  return (
    <div className="group relative">
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={onSelect}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-xs',
          !enabled && 'opacity-40',
          selected
            ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]'
        )}
      >
        <BookOpen size={13} className="flex-shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-medium truncate">{world.name}</p>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] opacity-60 flex-shrink-0">{world.entry_count} 条目</span>
            <ScopeBadges world={world} />
          </div>
        </div>
      </motion.button>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
        {developerMode && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={e => { e.stopPropagation(); onToggleEnabled() }}
            className={cn(
              'p-1 rounded-md transition-colors',
              enabled
                ? 'text-[var(--color-success)] hover:bg-[var(--color-success)]/10'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)]'
            )}
            title={enabled ? '关闭整本世界书' : '启用整本世界书'}
          >
            {enabled ? <EyeOff size={11} /> : <Eye size={11} />}
          </motion.button>
        )}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
        >
          <Trash2 size={11} />
        </motion.button>
      </div>
    </div>
  )
}
