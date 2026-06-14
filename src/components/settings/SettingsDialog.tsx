import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Globe, Key, Cpu, Zap, Check, Loader2, Code, Braces, Route, Search, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useSettingsStore } from '@/stores/settings-store'
import {
  API_TYPE_OPTIONS,
  LLM_PROVIDER_OPTIONS,
  PROVIDER_BY_SOURCE,
  PROVIDER_DISPLAY_GROUPS,
  type ProviderOption,
  apiFormatOptionsForProvider,
  apiFormatLabel,
  canEditProviderEndpoint,
  endpointSuffixForFormat,
  formatForProvider,
  normalizedConfigForProvider,
  providerMatchesSearch,
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

function comparableSettings(config: LLMConfig, headersText: string, developerMode: boolean): string {
  return JSON.stringify({
    config,
    headersText,
    developerMode,
  })
}

export function SettingsDialog({ open, onClose, config, onSave }: SettingsDialogProps) {
  const [local, setLocal] = useState(config)
  const [headersText, setHeadersText] = useState(headersToText(config.customHeaders))
  const [testing, setTesting] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelListError, setModelListError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null)
  const [tab, setTab] = useState<'llm' | 'ui'>('llm')
  const [providerSearch, setProviderSearch] = useState('')
  const [closePromptOpen, setClosePromptOpen] = useState(false)
  const wasOpenRef = useRef(false)
  const savedDeveloperMode = useSettingsStore((s) => s.developerMode)
  const setSavedDeveloperMode = useSettingsStore((s) => s.setDeveloperMode)
  const [localDeveloperMode, setLocalDeveloperMode] = useState(savedDeveloperMode)
  const baselineConfig = useMemo(() => {
    const provider = PROVIDER_BY_SOURCE.get(config.source ?? 'lmstudio')
    return normalizedConfigForProvider(config, provider, savedDeveloperMode)
  }, [config, savedDeveloperMode])
  const baselineHeadersText = useMemo(() => headersToText(config.customHeaders), [config.customHeaders])
  const baselineKey = useMemo(
    () => comparableSettings(baselineConfig, baselineHeadersText, savedDeveloperMode),
    [baselineConfig, baselineHeadersText, savedDeveloperMode],
  )
  const [draftBaselineKey, setDraftBaselineKey] = useState(baselineKey)
  const activeProvider = useMemo(() => PROVIDER_BY_SOURCE.get(local.source ?? 'lmstudio'), [local.source])
  const currentUnknownProvider = useMemo<ProviderOption | undefined>(() => {
    if (activeProvider || !local.source) return undefined
    return {
      value: local.source,
      label: `当前配置：${local.source}`,
      endpoint: local.apiUrl,
      type: local.type,
      format: formatForProvider(undefined, local.customApiFormat),
      model: local.model,
      description: '保留旧配置或尚未内置的兼容接口；可在开发者模式下调整类型和格式。',
      category: 'custom',
      displayGroup: 'compatible',
      endpointEditMode: 'always',
      formatEditMode: 'developer',
      searchAliases: ['legacy', 'current', 'compatibility'],
    }
  }, [activeProvider, local.apiUrl, local.customApiFormat, local.model, local.source, local.type])
  const selectedProvider = activeProvider ?? currentUnknownProvider
  const providerOptions = useMemo(
    () => {
      const filtered = LLM_PROVIDER_OPTIONS.filter(provider => providerMatchesSearch(provider, providerSearch))
      if (selectedProvider && !filtered.some(provider => provider.value === selectedProvider.value)) {
        return [selectedProvider, ...filtered]
      }
      return filtered
    },
    [providerSearch, selectedProvider],
  )
  const providerGroups = useMemo(
    () => PROVIDER_DISPLAY_GROUPS
      .map(group => ({
        ...group,
        providers: providerOptions.filter(provider => provider.displayGroup === group.value),
      }))
      .filter(group => group.providers.length > 0),
    [providerOptions],
  )
  const showApiTypeSelect = localDeveloperMode && !activeProvider
  const showEndpointInput = canEditProviderEndpoint(selectedProvider, localDeveloperMode)
  const selectedFormat = formatForProvider(activeProvider, local.customApiFormat)
  const formatOptions = useMemo(
    () => apiFormatOptionsForProvider(activeProvider),
    [activeProvider],
  )
  const showFormatSelect = localDeveloperMode && (formatOptions.length > 0 || !activeProvider)
  const dirty = comparableSettings(local, headersText, localDeveloperMode) !== draftBaselineKey
  const modelDatalistId = 'llm-model-options'

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    setLocal(baselineConfig)
    setHeadersText(baselineHeadersText)
    setLocalDeveloperMode(savedDeveloperMode)
    setDraftBaselineKey(baselineKey)
    setProviderSearch('')
    setModelOptions([])
    setModelListError(null)
    setClosePromptOpen(false)
    setTestResult(null)
  }, [baselineConfig, baselineHeadersText, baselineKey, open, savedDeveloperMode])

  useEffect(() => {
    setModelOptions([])
    setModelListError(null)
  }, [local.apiUrl, local.source, selectedFormat])

  const withParsedHeaders = (configToSave: LLMConfig): LLMConfig => ({
    ...configToSave,
    customHeaders: textToHeaders(headersText),
  })

  const prepareConfigForSave = async (configToSave: LLMConfig): Promise<LLMConfig> => {
    const provider = PROVIDER_BY_SOURCE.get(configToSave.source ?? 'lmstudio')
    const normalized = normalizedConfigForProvider(withParsedHeaders(configToSave), provider, localDeveloperMode)
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
      setProviderSearch('')
      return
    }

    setLocal(s => {
      const previousProvider = PROVIDER_BY_SOURCE.get(s.source ?? 'lmstudio')
      const previousEndpoint = previousProvider?.endpoint
      const shouldUseProviderEndpoint =
        provider.displayGroup === 'vendor' ||
        !s.apiUrl.trim() ||
        s.apiUrl === previousEndpoint ||
        !canEditProviderEndpoint(provider, localDeveloperMode)
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
    setProviderSearch('')
  }

  const handleFormatChange = (format: CustomAPIFormat) => {
    setLocal(s => ({
      ...s,
      customApiFormat: formatForProvider(activeProvider, format),
    }))
  }

  const handleDeveloperModeChange = (value: boolean) => {
    setLocalDeveloperMode(value)
    setProviderSearch('')
    setLocal(s => {
      const provider = PROVIDER_BY_SOURCE.get(s.source ?? 'lmstudio')
      if (!provider) return s

      if (!value) {
        return normalizedConfigForProvider(s, provider, false)
      }

      const configProvider = PROVIDER_BY_SOURCE.get(config.source ?? 'lmstudio')
      if (configProvider?.value !== provider.value || canEditProviderEndpoint(provider, false)) {
        return s
      }

      return {
        ...s,
        apiUrl: config.apiUrl || provider.endpoint,
        customApiFormat: formatForProvider(provider, s.customApiFormat ?? config.customApiFormat),
      }
    })
  }

  const discardAndClose = () => {
    setLocal(baselineConfig)
    setHeadersText(baselineHeadersText)
    setLocalDeveloperMode(savedDeveloperMode)
    setDraftBaselineKey(baselineKey)
    setProviderSearch('')
    setClosePromptOpen(false)
    onClose()
  }

  const requestClose = () => {
    if (saving) return
    if (dirty) {
      setClosePromptOpen(true)
      return
    }
    discardAndClose()
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const safeConfig = await prepareConfigForSave(local)
      onSave(safeConfig)
      setSavedDeveloperMode(localDeveloperMode)
      setLocal(safeConfig)
      setDraftBaselineKey(comparableSettings(
        safeConfig,
        headersToText(safeConfig.customHeaders),
        localDeveloperMode,
      ))
      setClosePromptOpen(false)
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

  const handleRefreshModels = async () => {
    setLoadingModels(true)
    setModelListError(null)
    try {
      const safeConfig = await prepareConfigForSave(local)
      setLocal(safeConfig)
      const models = await api.llm.models(safeConfig)
      setModelOptions(models)
      if (!safeConfig.model.trim() && models[0]) {
        setLocal(s => ({ ...s, model: models[0] }))
      }
    } catch {
      setModelOptions([])
      setModelListError('模型列表获取失败')
    } finally {
      setLoadingModels(false)
    }
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
            onClick={requestClose}
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
                  onClick={requestClose}
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
                    {showApiTypeSelect && (
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

                    <Field label="API 服务" icon={<Route size={15} />}>
                      <div className="relative">
                        <Search
                          size={14}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                        />
                        <input
                          aria-label="搜索 API 服务"
                          value={providerSearch}
                          onChange={e => setProviderSearch(e.target.value)}
                          placeholder="搜索厂商、兼容接口或本地服务"
                          className="mb-2 w-full h-9 pl-8 pr-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                        />
                      </div>
                      <select
                        aria-label="API 服务"
                        value={local.source ?? 'lmstudio'}
                        onChange={e => handleProviderChange(e.target.value as ChatCompletionSource)}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                      >
                        {providerGroups.map(group => (
                          <optgroup key={group.value} label={group.label}>
                            {group.providers.map(provider => (
                              <option key={provider.value} value={provider.value}>{provider.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {selectedProvider && (
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{selectedProvider.description}</p>
                      )}
                    </Field>

                    {localDeveloperMode && selectedProvider && (
                      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-medium text-[var(--color-text-muted)]">连接摘要</span>
                          <span className="text-[11px] text-[var(--color-text-secondary)]">{apiFormatLabel(selectedFormat)}</span>
                        </div>
                        <p className="mt-1 break-all text-xs text-[var(--color-text-secondary)]">
                          {showEndpointInput ? local.apiUrl : selectedProvider.endpoint}
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
                      <div className="flex gap-2">
                        <input
                          aria-label="模型名称"
                          type="text"
                          list={modelOptions.length > 0 ? modelDatalistId : undefined}
                          value={local.model}
                          onChange={e => setLocal(s => ({ ...s, model: e.target.value }))}
                          placeholder="gpt-4o-mini"
                          className="min-w-0 flex-1 h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                        />
                        <button
                          type="button"
                          aria-label="刷新模型列表"
                          title="刷新模型列表"
                          onClick={handleRefreshModels}
                          disabled={loadingModels || saving}
                          className={cn(
                            'grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]',
                            loadingModels && 'opacity-60',
                          )}
                        >
                          {loadingModels ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                        </button>
                      </div>
                      {modelOptions.length > 0 && (
                        <datalist id={modelDatalistId}>
                          {modelOptions.map(model => (
                            <option key={model} value={model} />
                          ))}
                        </datalist>
                      )}
                      {modelOptions.length > 0 && !modelListError && (
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                          已获取 {modelOptions.length} 个模型
                        </p>
                      )}
                      {modelListError && (
                        <p role="alert" className="mt-1 text-[11px] text-[var(--color-danger)]">
                          {modelListError}
                        </p>
                      )}
                    </Field>

                    {localDeveloperMode && (
                      <>
                        {showFormatSelect && (
                          <Field label="接口格式" icon={<Braces size={15} />}>
                            <select
                              aria-label="接口格式"
                              value={selectedFormat}
                              onChange={e => handleFormatChange(e.target.value as CustomAPIFormat)}
                              disabled={formatOptions.length <= 1}
                              className="w-full h-9 px-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]/30"
                            >
                              {formatOptions.map(format => (
                                <option key={format.value} value={format.value}>{format.label}</option>
                              ))}
                            </select>
                          </Field>
                        )}

                        {localDeveloperMode && (local.source === 'azure_openai' || selectedFormat === 'azure_openai_chat') && (
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

                        {localDeveloperMode && (
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
                      <DeveloperModeToggle
                        value={localDeveloperMode}
                        onChange={handleDeveloperModeChange}
                      />
                    </label>
                  </div>
                )}
              </div>

              <AnimatePresence>
                {closePromptOpen && (
                  <motion.div
                    role="alertdialog"
                    aria-labelledby="settings-unsaved-title"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.16 }}
                    className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-6 py-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p id="settings-unsaved-title" className="text-sm font-medium text-[var(--color-text-primary)]">
                          设置有未保存的更改
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                          离开前请选择保存或放弃。
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setClosePromptOpen(false)}
                          className="h-8 px-3 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
                        >
                          继续编辑
                        </button>
                        <button
                          type="button"
                          onClick={discardAndClose}
                          className="h-8 px-3 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
                        >
                          放弃更改
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving}
                          className="h-8 px-3 rounded-lg text-xs font-medium bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-60"
                        >
                          保存并关闭
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-border-subtle)]">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={requestClose}
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

function DeveloperModeToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label="开发者模式"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        value ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-default)]'
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
          value ? 'translate-x-[18px]' : 'translate-x-[3px]'
        )}
      />
    </button>
  )
}
