import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, FileImage, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useImportCharacter } from '@/hooks/use-characters'
import { useToast } from '@/lib/toast'

interface ImportDialogProps {
  open: boolean
  onClose: () => void
}

export function ImportDialog({ open, onClose }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const importMutation = useImportCharacter()
  const toast = useToast()

  const handleFile = useCallback((f: File) => {
    if (f.name.endsWith('.png') || f.name.endsWith('.json')) {
      setFile(f)
    }
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleInput = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleImport = useCallback(async () => {
    if (!file) return
    try {
      await importMutation.mutateAsync(file)
      onClose()
      setFile(null)
    } catch {
      toast.error('导入失败，请检查文件格式')
    }
  }, [file, importMutation, onClose, toast])

  const handleCancel = () => {
    setFile(null)
    importMutation.reset()
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
              className="w-full max-w-md bg-[var(--color-bg-elevated)] rounded-2xl shadow-2xl border border-[var(--color-border-subtle)] overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]">
                <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                  导入角色卡
                </h2>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  aria-label="关闭导入"
                  className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] transition-all"
                >
                  <X size={18} />
                </motion.button>
              </div>

              <div className="p-6">
                {importMutation.isSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-3 py-8"
                  >
                    <div className="w-14 h-14 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center">
                      <Check size={28} className="text-[var(--color-success)]" />
                    </div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      角色卡导入成功！
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {importMutation.data?.name} 已添加到角色列表
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={onClose}
                      className="h-9 px-4 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white"
                    >
                      完成
                    </motion.button>
                  </motion.div>
                ) : (
                  <>
                    <div
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
                      onDrop={handleDrop}
                      onClick={() => inputRef.current?.click()}
                      className={cn(
                        'relative flex flex-col items-center justify-center gap-3 py-10 px-4 rounded-xl border-2 border-dashed cursor-pointer transition-all',
                        dragOver
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
                          : file
                            ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/5'
                            : 'border-[var(--color-border-default)] hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-muted)]/50'
                      )}
                    >
                      {file ? (
                        <>
                          <FileImage size={36} className="text-[var(--color-success)]" />
                          <div className="text-center">
                            <p className="text-sm font-medium text-[var(--color-text-primary)]">
                              {file.name}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <Upload size={36} className="text-[var(--color-text-muted)]" />
                          <div className="text-center">
                            <p className="text-sm font-medium text-[var(--color-text-primary)]">
                              拖放角色卡文件到此处
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                              支持 PNG / JSON 格式
                            </p>
                          </div>
                        </>
                      )}
                      <input
                        ref={inputRef}
                        type="file"
                        accept=".png,.json"
                        onChange={handleInput}
                        className="hidden"
                      />
                    </div>

                    {importMutation.isError && (
                      <p className="mt-3 text-xs text-[var(--color-danger)] text-center">
                        {(importMutation.error as Error)?.message || '导入失败，请检查文件格式'}
                      </p>
                    )}

                    <div className="flex justify-end gap-3 mt-4">
                      {file && (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleCancel}
                          className="h-9 px-4 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] transition-all"
                        >
                          取消
                        </motion.button>
                      )}
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={!file || importMutation.isPending}
                        onClick={handleImport}
                        className={cn(
                          'h-9 px-5 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                          file && !importMutation.isPending
                            ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'
                            : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] cursor-not-allowed'
                        )}
                      >
                        {importMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                        {importMutation.isPending ? '导入中...' : '导入角色'}
                      </motion.button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
