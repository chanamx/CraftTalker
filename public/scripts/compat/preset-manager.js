import { optionalHost } from './host.js'
import { oai_settings, openai_setting_names, openai_settings } from './openai.js'

const managers = new Map()
const loadedPresetsByType = new Map()
const loadedPresetNamesByType = new Map()
const fallbackPresetName = 'CraftTalker Default'
const presetTypeAliases = {
  koboldhorde: 'kobold',
  textgenerationwebui: 'textgen',
  textgen: 'textgen',
  openai: 'openai',
  kobold: 'kobold',
  novel: 'novel',
  instruct: 'instruct',
  context: 'context',
  sysprompt: 'sysprompt',
  reasoning: 'reasoning',
  generation: 'openai',
  crafttalker: 'openai',
}
const keyedPresetTypes = new Set(['context', 'instruct', 'sysprompt', 'reasoning', 'textgen'])

function normalizePresetType(type = 'openai') {
  const value = String(type || 'openai').trim()
  return presetTypeAliases[value] ?? 'openai'
}

function toStApiId(type = 'openai') {
  const normalized = normalizePresetType(type)
  return normalized === 'textgen' ? 'textgenerationwebui' : normalized
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function ensureFallbackPreset(type) {
  const normalized = normalizePresetType(type)
  const fallback = {
    name: fallbackPresetName,
    extensions: {},
    preset_api: normalized,
  }

  if (normalized === 'openai') {
    fallback.temp_openai = oai_settings.temp_openai ?? 1
    fallback.temperature = oai_settings.temp_openai ?? 1
    fallback.top_p_openai = oai_settings.top_p_openai ?? 1
    fallback.top_p = oai_settings.top_p_openai ?? 1
    fallback.openai_max_tokens = oai_settings.openai_max_tokens ?? 4000
    fallback.max_tokens = oai_settings.openai_max_tokens ?? 4000
    fallback.model = oai_settings.model ?? ''
  }

  return fallback
}

function ensureLoadedPresetState(type) {
  const normalized = normalizePresetType(type)
  if (!loadedPresetsByType.has(normalized)) {
    loadedPresetsByType.set(normalized, [ensureFallbackPreset(normalized)])
    loadedPresetNamesByType.set(normalized, keyedPresetTypes.has(normalized) ? [fallbackPresetName] : { [fallbackPresetName]: 0 })
  }
  return {
    presets: loadedPresetsByType.get(normalized),
    preset_names: loadedPresetNamesByType.get(normalized),
  }
}

function updateNameIndex(type, names) {
  const normalized = normalizePresetType(type)
  const preset_names = keyedPresetTypes.has(normalized)
    ? [...names]
    : Object.fromEntries(names.map((name, index) => [name, index]))
  loadedPresetNamesByType.set(normalized, preset_names)
  return preset_names
}

async function refreshPresets(type) {
  const normalized = normalizePresetType(type)
  const response = await fetch(`/api/presets/${encodeURIComponent(normalized)}`, {
    method: 'GET',
    headers: optionalHost()?.getRequestHeaders?.({ omitContentType: true }) ?? {},
    cache: 'no-cache',
  })
  if (!response.ok) throw new Error(`Failed to load presets for ${normalized}: ${response.status}`)

  const names = await response.json()
  if (!Array.isArray(names) || names.length === 0) {
    ensureLoadedPresetState(normalized)
    return
  }

  const presets = await Promise.all(names.map(async name => {
    try {
      const presetResponse = await fetch(`/api/presets/${encodeURIComponent(normalized)}/${encodeURIComponent(name)}`, {
        method: 'GET',
        headers: optionalHost()?.getRequestHeaders?.({ omitContentType: true }) ?? {},
        cache: 'no-cache',
      })
      if (!presetResponse.ok) return { name, extensions: {}, preset_api: normalized }
      return await presetResponse.json()
    } catch {
      return { name, extensions: {}, preset_api: normalized }
    }
  }))

  loadedPresetsByType.set(normalized, presets)
  const preset_names = updateNameIndex(normalized, names)
  if (normalized === 'openai') {
    openai_settings.splice(0, openai_settings.length, ...presets)
    Object.keys(openai_setting_names).forEach(key => delete openai_setting_names[key])
    Object.assign(openai_setting_names, preset_names)
    if (!names.includes(oai_settings.preset_settings_openai)) {
      oai_settings.preset_settings_openai = names[0]
    }
  }
}

function refreshPresetsInBackground(type) {
  void refreshPresets(type).catch(error => {
    optionalHost()?.recordCompatDiagnostic?.(
      'preset-manager.refreshPresets',
      'partial',
      `Could not refresh ST preset list for ${normalizePresetType(type)}: ${String(error?.message ?? error)}`,
    )
  })
}

function getPresetNamesFromIndex(preset_names) {
  return Array.isArray(preset_names) ? preset_names : Object.keys(preset_names ?? {})
}

function getPresetIndexByName(preset_names, name) {
  if (Array.isArray(preset_names)) return preset_names.indexOf(name)
  const index = preset_names?.[name]
  return Number.isInteger(index) ? index : -1
}

function setPresetIndexName(type, preset_names, name, index) {
  if (Array.isArray(preset_names)) {
    preset_names[index] = name
    return
  }
  preset_names[name] = index
}

function getSelectedName(type, preset_names) {
  const normalized = normalizePresetType(type)
  const names = getPresetNamesFromIndex(preset_names)
  if (
    normalized === 'openai'
    && typeof oai_settings.preset_settings_openai === 'string'
    && names.includes(oai_settings.preset_settings_openai)
  ) {
    return oai_settings.preset_settings_openai
  }
  return names[0] ?? fallbackPresetName
}

function createSelectFacade(manager) {
  return {
    append: node => {
      const text = String(node?.text?.() ?? node?.textContent ?? node?.text ?? node?.name ?? '').trim() || fallbackPresetName
      const value = String(node?.val?.() ?? node?.value ?? '')
      manager.addPresetOption(text, value)
      return manager.select
    },
    find: () => ({
      prop: () => manager.select,
      val: value => {
        if (value !== undefined) manager.selectPreset(value)
        return manager.getSelectedPreset()
      },
      text: () => manager.getSelectedPresetName(),
    }),
    val: value => {
      if (value !== undefined) manager.selectPreset(value)
      return manager.getSelectedPreset()
    },
    trigger: eventName => {
      if (eventName === 'change') manager.emitPresetChanged()
      return manager.select
    },
  }
}

class PresetManager {
  constructor(type = 'generation') {
    this.type = normalizePresetType(type)
    this.apiId = toStApiId(type)
    this.select = createSelectFacade(this)
    ensureLoadedPresetState(this.type)
    refreshPresetsInBackground(this.type)
  }

  getAllPresets() {
    return getPresetNamesFromIndex(this.getPresetList().preset_names)
  }

  findPreset(name) {
    const { preset_names } = this.getPresetList()
    const index = getPresetIndexByName(preset_names, String(name ?? ''))
    if (index >= 0) return this.isKeyedApi() ? String(name ?? '') : String(index)
    return undefined
  }

  getSelectedPreset() {
    const { preset_names } = this.getPresetList()
    const name = getSelectedName(this.type, preset_names)
    const index = getPresetIndexByName(preset_names, name)
    return this.isKeyedApi() ? name : String(Math.max(index, 0))
  }

  getSelectedPresetName() {
    const { preset_names } = this.getPresetList()
    return getSelectedName(this.type, preset_names)
  }

  getPresetList(api) {
    const normalized = normalizePresetType(api ?? this.type)
    const { presets, preset_names } = ensureLoadedPresetState(normalized)
    return {
      presets,
      preset_names,
      settings: normalized === 'openai' ? oai_settings : {},
    }
  }

  getCompletionPresetByName(name) {
    const { presets, preset_names } = this.getPresetList()
    const index = getPresetIndexByName(preset_names, String(name ?? ''))
    return index >= 0 ? presets[index] ?? null : null
  }

  getPresetSettings(name = this.getSelectedPresetName()) {
    return this.getCompletionPresetByName(name) ?? ensureFallbackPreset(this.type)
  }

  isKeyedApi() {
    return keyedPresetTypes.has(this.type)
  }

  isAdvancedFormatting() {
    return ['context', 'instruct', 'sysprompt', 'reasoning'].includes(this.type)
  }

  selectPreset(value) {
    const { presets, preset_names } = this.getPresetList()
    const names = getPresetNamesFromIndex(preset_names)
    const selectedName = this.isKeyedApi()
      ? String(value ?? '')
      : names[Number(value)] ?? String(value ?? '')

    if (!selectedName) return
    if (this.type === 'openai') {
      oai_settings.preset_settings_openai = selectedName
    }
    this.emitPresetChanged()
    return presets[getPresetIndexByName(preset_names, selectedName)] ?? null
  }

  addPresetOption(name, value = '') {
    const { presets, preset_names } = this.getPresetList()
    if (getPresetIndexByName(preset_names, name) >= 0) return

    const index = value && Number.isInteger(Number(value)) ? Number(value) : presets.length
    while (presets.length < index) presets.push(ensureFallbackPreset(this.type))
    presets[index] = { ...ensureFallbackPreset(this.type), name }
    setPresetIndexName(this.type, preset_names, name, index)
  }

  async savePreset(name, settings, { skipUpdate = false } = {}) {
    const presetName = String(name || this.getSelectedPresetName() || fallbackPresetName)
    const preset = {
      ...(settings ? clone(settings) : this.getPresetSettings(presetName)),
      name: presetName,
    }

    const response = await fetch(`/api/presets/${encodeURIComponent(this.type)}`, {
      method: 'POST',
      headers: optionalHost()?.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' },
      body: JSON.stringify(preset),
      cache: 'no-cache',
    })

    if (!response.ok) {
      optionalHost()?.recordCompatDiagnostic?.(
        'preset-manager.savePreset',
        'partial',
        `Could not save ST-compatible preset ${this.type}/${presetName}: ${response.status}`,
      )
      throw new Error('Preset could not be saved')
    }

    const saved = await response.json()
    this.updateList(presetName, saved)
    if (!skipUpdate) refreshPresetsInBackground(this.type)
  }

  updateList(name, preset) {
    const { presets, preset_names } = this.getPresetList()
    let index = getPresetIndexByName(preset_names, name)
    if (index < 0) {
      index = presets.length
      setPresetIndexName(this.type, preset_names, name, index)
    }
    presets[index] = { ...preset, name }
    if (this.type === 'openai') {
      openai_settings.splice(0, openai_settings.length, ...presets)
      Object.keys(openai_setting_names).forEach(key => delete openai_setting_names[key])
      Object.assign(openai_setting_names, preset_names)
      oai_settings.preset_settings_openai = name
    }
  }

  emitPresetChanged() {
    const host = optionalHost()
    void host?.eventSource?.emit?.(host?.event_types?.OAI_PRESET_CHANGED_AFTER ?? 'oai_preset_changed_after')
    void host?.eventSource?.emit?.(host?.event_types?.PRESET_CHANGED ?? 'preset_changed')
  }
}

export function getPresetManager(type = 'generation') {
  const normalized = normalizePresetType(type)
  if (!managers.has(normalized)) managers.set(normalized, new PresetManager(normalized))
  return managers.get(normalized)
}

export default {
  getPresetManager,
}
