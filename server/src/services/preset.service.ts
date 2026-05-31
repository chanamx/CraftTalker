import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createError, ErrorCode } from '../lib/errors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')

function getDataDir() { return process.env.LUKER_DATA_DIR ?? DEFAULT_DATA_DIR }
const KOBOLD_DIR = () => path.join(getDataDir(), 'koboldAI_Settings')
const OPENAI_DIR = () => path.join(getDataDir(), 'openAI_Settings')
const TEXTGEN_DIR = () => path.join(getDataDir(), 'textGen_Settings')
const NOVEL_DIR = () => path.join(getDataDir(), 'novelAI_Settings')

export interface GenerationPreset {
  name: string
  temperature: number
  top_p: number
  top_k: number
  top_a: number
  min_p: number
  max_tokens: number
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
}

const DEFAULT_PRESET: GenerationPreset = {
  name: '默认',
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  top_a: 0,
  min_p: 0.05,
  max_tokens: 300,
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

export type PresetType = 'kobold' | 'openai' | 'textgen' | 'novel'

function getPresetDir(type: PresetType): string {
  switch (type) {
    case 'kobold': return KOBOLD_DIR()
    case 'openai': return OPENAI_DIR()
    case 'textgen': return TEXTGEN_DIR()
    case 'novel': return NOVEL_DIR()
  }
}

function getPresetPath(type: PresetType, name: string): string {
  return path.join(getPresetDir(type), `${name}.settings`)
}

export async function listPresets(type: PresetType): Promise<string[]> {
  const dir = getPresetDir(type)
  if (!existsSync(dir)) return []
  const entries = await fs.readdir(dir)
  return entries
    .filter(f => f.endsWith('.settings'))
    .map(f => f.replace('.settings', ''))
}

export async function getPreset(type: PresetType, name: string): Promise<GenerationPreset> {
  const filePath = getPresetPath(type, name)
  if (!existsSync(filePath)) {
    throw createError(ErrorCode.PRESET_NOT_FOUND, `预设 "${type}/${name}" 不存在`, { presetType: type, presetName: name })
  }
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw) as GenerationPreset
}

export async function savePreset(type: PresetType, name: string, preset: GenerationPreset): Promise<GenerationPreset> {
  const dir = getPresetDir(type)
  await fs.mkdir(dir, { recursive: true })
  const filePath = getPresetPath(type, name)
  await fs.writeFile(filePath, JSON.stringify(preset, null, 2), 'utf8')
  return preset
}

export async function deletePreset(type: PresetType, name: string): Promise<boolean> {
  const filePath = getPresetPath(type, name)
  if (!existsSync(filePath)) {
    throw createError(ErrorCode.PRESET_NOT_FOUND, `预设 "${type}/${name}" 不存在`, { presetType: type, presetName: name })
  }
  await fs.unlink(filePath)
  return true
}

export function getDefaultPreset(): GenerationPreset {
  return { ...DEFAULT_PRESET }
}
