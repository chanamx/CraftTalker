import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  event_types,
  eventSource,
  extension_settings,
  executeSlashCommandsWithOptions,
  getContext,
  getLocalVariable,
  getExtensionManifest,
  replaceVariableMacros,
  renderExtensionTemplate,
  renderExtensionTemplateAsync,
  saveSettings,
  setGlobalVariable,
  setLocalVariable,
  SlashCommandParser,
  extensionNames,
  extensionTypes,
  initializeStExtensionHost,
  updateStExtensionContext,
} from '@/lib/st-extension-host'

afterEach(() => {
  vi.unstubAllGlobals()
  SlashCommandParser.commands = {}
})

describe('SillyTavern extension host compatibility', () => {
  it('auto-fires APP_READY for listeners registered after the event', async () => {
    const listener = vi.fn()

    await eventSource.emit(event_types.APP_READY, 'ready')
    eventSource.on(event_types.APP_READY, listener)

    expect(listener).toHaveBeenCalledWith('ready')
  })

  it('bridges CraftTalker chat state into getContext', () => {
    updateStExtensionContext({
      activeCharacter: {
        id: 'char-a',
        name: 'Alice',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'Alice',
        world: null,
      },
      activeChatId: 'chat-a',
      characters: [{
        id: 'char-a',
        name: 'Alice',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'Alice',
        world: null,
      }],
      messages: [{
        id: 'msg-0',
        role: 'user',
        content: 'hello',
        timestamp: 1,
        lineIndex: 0,
      }],
      chatLines: [{
        name: 'You',
        is_user: true,
        mes: 'hello',
      }],
    })

    const context = getContext()

    expect(context.chatId).toBe('chat-a')
    expect(context.characterId).toBe(0)
    expect(context.chat).toEqual([{ name: 'You', is_user: true, mes: 'hello' }])
  })

  it('registers and executes basic slash commands', async () => {
    SlashCommandParser.addCommand('hello', (_args, unnamed) => `hi ${unnamed}`)

    await expect(executeSlashCommandsWithOptions('/hello there')).resolves.toBe('hi there')
  })

  it('accepts ST-style slash command execution options', async () => {
    SlashCommandParser.addCommand('hello', (_args, unnamed) => `hi ${unnamed}`)

    await expect(executeSlashCommandsWithOptions({ command: '/hello options' })).resolves.toBe('hi options')
  })

  it('exposes STscript as a LittleWhiteBox-compatible slash command bridge', async () => {
    SlashCommandParser.addCommand('echo', (_args, unnamed) => unnamed)

    await expect(window.STscript?.('/echo hello from iframe')).resolves.toBe('hello from iframe')
  })

  it('supports eventSource.off alias', async () => {
    const listener = vi.fn()

    eventSource.on(event_types.MESSAGE_SENT, listener)
    eventSource.off(event_types.MESSAGE_SENT, listener)
    await eventSource.emit(event_types.MESSAGE_SENT, 'hello')

    expect(listener).not.toHaveBeenCalled()
  })

  it('supports ST event listener priority helpers used by prompt template plugins', async () => {
    const calls: string[] = []
    const first = () => calls.push('first')
    const normal = () => calls.push('normal')
    const last = () => calls.push('last')

    eventSource.on(event_types.GENERATE_AFTER_DATA, normal)
    eventSource.makeLast(event_types.GENERATE_AFTER_DATA, last)
    eventSource.makeFirst(event_types.GENERATE_AFTER_DATA, first)

    await eventSource.emit(event_types.GENERATE_AFTER_DATA, {})

    expect(calls).toEqual(['first', 'normal', 'last'])
  })

  it('exposes chat metadata and ST variable stores through context', () => {
    setLocalVariable('mood', 'bright')
    setGlobalVariable('weather', 'clear')

    const context = getContext()

    expect(context.chatMetadata).toBe(context.chat_metadata)
    expect(getLocalVariable('mood')).toBe('bright')
    expect(context.variables).toMatchObject({
      global: expect.objectContaining({ weather: 'clear' }),
      local: expect.objectContaining({ mood: 'bright' }),
    })
  })

  it('resolves Tavern Helper and LittleWhiteBox variable macros', () => {
    setGlobalVariable('profile.name', 'Yuzhuo')
    setLocalVariable('stats', { hp: 8, $private: 'hidden' })

    expect(replaceVariableMacros('{{get_global_variable::profile.name}}')).toBe('Yuzhuo')
    expect(replaceVariableMacros('{{get_chat_variable::stats.hp}}')).toBe('8')
    expect(replaceVariableMacros('{{format_chat_variable::stats}}')).toBe('hp: 8')
    expect(replaceVariableMacros('{{xbgetvar::stats.hp}}')).toBe('8')
  })

  it('supports registerMacroLike through the TavernHelper facade', () => {
    const helper = window.TavernHelper as {
      registerMacroLike: (regex: RegExp, replace: (context: unknown, substring: string, value: string) => string) => { unregister: () => void }
      substitudeMacros: (value: string) => string
    }

    const registration = helper.registerMacroLike(/\{\{upper::(.*?)\}\}/gi, (_context, _substring, value) => value.toUpperCase())

    expect(helper.substitudeMacros('{{upper::craft}}')).toBe('CRAFT')
    registration.unregister()
    expect(helper.substitudeMacros('{{upper::craft}}')).toBe('{{upper::craft}}')
  })

  it('returns ST-style slash result objects when requested by plugin shims', async () => {
    SlashCommandParser.addCommand('pipe', (_args, unnamed) => unnamed)

    await expect(executeSlashCommandsWithOptions('/pipe value', { returnResultObject: true })).resolves.toMatchObject({
      pipe: 'value',
      isError: false,
    })
  })

  it('provides a controlled xiaobaix streaming generation shim', async () => {
    const shim = window.xiaobaixStreamingGeneration

    await expect(shim?.xbgenrawCommand({ nonstream: 'true', text: 'Hello {{getglobalvar::profile.name}}' })).resolves.toBe('Hello Yuzhuo')

    const sessionId = await shim?.xbgenrawCommand({ id: 'xb-test', text: 'queued' })
    expect(sessionId).toBe('xb-test')
    expect(shim?.getStatus('xb-test')).toMatchObject({ isStreaming: true, text: '' })

    await new Promise(resolve => window.setTimeout(resolve, 0))
    expect(shim?.getStatus('xb-test')).toMatchObject({ isStreaming: false, text: 'queued', error: null })

    shim?.cancel('xb-test')
    expect(shim?.getStatus('xb-test').isStreaming).toBe(false)
  })

  it('stores and emits LittleWhiteBox template variables', async () => {
    const listener = vi.fn()
    eventSource.on('xiaobaix_template_variables_updated', listener)

    const vars = window.updateTemplateVariables?.({ hp: 5 })

    expect(vars).toMatchObject({ hp: 5 })
    await Promise.resolve()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ hp: 5 }))
  })

  it('publishes common SillyTavern frontend globals used by third-party extensions', () => {
    const globals = window as typeof window & {
      _: { get: (value: unknown, path: string) => unknown }
      Popper: { createPopper: unknown }
      hljs: { highlightElement: unknown }
      showdown: { Converter: unknown }
      toastr: { info: unknown }
    }

    expect(globals.$).toBe(globals.jQuery)
    expect(globals._.get({ nested: { value: 42 } }, 'nested.value')).toBe(42)
    expect(globals.hljs.highlightElement).toEqual(expect.any(Function))
    expect(globals.showdown.Converter).toEqual(expect.any(Function))
    expect(globals.toastr.info).toEqual(expect.any(Function))
    expect(globals.Popper.createPopper).toEqual(expect.any(Function))
  })

  it('provides a conservative jQuery sortable facade for extension task lists', () => {
    document.body.innerHTML = '<ol id="tasks"><li id="task-a"></li><li data-task-id="task-b"></li></ol>'
    const list = window.$?.('#tasks') as (JQuery & {
      sortable: (optionsOrAction?: unknown, ...args: unknown[]) => unknown
    }) | undefined

    expect(list?.sortable).toEqual(expect.any(Function))
    list?.sortable({ handle: '.drag' })

    expect(list?.sortable('instance')).toBeTruthy()
    expect(list?.sortable('toArray')).toEqual(['task-a', 'task-b'])
    expect(list?.sortable('destroy')).toBe(list)
    expect(list?.sortable('instance')).toBeUndefined()
  })

  it('persists extension settings through the compatibility API facade', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...extension_settings,
      samplePlugin: { enabled: true },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    extension_settings.samplePlugin = { enabled: true }
    await saveSettings()

    expect(fetchMock).toHaveBeenCalledWith('/api/extensions/settings', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('loads extension HTML templates for ST settings panels', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<section>{{title}}</section>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const html = await renderExtensionTemplateAsync('third-party/ST-Prompt-Template', 'settings', { title: 'Prompt Template' })

    expect(fetchMock).toHaveBeenCalledWith('/scripts/extensions/third-party/ST-Prompt-Template/settings.html')
    expect(html).toBe('<section>Prompt Template</section>')
    expect(renderExtensionTemplate('third-party/ST-Prompt-Template', 'settings', { title: 'Cached' })).toBe('<section>Cached</section>')
  })

  it('keeps extension discovery arrays stable for public shim references', async () => {
    const namesReference = extensionNames
    const typesReference = extensionTypes
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/extensions/settings') {
        return new Response(JSON.stringify(extension_settings), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url === '/api/extensions/discover') {
        return new Response(JSON.stringify([{ type: 'local', name: 'third-party/StableRef' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === '/scripts/extensions/third-party/StableRef/manifest.json') {
        return new Response(JSON.stringify({ display_name: 'StableRef', js: '' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await initializeStExtensionHost()

    expect(extensionNames).toBe(namesReference)
    expect(extensionTypes).toBe(typesReference)
    expect(namesReference).toContain('third-party/StableRef')
    expect(typesReference).toMatchObject({ 'third-party/StableRef': 'local' })
    expect(getExtensionManifest('StableRef')).toMatchObject({ display_name: 'StableRef' })
  })
})
