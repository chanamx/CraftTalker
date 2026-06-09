import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Globe, Key, Cpu, Zap, Check, Loader2, Code, Braces, Route } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useSettingsStore } from '@/stores/settings-store'
import {
  API_FORMAT_OPTIONS,
  API_TYPE_OPTIONS,
  LLM_PROVIDER_OPTIONS,
  PROVIDER_BY_SOURCE,
  apiFormatLabel,
  endpointSuffixForFormat,
  normalizedConfigForProvider,
} from '@/lib/llm-provider-options'
import type { ChatCompletionSource, CustomAPIFormat, LLMConfig } from '@/types'

export type { LLMConfig }

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  config: LLMConfig
  onSave: (config: LLMConfig) => void
}

function headersToText(headers: Record<string, string> | undefined): string {
  if (!headers) return ''
  return Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\n')
}

function textToHeaders(text: string): Record<string, string> | undefined {
  const headers: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const index = trimmed.indexOf(':')
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim()
    if (key && value) headers[key] = value
  }
  return Object.keys(headers).length > 0 ? headers : undefined
}

function defaultAzureConfig(config: LLMConfig): NonNullable<LLMConfig['azureConfig']> {
  return {
    resourceName: config.azureConfig?.resourceName ?? '',
    deploymentName: config.azureConfig?.deploymentName || config.model || 'deployment-name',
    apiVersion: config.azureConfig?.apiVersion || '2024-10-21',
  }
}

