import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getPreset, listPresets, savePreset } from '../services/preset.service.js'
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

  it('keeps generation presets on .settings paths', async () => {
    await savePreset('openai', 'Creative', {
      name: 'Creative',
      temperature: 1.2,
      top_p: 0.95,
      max_tokens: 600,
    })

    expect(fs.existsSync(path.join(testDataDir, 'openAI_Settings', 'Creative.settings'))).toBe(true)
    expect(await listPresets('openai')).toEqual(['Creative'])
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
})
