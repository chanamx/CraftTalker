import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getGenerationPreset, getPreset, listPresetEntries, listPresets, savePreset } from '../services/preset.service.js'
import { createApp } from '../app.js'

const testDataDir = path.join(os.tmpdir(), `luker-preset-compat-${Date.now()}`)

beforeEach(() => {
  process.env.NODE_ENV = 'test'
  process.env.LUKER_DATA_DIR = testDataDir
  fs.mkdirSync(testDataDir, { recursive: true })
})

afterEach(() => {
  delete process.env.LUKER_DATA_DIR
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

describe('preset compatibility', () => {
  it('lists and reads ST instruct JSON presets without dropping unknown fields', async () => {
    const dir = path.join(testDataDir, 'instruct')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'Llama3.json'),
      JSON.stringify({
        name: 'Llama3',
        input_sequence: '<|start_header_id|>user<|end_header_id|>',
        output_sequence: '<|start_header_id|>assistant<|end_header_id|>',
        regex_scripts: [{ script_name: 'preset-regex', find_regex: '/foo/g' }],
        custom_template_field: 'preserve-me',
      }),
      'utf8',
    )

    expect(await listPresets('instruct')).toEqual(['Llama3'])

    const preset = await getPreset('instruct', 'Llama3')
    expect(preset.name).toBe('Llama3')
    expect(preset.input_sequence).toBe('<|start_header_id|>user<|end_header_id|>')
    expect(preset.regex_scripts).toEqual([{ script_name: 'preset-regex', find_regex: '/foo/g' }])
    expect(preset.custom_template_field).toBe('preserve-me')
  })

  it('saves ST template presets as JSON in their native directory', async () => {
    await savePreset('sysprompt', 'Narrator', {
      name: 'Narrator',
      content: 'You are {{char}}.',
      custom_field: { keep: true },
    })

    const filePath = path.join(testDataDir, 'sysprompt', 'Narrator.json')
    const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'))

    expect(stored.content).toBe('You are {{char}}.')
    expect(stored.custom_field.keep).toBe(true)
    expect(await listPresets('sysprompt')).toEqual(['Narrator'])
  })

  it('saves new generation presets to modern ST/Tauri JSON paths', async () => {
    await savePreset('openai', 'Creative', {
      name: 'Creative',
      temperature: 1.2,
      top_p: 0.95,
      max_tokens: 600,
    })

    expect(fs.existsSync(path.join(testDataDir, 'OpenAI Settings', 'Creative.json'))).toBe(true)
    expect(await listPresets('openai')).toEqual(['Creative'])
  })

  it('still updates existing legacy CraftTalker .settings presets in place', async () => {
    const dir = path.join(testDataDir, 'openAI_Settings')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'Legacy.settings'), JSON.stringify({
      name: 'Legacy',
      temperature: 0.4,
      custom_legacy_field: 'keep',
    }), 'utf8')

    await savePreset('openai', 'Legacy', {
      name: 'Legacy',
      temperature: 0.9,
    })

    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'Legacy.settings'), 'utf8'))
    expect(stored.temperature).toBe(0.9)
    expect(stored.custom_legacy_field).toBe('keep')
    expect(fs.existsSync(path.join(testDataDir, 'OpenAI Settings', 'Legacy.json'))).toBe(false)
  })

  it('prefers modern ST/Tauri JSON when duplicate legacy names exist', async () => {
    fs.mkdirSync(path.join(testDataDir, 'OpenAI Settings'), { recursive: true })
    fs.mkdirSync(path.join(testDataDir, 'openAI_Settings'), { recursive: true })
    fs.writeFileSync(path.join(testDataDir, 'OpenAI Settings', 'Shared.json'), JSON.stringify({
      name: 'Shared',
      temperature: 1.1,
    }), 'utf8')
    fs.writeFileSync(path.join(testDataDir, 'openAI_Settings', 'Shared.settings'), JSON.stringify({
      name: 'Shared',
      temperature: 0.2,
    }), 'utf8')

    const entries = await listPresetEntries('openai')
    const preset = await getPreset('openai', 'Shared')

    expect(entries).toEqual([
      expect.objectContaining({ name: 'Shared', format: 'sillytavern-json', directory: 'OpenAI Settings' }),
    ])
    expect(preset.temperature).toBe(1.1)
  })

  it('normalizes ST/Tauri generation fields for runtime use', async () => {
    const dir = path.join(testDataDir, 'TextGen Settings')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'Runtime.json'), JSON.stringify({
      name: 'Runtime',
      temp: 0.82,
      rep_pen: 1.18,
      rep_pen_range: 256,
      freq_pen: 0.15,
      presence_pen: 0.2,
      max_new_tokens: 777,
      custom_sampler_field: 'preserve-me',
    }), 'utf8')

    const preset = await getGenerationPreset('textgen', 'Runtime')

    expect(preset.temperature).toBe(0.82)
    expect(preset.repetition_penalty).toBe(1.18)
    expect(preset.repetition_penalty_range).toBe(256)
    expect(preset.frequency_penalty).toBe(0.15)
    expect(preset.presence_penalty).toBe(0.2)
    expect(preset.max_tokens).toBe(777)
    expect(preset.custom_sampler_field).toBe('preserve-me')
  })

  it('keeps ST/Tauri preset names with punctuation addressable', async () => {
    const dir = path.join(testDataDir, 'instruct')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'Mistral V2 & V3.json'), JSON.stringify({
      name: 'Mistral V2 & V3',
      input_sequence: '[INST]',
    }), 'utf8')

    const preset = await getPreset('instruct', 'Mistral V2 & V3')

    expect(await listPresets('instruct')).toEqual(['Mistral V2 & V3'])
    expect(preset.input_sequence).toBe('[INST]')
  })

  it('reads ST/Tauri content-pack preset directories as fallback sources', async () => {
    const dir = path.join(testDataDir, 'presets', 'context')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'ChatML.json'), JSON.stringify({
      name: 'ChatML',
      story_string: '{{system}}',
    }), 'utf8')

    const entries = await listPresetEntries('context')
    const preset = await getPreset('context', 'ChatML')

    expect(entries).toEqual([
      expect.objectContaining({ name: 'ChatML', directory: 'presets/context' }),
    ])
    expect(preset.story_string).toBe('{{system}}')
  })

  it('serves new ST preset directories through the API route', async () => {
    const dir = path.join(testDataDir, 'reasoning')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'Chain.json'), JSON.stringify({ name: 'Chain' }), 'utf8')

    const app = createApp()
    const res = await app.request('/api/presets/reasoning')
    const body = await res.json() as string[]

    expect(res.status).toBe(200)
    expect(body).toEqual(['Chain'])
  })

  it('serves preset source metadata through the API route', async () => {
    const dir = path.join(testDataDir, 'OpenAI Settings')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'Default.json'), JSON.stringify({ name: 'Default' }), 'utf8')

    const app = createApp()
    const res = await app.request('/api/presets/openai?details=1')
    const body = await res.json() as Array<{ name: string; format: string; directory: string }>

    expect(res.status).toBe(200)
    expect(body).toEqual([
      expect.objectContaining({ name: 'Default', format: 'sillytavern-json', directory: 'OpenAI Settings' }),
    ])
  })

  it('preserves unknown template fields when saving through the API route', async () => {
    const app = createApp()
    const res = await app.request('/api/presets/sysprompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Narrator',
        content: 'You are {{char}}.',
        regex_scripts: [{ script_name: 'preset-regex' }],
        custom_field: { keep: true },
      }),
    })

    const body = await res.json() as { custom_field?: { keep?: boolean } }
    const stored = JSON.parse(fs.readFileSync(path.join(testDataDir, 'sysprompt', 'Narrator.json'), 'utf8'))

    expect(res.status).toBe(201)
    expect(body.custom_field?.keep).toBe(true)
    expect(stored.custom_field.keep).toBe(true)
    expect(stored.regex_scripts).toEqual([{ script_name: 'preset-regex' }])
  })
})
