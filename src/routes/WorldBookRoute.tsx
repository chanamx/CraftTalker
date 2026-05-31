import { lazy, Suspense } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

const WorldBookEditor = lazy(() => import('@/components/world/WorldBookEditor').then(m => ({ default: m.WorldBookEditor })))

function DialogFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function WorldBookRoute() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialWorld = searchParams.get('world')

  return (
    <ErrorBoundary>
      <Suspense fallback={<DialogFallback />}>
        <WorldBookEditor
          open={true}
          onClose={() => navigate(-1)}
          initialWorld={initialWorld}
        />
      </Suspense>
    </ErrorBoundary>
  )
}
