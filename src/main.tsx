import { StrictMode, Suspense, lazy, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/lib/toast'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { initializeStExtensionHostBridge } from '@/lib/st-extension-bridge'
import { AppShell } from './AppShell'
import '@/lib/i18n'
import './index.css'

const SettingsRoute = lazy(() => import('@/routes/SettingsRoute').then(m => ({ default: m.SettingsRoute })))
const ImportRoute = lazy(() => import('@/routes/ImportRoute').then(m => ({ default: m.ImportRoute })))
const WorldBookRoute = lazy(() => import('@/routes/WorldBookRoute').then(m => ({ default: m.WorldBookRoute })))
const PresetsRoute = lazy(() => import('@/routes/PresetsRoute').then(m => ({ default: m.PresetsRoute })))

initializeStExtensionHostBridge()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function DialogRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<DialogRouteFallback />}>
      {children}
    </Suspense>
  )
}

function DialogRouteFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="h-8 w-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
    </div>
  )
}

const rootElement = document.getElementById('root') as (HTMLElement & {
  __crafttalkerReactRoot?: ReturnType<typeof createRoot>
}) | null

if (!rootElement) {
  throw new Error('CraftTalker root element was not found.')
}

const root = rootElement.__crafttalkerReactRoot ??= createRoot(rootElement)

root.render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<AppShell />}>
                <Route path="settings" element={<DialogRoute><SettingsRoute /></DialogRoute>} />
                <Route path="import" element={<DialogRoute><ImportRoute /></DialogRoute>} />
                <Route path="world-book" element={<DialogRoute><WorldBookRoute /></DialogRoute>} />
                <Route path="presets" element={<DialogRoute><PresetsRoute /></DialogRoute>} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
