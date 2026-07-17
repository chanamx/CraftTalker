import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../app.js'
import type { ExtensionCompatibilityReport } from '../services/extension.service.js'

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

  it('returns read-only ST-shaped extension version information', async () => {
    writeTestExtension('LittleWhiteBox', {
      display_name: 'LittleWhiteBox',
      version: '1.2.3',
      js: 'index.js',
      homePage: 'https://github.com/RT15548/LittleWhiteBox',
    })
    const app = createApp()

    const res = await app.request('/api/extensions/version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extensionName: 'LittleWhiteBox', global: false }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      currentBranchName: 'manifest',
      currentCommitHash: 'manifest:1.2.3',
      current_branch_name: 'manifest',
      current_commit_hash: 'manifest:1.2.3',
      isUpToDate: true,
      is_up_to_date: true,
      remoteUrl: 'https://github.com/RT15548/LittleWhiteBox',
      remote_url: 'https://github.com/RT15548/LittleWhiteBox',
      version: '1.2.3',
      extensionPath: 'third-party/LittleWhiteBox',
      extension_path: 'third-party/LittleWhiteBox',
    })
  })

  it('supports GET extension version probes and rejects missing names', async () => {
    writeTestExtension('JS-Slash-Runner', {
      display_name: 'JS-Slash-Runner',
      version: '0.9.0',
      js: 'dist/index.js',
      repository: { url: 'https://gitlab.com/novi028/JS-Slash-Runner' },
    })
    const app = createApp()

    const ok = await app.request('/api/extensions/version?extensionName=JS-Slash-Runner')
    const missing = await app.request('/api/extensions/version')

    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({
      remoteUrl: 'https://gitlab.com/novi028/JS-Slash-Runner',
      shortCommitHash: 'manifest:0.9',
    })
    expect(missing.status).toBe(400)
  })

  it('keeps ST extension mutation endpoints fail-closed', async () => {
    const app = createApp()

    for (const endpoint of ['/api/extensions/install', '/api/extensions/update', '/api/extensions/delete']) {
      const res = await app.request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extensionName: 'LittleWhiteBox' }),
      })
      expect(res.status).toBe(501)
      expect(await res.json()).toMatchObject({ success: false, blocked: true })
    }
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
    const tagsShim = await app.request('/scripts/tags.js')
    const rootTagsShim = await app.request('/tags.js')
    const slashCommandShim = await app.request('/scripts/slash-commands/SlashCommandParser.js')

    expect(openaiShim.status).toBe(200)
    expect(await openaiShim.text()).toContain('/compat/openai.js')
    expect(scriptShim.status).toBe(200)
    expect(await scriptShim.text()).toContain('/scripts/compat/script.js')
    expect(tagsShim.status).toBe(200)
    expect(await tagsShim.text()).toContain('/compat/tags.js')
    expect(rootTagsShim.status).toBe(200)
    expect(await rootTagsShim.text()).toContain('/scripts/compat/tags.js')
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
    fs.writeFileSync(path.join(dir, 'dist', '4c354c82c52ca6cc2543.ttf'), 'font-data', 'utf8')
    fs.writeFileSync(path.join(dir, 'locales', 'zh-cn.json'), '{"display_name":"Prompt Template"}', 'utf8')
    const app = createApp()

    const chunkRes = await app.request('/scripts/extensions/third-party/ST-Prompt-Template/dist/970.index.js')
    const workerRes = await app.request('/scripts/extensions/third-party/ST-Prompt-Template/dist/ejs.workers.js')
    const fontRes = await app.request('/scripts/extensions/third-party/ST-Prompt-Template/dist/codicon.ttf')
    const localeRes = await app.request('/scripts/extensions/third-party/ST-Prompt-Template/locales/zh-cn.json')

    expect(chunkRes.status).toBe(200)
    expect(chunkRes.headers.get('Content-Type')).toContain('text/javascript')
    expect(await chunkRes.text()).toContain('chunk = true')
    expect(workerRes.status).toBe(200)
    expect(workerRes.headers.get('Content-Type')).toContain('text/javascript')
    expect(fontRes.status).toBe(200)
    expect(fontRes.headers.get('Content-Type')).toBe('font/ttf')
    expect(await fontRes.text()).toBe('font-data')
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
        power_user: {
          personas: { 'Writer.png': 'Writer' },
          persona_descriptions: { 'Writer.png': { description: 'Persistent persona' } },
          default_persona: 'Writer.png',
        },
      }),
    })
    const readRes = await app.request('/api/extensions/settings')

    expect(saveRes.status).toBe(200)
    expect(readRes.status).toBe(200)
    const settings = await readRes.json()
    expect(settings).toMatchObject({
      disabledExtensions: ['third-party/TestExt'],
      samplePlugin: { enabled: true, nested: { value: 42 } },
      power_user: {
        personas: { 'Writer.png': 'Writer' },
        persona_descriptions: { 'Writer.png': { description: 'Persistent persona' } },
        default_persona: 'Writer.png',
      },
      quickReplyV2: { config: { setList: [] } },
    })
  })

  it('serializes atomic extension settings mutations without losing concurrent fields', async () => {
    const service = await import('../services/extension.service.js') as unknown as {
      updateExtensionSettings?: (
        mutate: (settings: Record<string, unknown>) => Promise<void> | void,
      ) => Promise<Record<string, unknown>>
    }
    expect(service.updateExtensionSettings).toEqual(expect.any(Function))
    if (!service.updateExtensionSettings) return

    let releaseFirst!: () => void
    let markFirstStarted!: () => void
    const firstStarted = new Promise<void>(resolve => { markFirstStarted = resolve })
    const firstBlocked = new Promise<void>(resolve => { releaseFirst = resolve })
    const order: string[] = []

    const first = service.updateExtensionSettings(async settings => {
      order.push('first-start')
      markFirstStarted()
      await firstBlocked
      settings.firstPlugin = { enabled: true }
      order.push('first-end')
    })
    await firstStarted
    const second = service.updateExtensionSettings(settings => {
      order.push('second')
      expect(settings.firstPlugin).toEqual({ enabled: true })
      settings.secondPlugin = { enabled: true }
    })

    releaseFirst()
    await Promise.all([first, second])

    expect(order).toEqual(['first-start', 'first-end', 'second'])
    await expect(service.updateExtensionSettings(settings => {
      expect(settings).toMatchObject({
        firstPlugin: { enabled: true },
        secondPlugin: { enabled: true },
      })
    })).resolves.toMatchObject({
      firstPlugin: { enabled: true },
      secondPlugin: { enabled: true },
    })
  })

  it('keeps ST quick reply v2 settings visible for prompt-template plugins', async () => {
    const app = createApp()
    const quickReplyV2 = {
      config: {
        setList: [{
          set: {
            name: 'Prompt Snippets',
            qrList: [
              { label: 'Greeting', message: 'Hello {{char}}' },
            ],
          },
        }],
      },
    }

    const saveRes = await app.request('/api/extensions/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quickReplyV2 }),
    })
    const readRes = await app.request('/api/extensions/settings')

    expect(saveRes.status).toBe(200)
    expect(readRes.status).toBe(200)
    expect(await readRes.json()).toMatchObject({ quickReplyV2 })
  })

  it('reports extension compatibility state without executing plugins', async () => {
    writeTestExtension('WorkingExt', {
      display_name: 'Working Extension',
      loading_order: 5,
      js: 'index.js',
      css: 'style.css',
      hooks: { activate: 'activateHook' },
    })
    writeTestExtension('NeedsMissingDependency', {
      display_name: 'Needs Missing Dependency',
      js: 'index.js',
      requires: ['MissingExt'],
    })
    writeTestExtension('UsesDependenciesField', {
      display_name: 'Uses Dependencies Field',
      js: 'index.js',
      requires: [],
      dependencies: ['WorkingExt'],
    })
    const brokenDir = writeTestExtension('BrokenExt', {
      display_name: 'Broken Extension',
      js: 'missing.js',
    })
    fs.rmSync(path.join(brokenDir, 'index.js'), { force: true })
    const app = createApp()

    const res = await app.request('/api/extensions/compatibility-report')

    expect(res.status).toBe(200)
    const report = await res.json() as ExtensionCompatibilityReport
    expect(report.totals).toMatchObject({ discovered: expect.any(Number), withErrors: expect.any(Number) })
    expect(report.runtimeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'resource-loading', status: 'supported' }),
      expect.objectContaining({ id: 'dom-anchors', status: 'partial' }),
      expect.objectContaining({ id: 'user-file-storage', status: 'partial' }),
      expect.objectContaining({ id: 'persona-avatar-api', status: 'partial' }),
      expect.objectContaining({ id: 'chat-history-api', status: 'partial' }),
      expect.objectContaining({ id: 'worldbook-api', status: 'partial' }),
      expect.objectContaining({ id: 'character-api', status: 'partial' }),
      expect.objectContaining({ id: 'generation-api', status: 'partial' }),
      expect.objectContaining({ id: 'trusted-browser-extension-runtime', status: 'partial' }),
      expect.objectContaining({ id: 'image-and-cors-proxy', status: 'blocked' }),
      expect.objectContaining({ id: 'unsafe-script-runtime', status: 'blocked' }),
    ]))
    expect(report.extensions).toContainEqual(expect.objectContaining({
      name: 'third-party/WorkingExt',
      displayName: 'Working Extension',
      manifestOk: true,
      scriptOk: true,
      cssOk: true,
      enabled: true,
      hooks: { activate: 'activateHook' },
    }))
    expect(report.extensions).toContainEqual(expect.objectContaining({
      name: 'third-party/NeedsMissingDependency',
      missingRequiredDependencies: ['MissingExt'],
    }))
    expect(report.extensions).toContainEqual(expect.objectContaining({
      name: 'third-party/UsesDependenciesField',
      requires: ['WorkingExt'],
      missingRequiredDependencies: [],
    }))
    expect(report.extensions).toContainEqual(expect.objectContaining({
      name: 'third-party/BrokenExt',
      scriptPath: 'missing.js',
      scriptOk: false,
    }))
  })

  it('blocks extension resource traversal attempts', async () => {
    writeTestExtension()
    const app = createApp()

    const res = await app.request('/scripts/extensions/third-party/TestExt/%252e%252e/manifest.json')

    expect(res.status).toBe(400)
  })
})
