import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

const PresetManager = lazy(() => import('@/components/settings/PresetManager').then(m => ({ default: m.PresetManager })))

function DialogFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function PresetsRoute() {
  const navigate = useNavigate()

  return (
    <ErrorBoundary>
      <Suspense fallback={<DialogFallback />}>
        <PresetManager
          open={true}
          onClose={() => navigate(-1)}
        />
      </Suspense>
    </ErrorBoundary>
  )
}
