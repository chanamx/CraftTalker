import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/lib/toast'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { initializeStExtensionHost } from '@/lib/st-extension-host'
import { AppShell } from './AppShell'
import { SettingsRoute } from '@/routes/SettingsRoute'
import { ImportRoute } from '@/routes/ImportRoute'
import { WorldBookRoute } from '@/routes/WorldBookRoute'
import { PresetsRoute } from '@/routes/PresetsRoute'
import '@/lib/i18n'
import './index.css'

void initializeStExtensionHost()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<AppShell />}>
                <Route path="settings" element={<SettingsRoute />} />
                <Route path="import" element={<ImportRoute />} />
                <Route path="world-book" element={<WorldBookRoute />} />
                <Route path="presets" element={<PresetsRoute />} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