export function SettingsDialog({ open, onClose, config, onSave }: SettingsDialogProps) {
  const [local, setLocal] = useState(config)
  const [headersText, setHeadersText] = useState(headersToText(config.customHeaders))
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null)
  const [tab, setTab] = useState<'llm' | 'ui'>('llm')
  const developerMode = useSettingsStore((s) => s.developerMode)
  const activeProvider = useMemo(() => PROVIDER_BY_SOURCE.get(local.source ?? 'lmstudio'), [local.source])
  const providerOptions = useMemo(
    () => LLM_PROVIDER_OPTIONS,
    [],
  )
  const showEndpointInput = !activeProvider || developerMode || activeProvider.endpointEditMode === 'always'
  const showFormatSelect = !activeProvider || developerMode || activeProvider.formatEditMode === 'always'
  const selectedFormat = local.customApiFormat ?? activeProvider?.format ?? 'openai_chat'
  const formatOptions = useMemo(
    () => API_FORMAT_OPTIONS,
    [],
  )

  useEffect(() => {
    if (!open) return
    const provider = PROVIDER_BY_SOURCE.get(config.source ?? 'lmstudio')
    setLocal(normalizedConfigForProvider(config, provider, developerMode))
    setHeadersText(headersToText(config.customHeaders))
  }, [config, open])

  const withParsedHeaders = (configToSave: LLMConfig): LLMConfig => ({
    ...configToSave,
    customHeaders: textToHeaders(headersText),
  })

  const prepareConfigForSave = async (configToSave: LLMConfig): Promise<LLMConfig> => {
    const provider = PROVIDER_BY_SOURCE.get(configToSave.source ?? 'lmstudio')
    const normalized = normalizedConfigForProvider(withParsedHeaders(configToSave), provider, developerMode)
    const apiKey = normalized.apiKey.trim()
    if (!apiKey) return normalized

    const session = await api.llmSessions.create({
      apiKey,
      label: `${normalized.source ?? normalized.type}:${normalized.model}`,
    })
    return {
      ...normalized,
      apiKey: '',
      apiKeySessionId: session.sessionId,
    }
  }

  const handleProviderChange = (source: ChatCompletionSource) => {
    const provider = PROVIDER_BY_SOURCE.get(source)
    if (!provider) {
      setLocal(s => ({ ...s, source }))
      return
    }

    setLocal(s => {
      const previousProvider = PROVIDER_BY_SOURCE.get(s.source ?? 'lmstudio')
      const previousEndpoint = previousProvider?.endpoint
      const shouldUseProviderEndpoint =
        !s.apiUrl.trim() ||
        s.apiUrl === previousEndpoint ||
        (!developerMode && provider.endpointEditMode === 'developer')
      const model = s.model === previousProvider?.model || !s.model.trim() ? provider.model : s.model
      return {
        ...s,
        source,
        apiUrl: shouldUseProviderEndpoint ? provider.endpoint : s.apiUrl,
        type: provider.type,
        customApiFormat: provider.format,
        model,
        azureConfig: source === 'azure_openai'
          ? defaultAzureConfig({ ...s, model })
          : s.azureConfig,
      }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const safeConfig = await prepareConfigForSave(local)
      onSave(safeConfig)
      setLocal(safeConfig)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const safeConfig = await prepareConfigForSave(local)
      const res = await api.testConnection(safeConfig)
      setLocal(safeConfig)
      setTestResult(res.success ? 'success' : 'fail')
    } catch {
      setTestResult('fail')
    }
    setTesting(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
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
              className="w-full max-w-lg bg-[var(--color-bg-elevated)] rounded-2xl shadow-2xl border border-[var(--color-border-subtle)] overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]">
                <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                  设置
                </h2>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  aria-label="关闭设置"
                  className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] transition-all"
                >
                  <X size={18} />
                </motion.button>
              </div>

              <div className="flex border-b border-[var(--color-border-subtle)]">
                {(['llm', 'ui'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      'flex-1 py-2.5 text-sm font-medium transition-all duration-150 relative',
                      tab === t
                        ? 'text-[var(--color-accent)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                    )}
                  >
                    {t === 'llm' ? 'LLM 连接' : '界面设置'}
                    {tab === t && (
                      <motion.div
                        layoutId="settings-tab"
                        className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[var(--color-accent)] rounded-full"
                        transition={{ duration: 0.2 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                {tab === 'llm' && (
                  <>
                    {developerMode && (
                      <Field label="API 类型" icon={<Globe size={15} />}>
                        <select
                          aria-label="API 类型"
                          value={local.type}
                          onChange={e => setLocal(s => ({ ...s, type: e.target.value as LLMConfig['type'] }))}
                          className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                        >
                          {API_TYPE_OPTIONS.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </Field>
                    )}

                    <Field label="服务商 / 接口源" icon={<Route size={15} />}>
                      <select
                        aria-label="服务商 / 接口源"
                        value={local.source ?? 'lmstudio'}
                        onChange={e => handleProviderChange(e.target.value as ChatCompletionSource)}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                      >
                        {providerOptions.map(provider => (
                          <option key={provider.value} value={provider.value}>{provider.label}</option>
                        ))}
                      </select>
                      {activeProvider && (
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{activeProvider.description}</p>
                      )}
                    </Field>

                    {activeProvider && (
                      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-medium text-[var(--color-text-muted)]">连接摘要</span>
                          <span className="text-[11px] text-[var(--color-text-secondary)]">{apiFormatLabel(selectedFormat)}</span>
                        </div>
                        <p className="mt-1 break-all text-xs text-[var(--color-text-secondary)]">
                          {showEndpointInput ? local.apiUrl : activeProvider.endpoint}
                          <span className="text-[var(--color-text-muted)]">{endpointSuffixForFormat(selectedFormat)}</span>
                        </p>
                      </div>
                    )}

                    {showEndpointInput && (
                      <Field label="API 地址" icon={<Globe size={15} />}>
                        <input
                          aria-label="API 地址"
                          type="text"
                          value={local.apiUrl}
                          onChange={e => setLocal(s => ({ ...s, apiUrl: e.target.value }))}
                          placeholder={activeProvider?.endpoint ?? 'http://localhost:1234/v1'}
                          className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                        />
                      </Field>
                    )}

                    <Field label="API 密钥" icon={<Key size={15} />}>
                      <input
                        aria-label="API 密钥"
                        type="password"
                        value={local.apiKey}
                        onChange={e => setLocal(s => ({ ...s, apiKey: e.target.value }))}
                        placeholder={local.apiKeySessionId ? '已托管到服务端会话，输入新密钥可替换' : '留空则无需密钥'}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                      />
                      {local.apiKeySessionId && !local.apiKey && (
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                          密钥已托管到本次服务端会话；服务端重启后需要重新保存密钥。
                        </p>
                      )}
                    </Field>

                    <Field label="模型名称" icon={<Cpu size={15} />}>
                      <input
                        aria-label="模型名称"
                        type="text"
                        value={local.model}
                        onChange={e => setLocal(s => ({ ...s, model: e.target.value }))}
                        placeholder="gpt-4o-mini"
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                      />
                    </Field>

                    {(developerMode || showFormatSelect) && (
                      <>
                        {showFormatSelect && (
                          <Field label="接口格式" icon={<Braces size={15} />}>
                            <select
                              aria-label="接口格式"
                              value={selectedFormat}
                              onChange={e => setLocal(s => ({ ...s, customApiFormat: e.target.value as CustomAPIFormat }))}
                              className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                            >
                              {formatOptions.map(format => (
                                <option key={format.value} value={format.value}>{format.label}</option>
                              ))}
                            </select>
                          </Field>
                        )}

                        {developerMode && (local.source === 'azure_openai' || selectedFormat === 'azure_openai_chat') && (
                          <>
                            <Field label="Azure Resource" icon={<Globe size={15} />}>
                              <input
                                type="text"
                                value={local.azureConfig?.resourceName ?? ''}
                                onChange={e => setLocal(s => ({
                                  ...s,
                                  azureConfig: {
                                    ...defaultAzureConfig(s),
                                    resourceName: e.target.value,
                                  },
                                }))}
                                placeholder="my-resource"
                                className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                              />
                            </Field>

                            <Field label="Azure Deployment" icon={<Cpu size={15} />}>
                              <input
                                type="text"
                                value={local.azureConfig?.deploymentName ?? local.model}
                                onChange={e => setLocal(s => ({
                                  ...s,
                                  model: e.target.value,
                                  azureConfig: {
                                    ...defaultAzureConfig(s),
                                    deploymentName: e.target.value,
                                  },
                                }))}
                                placeholder="gpt-4o-mini-deployment"
                                className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                              />
                            </Field>

                            <Field label="Azure API Version" icon={<Braces size={15} />}>
                              <input
                                type="text"
                                value={local.azureConfig?.apiVersion ?? '2024-10-21'}
                                onChange={e => setLocal(s => ({
                                  ...s,
                                  azureConfig: {
                                    ...defaultAzureConfig(s),
                                    apiVersion: e.target.value,
                                  },
                                }))}
                                placeholder="2024-10-21"
                                className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                              />
                            </Field>
                          </>
                        )}

                        {developerMode && (
                          <>
                            <Field label="反向代理地址" icon={<Route size={15} />}>
                              <input
                                type="text"
                                value={local.reverseProxyUrl ?? ''}
                                onChange={e => setLocal(s => ({
                                  ...s,
                                  reverseProxyUrl: e.target.value,
                                  useReverseProxy: e.target.value.trim().length > 0,
                                }))}
                                placeholder="https://proxy.example.com/v1"
                                className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                              />
                            </Field>

                            <Field label="自定义请求头" icon={<Braces size={15} />}>
                              <textarea
                                value={headersText}
                                onChange={e => setHeadersText(e.target.value)}
                                placeholder={'Header-Name: value\nX-Provider-App: CraftTalker'}
                                className="w-full min-h-20 px-3 py-2 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30 resize-y"
                              />
                            </Field>
                          </>
                        )}
                      </>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleTest}
                        disabled={testing || saving}
                        className={cn(
                          'flex items-center gap-2 h-9 px-4 rounded-lg border text-sm font-medium transition-all',
                          'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-default)]',
                          testing && 'opacity-60'
                        )}
                      >
                        {testing ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Zap size={14} />
                        )}
                        测试连接
                      </motion.button>

                      {testResult === 'success' && (
                        <span className="flex items-center gap-1 text-xs text-[var(--color-success)]">
                          <Check size={12} /> 连接成功
                        </span>
                      )}
                      {testResult === 'fail' && (
                        <span className="text-xs text-[var(--color-danger)]">
                          连接失败
                        </span>
                      )}
                    </div>
                  </>
                )}

                {tab === 'ui' && (
                  <div className="space-y-3">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <Code size={15} className="text-[var(--color-text-muted)]" />
                        <div>
                          <span className="text-sm font-medium text-[var(--color-text-primary)]">开发者模式</span>
                          <p className="text-[11px] text-[var(--color-text-muted)]">显示世界书高级设置、递归控制、分组评分等</p>
                        </div>
                      </div>
                      <DeveloperModeToggle />
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-border-subtle)]">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="h-9 px-4 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] transition-all"
                >
                  取消
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  disabled={saving}
                  className="h-9 px-5 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-all disabled:opacity-60"
                >
                  {saving ? '保存中...' : '保存设置'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
        {icon}
        {label}
      </label>
      {children}
    </div>
  )
}

function DeveloperModeToggle() {
  const developerMode = useSettingsStore((s) => s.developerMode)
  const setDeveloperMode = useSettingsStore((s) => s.setDeveloperMode)

  return (
    <button
      type="button"
      role="switch"
      aria-checked={developerMode}
      onClick={() => setDeveloperMode(!developerMode)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        developerMode ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-default)]'
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
          developerMode ? 'translate-x-[18px]' : 'translate-x-[3px]'
        )}
      />
    </button>
  )
}
