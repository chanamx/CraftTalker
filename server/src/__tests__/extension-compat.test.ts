import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../app.js'

let testDataDir = ''

beforeEach(() => {
  process.env.NODE_ENV = 'test'
  testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luker-extension-compat-'))
  process.env.LUKER_DATA_DIR = testDataDir
})

afterEach(() => {
  delete process.env.LUKER_DATA_DIR
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

function writeTestExtension(name = 'TestExt', manifest: Record<string, unknown> = {
  display_name: 'Test Extension',
  loading_order: 5,
  js: 'index.js',
  css: 'style.css',
}) {
  const dir = path.join(testDataDir, 'extensions', 'third-party', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8')
  fs.writeFileSync(path.join(dir, 'index.js'), "export const loaded = true;\n", 'utf8')
  fs.writeFileSync(path.join(dir, 'style.css'), '.test-extension { color: red; }\n', 'utf8')
  return dir
}

describe('SillyTavern extension compatibility routes', () => {
  it('discovers local third-party extensions in ST-compatible shape', async () => {
    writeTestExtension()
    const app = createApp()

    const res = await app.request('/api/extensions/discover')

    expect(res.status).toBe(200)
    expect(await res.json()).toContainEqual({ type: 'local', name: 'third-party/TestExt' })
  })

  it('serves extension manifest and static resources from /scripts/extensions', async () => {
    writeTestExtension()
    const app = createApp()

    const manifestRes = await app.request('/scripts/extensions/third-party/TestExt/manifest.json')
    const scriptRes = await app.request('/scripts/extensions/third-party/TestExt/index.js')

    expect(manifestRes.status).toBe(200)
    expect(await manifestRes.json()).toMatchObject({ js: 'index.js', css: 'style.css' })
    expect(scriptRes.status).toBe(200)
    expect(scriptRes.headers.get('Content-Type')).toContain('text/javascript')
    expect(await scriptRes.text()).toContain('loaded = true')
  })

  it('serves built-in system extension manifests from public scripts', async () => {
    const app = createApp()

    const res = await app.request('/scripts/extensions/regex/manifest.json')

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      display_name: 'Regex',
      js: 'engine.js',
    })
  })

  it('serves compatibility shims for common ST relative imports', async () => {
    writeTestExtension()
    const app = createApp()

    const scriptShim = await app.request('/scripts/extensions/third-party/TestExt/script.js')
    const slashShim = await app.request('/scripts/extensions/third-party/TestExt/slash-commands/SlashCommandParser.js')

    expect(scriptShim.status).toBe(200)
    expect(await scriptShim.text()).toContain('/scripts/compat/script.js')
    expect(slashShim.status).toBe(200)
    expect(await slashShim.text()).toContain('/scripts/compat/slash-commands/SlashCommandParser.js')
  })

  it('serves compatibility shims for advanced third-party extension imports', async () => {
    writeTestExtension()
    const app = createApp()

    const openaiShim = await app.request('/scripts/extensions/third-party/TestExt/openai.js')
    const libShim = await app.request('/scripts/extensions/third-party/TestExt/lib.js')
    const reasoningShim = await app.request('/scripts/extensions/third-party/TestExt/reasoning.js')
    const charDataShim = await app.request('/scripts/extensions/third-party/TestExt/char-data.js')
    const regexShim = await app.request('/scripts/extensions/third-party/TestExt/extensions/regex/engine.js')
    const accountStorageShim = await app.request('/scripts/extensions/third-party/TestExt/util/AccountStorage.js')
    const macroRegistryShim = await app.request('/scripts/extensions/third-party/TestExt/macros/engine/MacroRegistry.js')

    expect(openaiShim.status).toBe(200)
    expect(await openaiShim.text()).toContain('/scripts/compat/openai.js')
    expect(libShim.status).toBe(200)
    expect(await libShim.text()).toContain('/scripts/compat/lib.js')
    expect(reasoningShim.status).toBe(200)
    expect(await reasoningShim.text()).toContain('/scripts/compat/reasoning.js')
    expect(charDataShim.status).toBe(200)
    expect(await charDataShim.text()).toContain('/scripts/compat/char-data.js')
    expect(regexShim.status).toBe(200)
    expect(await regexShim.text()).toContain('/scripts/compat/extensions/regex/engine.js')
    expect(accountStorageShim.status).toBe(200)
    expect(await accountStorageShim.text()).toContain('/scripts/compat/util/AccountStorage.js')
    expect(macroRegistryShim.status).toBe(200)
    expect(await macroRegistryShim.text()).toContain('/scripts/compat/macros/engine/MacroRegistry.js')
  })

  it('serves root SillyTavern script shims for bundled relative imports', async () => {
    const app = createApp()

    const openaiShim = await app.request('/scripts/openai.js')
    const scriptShim = await app.request('/script.js')
    const slashCommandShim = await app.request('/scripts/slash-commands/SlashCommandParser.js')

    expect(openaiShim.status).toBe(200)
    expect(await openaiShim.text()).toContain('/compat/openai.js')
    expect(scriptShim.status).toBe(200)
    expect(await scriptShim.text()).toContain('/scripts/compat/script.js')
    expect(slashCommandShim.status).toBe(200)
    expect(await slashCommandShim.text()).toContain('/compat/slash-commands/SlashCommandParser.js')
  })

  it('prefers plugin resources over compatibility shims with the same file name', async () => {
    const dir = writeTestExtension()
    fs.writeFileSync(path.join(dir, 'utils.js'), "export const pluginUtility = true;\n", 'utf8')
    const app = createApp()

    const res = await app.request('/scripts/extensions/third-party/TestExt/utils.js')

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('pluginUtility = true')
  })

  it('serves bundled webpack chunks, workers, and font assets for packaged extensions', async () => {
    const dir = writeTestExtension('ST-Prompt-Template', {
      display_name: 'Prompt Template',
      loading_order: 1,
      js: 'dist/index.js',
      i18n: { 'zh-cn': 'locales/zh-cn.json' },
    })
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'locales'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'dist', 'index.js'), "import './970.index.js';\n", 'utf8')
    fs.writeFileSync(path.join(dir, 'dist', '970.index.js'), 'export const chunk = true;\n', 'utf8')
    fs.writeFileSync(path.join(dir, 'dist', 'ejs.workers.js'), 'self.onmessage = () => {};\n', 'utf8')
    fs.writeFileSync(path.join(dir, 'dist', 'font.ttf'), 'font-data', 'utf8')
    fs.writeFileSync(path.join(dir, 'locales', 'zh-cn.json'), '{"display_name":"Prompt Template"}', 'utf8')
    const app = createApp()

    const chunkRes = await app.request('/scripts/extensions/third-party/ST-Prompt-Template/dist/970.index.js')
    const workerRes = await app.request('/scripts/extensions/third-party/ST-Prompt-Template/dist/ejs.workers.js')
    const fontRes = await app.request('/scripts/extensions/third-party/ST-Prompt-Template/dist/font.ttf')
    const localeRes = await app.request('/scripts/extensions/third-party/ST-Prompt-Template/locales/zh-cn.json')

    expect(chunkRes.status).toBe(200)
    expect(chunkRes.headers.get('Content-Type')).toContain('text/javascript')
    expect(await chunkRes.text()).toContain('chunk = true')
    expect(workerRes.status).toBe(200)
    expect(workerRes.headers.get('Content-Type')).toContain('text/javascript')
    expect(fontRes.status).toBe(200)
    expect(fontRes.headers.get('Content-Type')).toBe('font/ttf')
    expect(localeRes.status).toBe(200)
    expect(await localeRes.json()).toMatchObject({ display_name: 'Prompt Template' })
  })

  it('persists extension settings while preserving unknown plugin keys', async () => {
    const app = createApp()

    const saveRes = await app.request('/api/extensions/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disabledExtensions: ['third-party/TestExt'],
        samplePlugin: { enabled: true, nested: { value: 42 } },
      }),
    })
    const readRes = await app.request('/api/extensions/settings')

    expect(saveRes.status).toBe(200)
    expect(readRes.status).toBe(200)
    expect(await readRes.json()).toMatchObject({
      disabledExtensions: ['third-party/TestExt'],
      samplePlugin: { enabled: true, nested: { value: 42 } },
    })
  })

  it('blocks extension resource traversal attempts', async () => {
    writeTestExtension()
    const app = createApp()

    const res = await app.request('/scripts/extensions/third-party/TestExt/%252e%252e/manifest.json')

    expect(res.status).toBe(400)
  })
})
