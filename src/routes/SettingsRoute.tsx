import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useSettingsStore } from '@/stores/settings-store'
import { useToast } from '@/lib/toast'

const SettingsDialog = lazy(() => import('@/components/settings/SettingsDialog').then(m => ({ default: m.SettingsDialog })))

function DialogFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function SettingsRoute() {
  const navigate = useNavigate()
  const toast = useToast()
  const llmConfig = useSettingsStore((s) => s.llmConfig)
  const setLlmConfig = useSettingsStore((s) => s.setLlmConfig)

  return (
    <ErrorBoundary>
      <Suspense fallback={<DialogFallback />}>
        <SettingsDialog
          open={true}
          onClose={() => navigate(-1)}
          config={llmConfig}
          onSave={(config) => {
            setLlmConfig(config)
            toast.success('LLM 配置已保存')
          }}
        />
      </Suspense>
    </ErrorBoundary>
  )
}
