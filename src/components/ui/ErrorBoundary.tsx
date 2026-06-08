import { Component, type ReactNode, type ErrorInfo } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react'
import { useSettingsStore } from '@/stores/settings-store'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  occurredAt: string | null
  developerMode: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private unsubscribeSettings?: () => void

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      occurredAt: null,
      developerMode: useSettingsStore.getState().developerMode,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      occurredAt: new Date().toISOString(),
    }
  }

  componentDidMount() {
    this.unsubscribeSettings = useSettingsStore.subscribe((state) => {
      this.setState({ developerMode: state.developerMode })
    })
  }

  componentWillUnmount() {
    this.unsubscribeSettings?.()
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack)
    this.setState({ errorInfo: info })

    // 生产环境可集成错误上报服务（Sentry/LogRocket 等）
    if (import.meta.env.PROD) {
      // 示例：window.errorReporter?.captureException(error, { extra: info })
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      occurredAt: null,
      developerMode: useSettingsStore.getState().developerMode,
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      const diagnostics = this.state.developerMode
        ? formatErrorDiagnostics({
            error: this.state.error,
            errorInfo: this.state.errorInfo,
            occurredAt: this.state.occurredAt,
          })
        : null

      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex h-full min-h-[360px] flex-col items-center justify-center gap-4 p-8 text-center"
        >
          <motion.div
            initial={{ rotate: -10 }}
            animate={{ rotate: 0 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center"
          >
            <AlertTriangle size={28} className="text-red-500" />
          </motion.div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
              出了点问题
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-md">
              {this.state.error?.message ?? '应用发生了未知错误'}
            </p>
          </div>
          {diagnostics && (
            <section className="w-full max-w-3xl rounded-lg border border-red-500/20 bg-red-500/[0.04] text-left shadow-sm">
              <div className="flex items-center gap-2 border-b border-red-500/10 px-4 py-3">
                <Bug size={15} className="shrink-0 text-red-500" />
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    开发者错误详情
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    开发者模式已开启，以下内容可用于定位前端异常
                  </p>
                </div>
              </div>
              <pre className="max-h-[42vh] overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-5 text-[var(--color-text-secondary)]">
                {diagnostics}
              </pre>
            </section>
          )}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            <RefreshCw size={14} />
            重试
          </motion.button>
        </motion.div>
      )
    }

    return this.props.children
  }
}

function formatErrorDiagnostics({
  error,
  errorInfo,
  occurredAt,
}: {
  error: Error | null
  errorInfo: ErrorInfo | null
  occurredAt: string | null
}) {
  const lines = [
    `Time: ${occurredAt ?? new Date().toISOString()}`,
    `URL: ${globalThis.location?.href ?? 'unknown'}`,
    `User-Agent: ${globalThis.navigator?.userAgent ?? 'unknown'}`,
    '',
    `Name: ${error?.name ?? 'Error'}`,
    `Message: ${error?.message ?? '应用发生了未知错误'}`,
  ]

  if (error?.stack) {
    lines.push('', 'Stack:', error.stack)
  }

  const cause = error instanceof Error ? error.cause : undefined
  if (cause !== undefined) {
    lines.push('', 'Cause:', stringifyDiagnosticValue(cause))
  }

  if (error instanceof AggregateError && error.errors.length > 0) {
    lines.push('', 'Aggregate Errors:')
    error.errors.forEach((item, index) => {
      lines.push(`[${index + 1}] ${stringifyDiagnosticValue(item)}`)
    })
  }

  if (errorInfo?.componentStack) {
    lines.push('', 'React Component Stack:', errorInfo.componentStack.trim())
  }

  return lines.join('\n')
}

function stringifyDiagnosticValue(value: unknown) {
  if (value instanceof Error) {
    return [value.name, value.message, value.stack].filter(Boolean).join('\n')
  }

  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
