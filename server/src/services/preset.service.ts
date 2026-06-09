import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createError, ErrorCode } from '../lib/errors.js'
import { validatePathInBase } from '../lib/path-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')

function getDataDir() { return process.env.LUKER_DATA_DIR ?? DEFAULT_DATA_DIR }

export const GENERATION_PRESET_TYPES = ['kobold', 'openai', 'textgen', 'novel'] as const
export const TEMPLATE_PRESET_TYPES = ['instruct', 'context', 'sysprompt', 'reasoning'] as const

export type GenerationPresetType = typeof GENERATION_PRESET_TYPES[number]
export type TemplatePresetType = typeof TEMPLATE_PRESET_TYPES[number]
export type PresetType = GenerationPresetType | TemplatePresetType
export type PresetKind = 'generation' | 'template'
export type PresetStorageFormat = 'sillytavern-json' | 'crafttalker-legacy'

interface PresetStore {
  dir: string
  extension: '.json' | '.settings'
  format: PresetStorageFormat
  label: string
}

interface PresetTypeConfig {
  kind: PresetKind
  stores: readonly [PresetStore, ...PresetStore[]]
}

const PRESET_CONFIG = {
  kobold: {
    kind: 'generation',
    stores: [
      { dir: 'KoboldAI Settings', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri JSON' },
      { dir: 'presets/kobold', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri content pack' },
      { dir: 'koboldAI_Settings', extension: '.settings', format: 'crafttalker-legacy', label: 'CraftTalker legacy' },
    ],
  },
  openai: {
    kind: 'generation',
    stores: [
      { dir: 'OpenAI Settings', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri JSON' },
      { dir: 'presets/openai', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri content pack' },
      { dir: 'openAI_Settings', extension: '.settings', format: 'crafttalker-legacy', label: 'CraftTalker legacy' },
    ],
  },
  textgen: {
    kind: 'generation',
    stores: [
      { dir: 'TextGen Settings', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri JSON' },
      { dir: 'presets/textgen', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri content pack' },
      { dir: 'textGen_Settings', extension: '.settings', format: 'crafttalker-legacy', label: 'CraftTalker legacy' },
    ],
  },
  novel: {
    kind: 'generation',
    stores: [
      { dir: 'NovelAI Settings', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri JSON' },
      { dir: 'presets/novel', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri content pack' },
      { dir: 'novelAI_Settings', extension: '.settings', format: 'crafttalker-legacy', label: 'CraftTalker legacy' },
    ],
  },
  instruct: {
    kind: 'template',
    stores: [
      { dir: 'instruct', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri JSON' },
      { dir: 'presets/instruct', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri content pack' },
    ],
  },
  context: {
    kind: 'template',
    stores: [
      { dir: 'context', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri JSON' },
      { dir: 'presets/context', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri content pack' },
    ],
  },
  sysprompt: {
    kind: 'template',
    stores: [
      { dir: 'sysprompt', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri JSON' },
      { dir: 'presets/sysprompt', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri content pack' },
    ],
  },
  reasoning: {
    kind: 'template',
    stores: [
      { dir: 'reasoning', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri JSON' },
      { dir: 'presets/reasoning', extension: '.json', format: 'sillytavern-json', label: 'ST/Tauri content pack' },
    ],
  },
} as const satisfies Record<string, PresetTypeConfig>

export const PRESET_TYPES = [...GENERATION_PRESET_TYPES, ...TEMPLATE_PRESET_TYPES] as const

export function isPresetType(type: string): type is PresetType {
  return Object.hasOwn(PRESET_CONFIG, type)
}

export function isGenerationPresetType(type: string): type is GenerationPresetType {
  return (GENERATION_PRESET_TYPES as readonly string[]).includes(type)
}

export interface GenerationPreset {
  name: string
  temperature: number
  top_p: number
  top_k: number
  top_a: number
  min_p: number
  max_tokens: number
  max_context?: number
  repetition_penalty: number
  repetition_penalty_range: number
  repetition_penalty_slope: number
  frequency_penalty: number
  presence_penalty: number
  typical_p: number
  tfs: number
  mirostat_mode: number
  mirostat_tau: number
  mirostat_eta: number
  sampler_order: number[]
  skip_special_tokens: boolean
  ban_eos_token: boolean
  add_bos_token: boolean
  token_healing: boolean
  seed: number
  grammar_string: string
  guidance_scale: number
  negative_prompt: string
  dry_allowed_length: number
  dry_multiplier: number
  dry_base: number
  dry_sequence_breakers: string
  xtc_threshold: number
  xtc_probability: number
  [key: string]: unknown
}

export type PresetData = { name: string; [key: string]: unknown }

export interface PresetIndexEntry {
  name: string
  type: PresetType
  kind: PresetKind
  format: PresetStorageFormat
  sourceLabel: string
  directory: string
  extension: string
}

interface LocatedPreset {
  store: PresetStore
  filePath: string
}

const DEFAULT_PRESET: GenerationPreset = {
  name: 'Default',
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  top_a: 0,
  min_p: 0.05,
  max_tokens: 300,
  max_context: 4096,
  repetition_penalty: 1.1,
  repetition_penalty_range: 1024,
  repetition_penalty_slope: 0.7,
  frequency_penalty: 0,
  presence_penalty: 0,
  typical_p: 1,
  tfs: 1,
  mirostat_mode: 0,
  mirostat_tau: 5,
  mirostat_eta: 0.1,
  sampler_order: [6, 0, 1, 3, 4, 2, 5],
  skip_special_tokens: true,
  ban_eos_token: false,
  add_bos_token: true,
  token_healing: false,
  seed: -1,
  grammar_string: '',
  guidance_scale: 1,
  negative_prompt: '',
  dry_allowed_length: 2,
  dry_multiplier: 0,
  dry_base: 1.75,
  dry_sequence_breakers: '"\\n", ":", "\\"", "*"',
  xtc_threshold: 0.1,
  xtc_probability: 0,
}

function getPresetConfig(type: PresetType): PresetTypeConfig {
  return PRESET_CONFIG[type]
}

function getPresetDir(store: PresetStore): string {
  return path.join(getDataDir(), store.dir)
}

function getPresetPath(store: PresetStore, name: string): string {
  assertPresetFileName(name)
  const dir = getPresetDir(store)
  return validatePathInBase(path.join(dir, `${name}${store.extension}`), dir)
}

function getPrimaryStore(type: PresetType): PresetStore {
  return getPresetConfig(type).stores[0]
}

async function findPreset(type: PresetType, name: string): Promise<LocatedPreset | null> {
  for (const store of getPresetConfig(type).stores) {
    const filePath = getPresetPath(store, name)
    if (existsSync(filePath)) return { store, filePath }
  }
  return null
}

export async function listPresetEntries(type: PresetType): Promise<PresetIndexEntry[]> {
  const config = getPresetConfig(type)
  const seen = new Set<string>()
  const entries: PresetIndexEntry[] = []

  for (const store of config.stores) {
    const dir = getPresetDir(store)
    if (!existsSync(dir)) continue

    const files = await fs.readdir(dir)
    for (const file of files) {
      if (!file.endsWith(store.extension)) continue
      const name = file.slice(0, -store.extension.length)
      if (seen.has(name)) continue
      seen.add(name)
      entries.push({
        name,
        type,
        kind: config.kind,
        format: store.format,
        sourceLabel: store.label,
        directory: store.dir,
        extension: store.extension,
      })
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listPresets(type: PresetType): Promise<string[]> {
  return (await listPresetEntries(type)).map(entry => entry.name)
}

export async function getPreset(type: PresetType, name: string): Promise<PresetData> {
  const located = await findPreset(type, name)
  if (!located) {
    throw createError(ErrorCode.PRESET_NOT_FOUND, `Preset "${type}/${name}" does not exist`, { presetType: type, presetName: name })
  }

  const raw = await readPresetFile(located.filePath, name)
  if (getPresetConfig(type).kind === 'generation' && isGenerationPresetType(type)) {
    return normalizeGenerationPreset(type, raw)
  }
  return raw
}

export async function savePreset(type: PresetType, name: string, preset: PresetData): Promise<PresetData> {
  const located = await findPreset(type, name)
  const store = located?.store ?? getPrimaryStore(type)
  const dir = getPresetDir(store)
  await fs.mkdir(dir, { recursive: true })

  const existing = located ? await readPresetFile(located.filePath, name) : {}
  const base = { ...existing, ...stripApiOnlyFields(preset), name }
  const stored = getPresetConfig(type).kind === 'generation' && isGenerationPresetType(type)
    ? serializeGenerationPresetForStorage(type, base)
    : base

  const filePath = located?.filePath ?? getPresetPath(store, name)
  await fs.writeFile(filePath, JSON.stringify(stored, null, 2), 'utf8')
  return getPresetConfig(type).kind === 'generation' && isGenerationPresetType(type)
    ? normalizeGenerationPreset(type, stored)
    : stored
}

export async function deletePreset(type: PresetType, name: string): Promise<boolean> {
  const located = await findPreset(type, name)
  if (!located) {
    throw createError(ErrorCode.PRESET_NOT_FOUND, `Preset "${type}/${name}" does not exist`, { presetType: type, presetName: name })
  }
  await fs.unlink(located.filePath)
  return true
}

export async function getGenerationPreset(type?: GenerationPresetType, name?: string): Promise<GenerationPreset> {
  if (!type || !name) return getDefaultPreset()
  return normalizeGenerationPreset(type, await getPreset(type, name))
}

export function normalizeGenerationPreset(type: GenerationPresetType, raw: PresetData): GenerationPreset {
  const normalized: GenerationPreset = {
    ...getDefaultPreset(),
    ...raw,
    name: stringValue(raw.name) ?? 'Default',
  }

  setNumber(normalized, 'temperature', raw, 'temperature', 'temp')
  setNumber(normalized, 'top_p', raw, 'top_p')
  setNumber(normalized, 'top_k', raw, 'top_k')
  setNumber(normalized, 'top_a', raw, 'top_a')
  setNumber(normalized, 'min_p', raw, 'min_p')
  setNumber(normalized, 'max_tokens', raw, 'max_tokens', 'openai_max_tokens', 'amount_gen', 'max_new_tokens')
  setNumber(normalized, 'max_context', raw, 'max_context', 'openai_max_context', 'context_length', 'max_length')
  setNumber(normalized, 'repetition_penalty', raw, 'repetition_penalty', 'rep_pen')
  setNumber(normalized, 'repetition_penalty_range', raw, 'repetition_penalty_range', 'rep_pen_range', 'rep_pen_size')
  setNumber(normalized, 'repetition_penalty_slope', raw, 'repetition_penalty_slope', 'rep_pen_slope', 'rep_pen_decay')
  setNumber(normalized, 'frequency_penalty', raw, 'frequency_penalty', 'freq_pen')
  setNumber(normalized, 'presence_penalty', raw, 'presence_penalty', 'presence_pen')
  setNumber(normalized, 'typical_p', raw, 'typical_p')
  setNumber(normalized, 'tfs', raw, 'tfs', 'tfs_z')
  setNumber(normalized, 'mirostat_mode', raw, 'mirostat_mode')
  setNumber(normalized, 'mirostat_tau', raw, 'mirostat_tau')
  setNumber(normalized, 'mirostat_eta', raw, 'mirostat_eta')
  setNumber(normalized, 'seed', raw, 'seed')
  setNumber(normalized, 'guidance_scale', raw, 'guidance_scale')
  setNumber(normalized, 'dry_allowed_length', raw, 'dry_allowed_length')
  setNumber(normalized, 'dry_multiplier', raw, 'dry_multiplier')
  setNumber(normalized, 'dry_base', raw, 'dry_base')
  setNumber(normalized, 'xtc_threshold', raw, 'xtc_threshold')
  setNumber(normalized, 'xtc_probability', raw, 'xtc_probability')

  setBoolean(normalized, 'skip_special_tokens', raw, 'skip_special_tokens')
  setBoolean(normalized, 'ban_eos_token', raw, 'ban_eos_token', 'ignore_eos_token')
  setBoolean(normalized, 'add_bos_token', raw, 'add_bos_token')
  setBoolean(normalized, 'token_healing', raw, 'token_healing')

  const samplerOrder = numberArrayValue(raw.sampler_order)
  if (samplerOrder) normalized.sampler_order = samplerOrder

  const grammar = stringValue(raw.grammar_string)
  if (grammar !== undefined) normalized.grammar_string = grammar

  const negativePrompt = stringValue(raw.negative_prompt)
  if (negativePrompt !== undefined) normalized.negative_prompt = negativePrompt

  const dryBreakers = stringValue(raw.dry_sequence_breakers) ?? jsonStringValue(raw.dry_sequence_breakers)
  if (dryBreakers !== undefined) normalized.dry_sequence_breakers = dryBreakers

  normalized.preset_api = type
  return normalized
}

export function getDefaultPreset(): GenerationPreset {
  return { ...DEFAULT_PRESET, sampler_order: [...DEFAULT_PRESET.sampler_order] }
}

async function readPresetFile(filePath: string, fallbackName: string): Promise<PresetData> {
  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  if (!isRecord(parsed)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Preset file must contain a JSON object', { filePath })
  }
  return {
    name: stringValue(parsed.name) ?? fallbackName,
    ...parsed,
  }
}

function serializeGenerationPresetForStorage(type: GenerationPresetType, raw: PresetData): PresetData {
  const normalized = normalizeGenerationPreset(type, raw)
  const stored: PresetData = {
    ...raw,
    ...pickRuntimeFields(normalized),
    name: normalized.name,
  }

  if (type === 'openai') {
    stored.openai_max_tokens = normalized.max_tokens
    if (typeof normalized.max_context === 'number') stored.openai_max_context = normalized.max_context
  }

  if (type === 'kobold' || type === 'textgen') {
    stored.temp = normalized.temperature
    stored.rep_pen = normalized.repetition_penalty
    stored.rep_pen_range = normalized.repetition_penalty_range
    stored.rep_pen_slope = normalized.repetition_penalty_slope
    stored.freq_pen = normalized.frequency_penalty
    stored.presence_pen = normalized.presence_penalty
  }

  return stored
}

function pickRuntimeFields(preset: GenerationPreset): PresetData {
  return {
    name: preset.name,
    temperature: preset.temperature,
    top_p: preset.top_p,
    top_k: preset.top_k,
    top_a: preset.top_a,
    min_p: preset.min_p,
    max_tokens: preset.max_tokens,
    ...(typeof preset.max_context === 'number' && { max_context: preset.max_context }),
    repetition_penalty: preset.repetition_penalty,
    repetition_penalty_range: preset.repetition_penalty_range,
    repetition_penalty_slope: preset.repetition_penalty_slope,
    frequency_penalty: preset.frequency_penalty,
    presence_penalty: preset.presence_penalty,
    typical_p: preset.typical_p,
    tfs: preset.tfs,
    mirostat_mode: preset.mirostat_mode,
    mirostat_tau: preset.mirostat_tau,
    mirostat_eta: preset.mirostat_eta,
    sampler_order: preset.sampler_order,
    skip_special_tokens: preset.skip_special_tokens,
    ban_eos_token: preset.ban_eos_token,
    add_bos_token: preset.add_bos_token,
    token_healing: preset.token_healing,
    seed: preset.seed,
    grammar_string: preset.grammar_string,
    guidance_scale: preset.guidance_scale,
    negative_prompt: preset.negative_prompt,
    dry_allowed_length: preset.dry_allowed_length,
    dry_multiplier: preset.dry_multiplier,
    dry_base: preset.dry_base,
    dry_sequence_breakers: preset.dry_sequence_breakers,
    xtc_threshold: preset.xtc_threshold,
    xtc_probability: preset.xtc_probability,
  }
}

function stripApiOnlyFields(preset: PresetData): PresetData {
  const { __preset, preset_api, ...rest } = preset
  void __preset
  void preset_api
  return rest
}

function setNumber(target: GenerationPreset, key: keyof GenerationPreset, raw: PresetData, ...aliases: string[]) {
  const value = numberValue(raw, ...aliases)
  if (value !== undefined) target[key] = value
}

function setBoolean(target: GenerationPreset, key: keyof GenerationPreset, raw: PresetData, ...aliases: string[]) {
  const value = booleanValue(raw, ...aliases)
  if (value !== undefined) target[key] = value
}

function numberValue(raw: PresetData, ...aliases: string[]): number | undefined {
  for (const key of aliases) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function booleanValue(raw: PresetData, ...aliases: string[]): boolean | undefined {
  for (const key of aliases) {
    const value = raw[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'true') return true
      if (normalized === 'false') return false
    }
  }
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberArrayValue(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'number' && Number.isFinite(item))
    ? value
    : undefined
}

function jsonStringValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'object') return JSON.stringify(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function assertPresetFileName(name: string) {
  if (!name || name === '.' || name === '..' || /[/\\<>:"|?*\x00-\x1f]/.test(name)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid preset name', { presetName: name })
  }
}
