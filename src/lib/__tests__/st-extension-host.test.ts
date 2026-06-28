import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  event_types,
  eventSource,
  extension_settings,
  executeSlashCommands,
  executeSlashCommandsWithOptions,
  getDiagnostics,
  getContext,
  getCharacter,
  getCharacters,
  getOneCharacter,
  getGlobalVariable,
  getLocalVariable,
  getExtensionManifest,
  loadWorldInfo,
  messageFormatting,
  replaceVariableMacros,
  reloadMarkdownProcessor,
  renderExtensionTemplate,
  renderExtensionTemplateAsync,
  resetDiagnostics,
  saveMetadata,
  saveMetadataDebounced,
  saveSettings,
  setGlobalVariable,
  setLocalVariable,
  SlashCommandParser,
  extensionNames,
  extensionTypes,
  initializeStExtensionHost,
  updateWorldInfoList,
  saveChatConditional,
  updateStExtensionContext,
  updateMessageBlock,
  addOneMessage,
  writeExtensionField,
  writeExtensionFieldBulk,
  unshallowCharacter,
} from '@/lib/st-extension-host'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  SlashCommandParser.commands = {}
  updateStExtensionContext({
    activeCharacter: null,
    activeChatId: null,
    characters: [],
    messages: [],
    chatLines: [],
  })
  resetDiagnostics()
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
    expect(context.chat).toEqual([expect.objectContaining({ name: 'You', is_user: true, mes: 'hello' })])
  })

  it('mirrors active character details in ST v1/v2-compatible character shape', () => {
    updateStExtensionContext({
      activeCharacter: {
        id: 'char-detail',
        name: 'DetailBot',
        avatar: 'DetailBot.png',
        description: 'Detailed description',
        personality: 'Curious',
        scenario: 'A workshop',
        first_mes: 'Hello from detail',
        mes_example: '<START>',
        creator_notes: 'Notes',
        system_prompt: 'System prompt',
        post_history_instructions: 'Post history',
        alternate_greetings: ['Alt one'],
        character_version: '1.2.3',
        creator: 'Tester',
        tags: ['test'],
        extensions: { world: 'DetailLore', regex_scripts: [{ scriptName: 'sample' }] },
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'DetailBot',
        world: 'DetailLore',
      },
      activeChatId: 'chat-detail',
      characters: [{
        id: 'char-detail',
        name: 'DetailBot',
        avatar: 'DetailBot.png',
        description: 'Detailed description',
        personality: 'Curious',
        scenario: 'A workshop',
        first_mes: 'Hello from detail',
        mes_example: '<START>',
        creator_notes: 'Notes',
        system_prompt: 'System prompt',
        post_history_instructions: 'Post history',
        alternate_greetings: ['Alt one'],
        character_version: '1.2.3',
        creator: 'Tester',
        tags: ['test'],
        extensions: { world: 'DetailLore', regex_scripts: [{ scriptName: 'sample' }] },
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'DetailBot',
        world: 'DetailLore',
      }],
      messages: [],
      chatLines: [],
    })

    const character = (getContext().characters as Array<Record<string, unknown>>)[0]
    const data = character.data as Record<string, unknown>
    const jsonData = JSON.parse(String(character.json_data)) as Record<string, { data: Record<string, unknown> }>

    expect(character).toMatchObject({
      first_mes: 'Hello from detail',
      avatar: 'DetailBot.png',
      chat: 'chat-detail',
      chid: 0,
    })
    expect(data).toMatchObject({
      name: 'DetailBot',
      first_mes: 'Hello from detail',
      alternate_greetings: ['Alt one'],
      extensions: { world: 'DetailLore', regex_scripts: [{ scriptName: 'sample' }] },
    })
    expect(jsonData.data).toMatchObject(data)
  })

  it('normalizes native character avatar URLs to ST-style avatar filenames in the plugin host', () => {
    updateStExtensionContext({
      activeCharacter: {
        id: 'native-avatar',
        name: 'NativeAvatarBot',
        avatar: '/api/characters/NativeAvatarBot/avatar',
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'NativeAvatarBot',
        world: null,
      },
      activeChatId: 'native-avatar-chat',
      characters: [{
        id: 'native-avatar',
        name: 'NativeAvatarBot',
        avatar: '/api/characters/NativeAvatarBot/avatar',
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'NativeAvatarBot',
        world: null,
      }],
      messages: [],
      chatLines: [],
    })

    expect((getContext().characters as Array<Record<string, unknown>>)[0]?.avatar).toBe('NativeAvatarBot.png')
    expect((getCharacter(0) as Record<string, unknown>).avatar).toBe('NativeAvatarBot.png')
  })

  it('refreshes one ST character mirror entry by legacy avatar filename', async () => {
    updateStExtensionContext({
      activeCharacter: null,
      activeChatId: null,
      characters: [{
        id: 'import-bot',
        name: 'ImportBot',
        avatar: '/api/characters/ImportBot/avatar',
        description: 'Old description',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'ImportBot',
        world: null,
      }],
      messages: [],
      chatLines: [],
    })
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/characters/ImportBot') {
        return new Response(JSON.stringify({
          name: 'ImportBot',
          description: 'Fresh description',
          tags: ['fresh'],
          creator: 'Tester',
          spec: 'chara_card_v2',
          spec_version: '2.0',
          avatar: '/api/characters/ImportBot/avatar',
          file_name: 'ImportBot',
          created_at: 1,
          updated_at: 2,
          world: 'FreshLore',
          personality: 'Curious',
          scenario: 'Lab',
          first_mes: 'Fresh hello',
          mes_example: '',
          creator_notes: '',
          system_prompt: '',
          post_history_instructions: '',
          alternate_greetings: ['Alt'],
          character_version: '1.0',
          extensions: { world: 'FreshLore', tavern_helper: { variables: { mood: 'bright' } } },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const character = await getOneCharacter('ImportBot.png')

    expect(fetchMock).toHaveBeenCalledWith('/api/characters/ImportBot', expect.any(Object))
    expect(character).toMatchObject({
      name: 'ImportBot',
      avatar: 'ImportBot.png',
      description: 'Fresh description',
      first_mes: 'Fresh hello',
      world: 'FreshLore',
    })
    expect((character?.data as Record<string, unknown>).extensions).toMatchObject({
      tavern_helper: { variables: { mood: 'bright' } },
      world: 'FreshLore',
    })
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'getOneCharacter', status: 'partial' }),
    ]))
  })

  it('refreshes ST character list without discarding existing detail fields', async () => {
    updateStExtensionContext({
      activeCharacter: {
        id: 'active-bot',
        name: 'ActiveBot',
        avatar: '/api/characters/ActiveBot/avatar',
        description: 'Detailed description',
        first_mes: 'Keep me',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'ActiveBot',
        world: null,
      },
      activeChatId: 'chat-a',
      characters: [{
        id: 'active-bot',
        name: 'ActiveBot',
        avatar: '/api/characters/ActiveBot/avatar',
        description: 'Detailed description',
        first_mes: 'Keep me',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'ActiveBot',
        world: null,
      }],
      messages: [],
      chatLines: [],
    })
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/characters') {
        return new Response(JSON.stringify([
          {
            name: 'ImportBot',
            description: 'Newly imported',
            tags: [],
            creator: '',
            spec: 'chara_card_v2',
            spec_version: '2.0',
            avatar: '/api/characters/ImportBot/avatar',
            file_name: 'ImportBot',
            created_at: 3,
            updated_at: 4,
            world: null,
          },
          {
            name: 'ActiveBot',
            description: 'Updated summary',
            tags: ['tag'],
            creator: '',
            spec: 'chara_card_v2',
            spec_version: '2.0',
            avatar: '/api/characters/ActiveBot/avatar',
            file_name: 'ActiveBot',
            created_at: 1,
            updated_at: 5,
            world: 'ActiveLore',
          },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const list = await getCharacters()

    expect(fetchMock).toHaveBeenCalledWith('/api/characters', expect.any(Object))
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ name: 'ImportBot', avatar: 'ImportBot.png', shallow: true })
    expect(list[1]).toMatchObject({
      name: 'ActiveBot',
      avatar: 'ActiveBot.png',
      first_mes: 'Keep me',
      description: 'Updated summary',
      chat: 'chat-a',
      shallow: false,
    })
    expect(getContext().characterId).toBe(1)
  })

  it('unshallows shallow ST character entries through one-character refresh', async () => {
    updateStExtensionContext({
      activeCharacter: null,
      activeChatId: null,
      characters: [{
        id: 'shallow-bot',
        name: 'ShallowBot',
        avatar: '/api/characters/ShallowBot/avatar',
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'ShallowBot',
        world: null,
        shallow: true,
      } as never],
      messages: [],
      chatLines: [],
    })
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/characters/ShallowBot') {
        return new Response(JSON.stringify({
          name: 'ShallowBot',
          description: 'Expanded',
          tags: [],
          creator: '',
          spec: 'chara_card_v2',
          spec_version: '2.0',
          avatar: '/api/characters/ShallowBot/avatar',
          file_name: 'ShallowBot',
          created_at: 1,
          updated_at: 2,
          world: null,
          personality: '',
          scenario: '',
          first_mes: 'Expanded hello',
          mes_example: '',
          creator_notes: '',
          character_version: '',
          extensions: {},
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const character = await unshallowCharacter('0')

    expect(fetchMock).toHaveBeenCalledWith('/api/characters/ShallowBot', expect.any(Object))
    expect(character).toMatchObject({ name: 'ShallowBot', first_mes: 'Expanded hello', shallow: false })
  })

  it('exposes ST-style chat messages without the JSONL metadata header', () => {
    updateStExtensionContext({
      activeCharacter: {
        id: 'char-st-chat',
        name: 'Chatty',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'Chatty',
        world: null,
      },
      activeChatId: 'chat-st-chat',
      characters: [],
      messages: [],
      chatLines: [
        { chat_metadata: { variables: {}, extensions: {} }, user_name: 'User', character_name: 'Chatty' },
        { name: 'User', is_user: true, is_system: false, mes: 'Hello', send_date: '2026-06-18T00:00:00.000Z', extra: {} },
        { name: 'Chatty', is_user: false, is_system: false, mes: 'Hi', send_date: '2026-06-18T00:00:01.000Z', extra: {}, swipes: ['Hi', 'Alt'], swipe_id: 1 },
      ],
    })

    const context = getContext()
    const chat = context.chat as Array<Record<string, unknown>>

    expect(chat).toHaveLength(2)
    expect(chat[0]).toMatchObject({ mes: 'Hello', swipe_id: 0, variables: [{}], variables_initialized: [false] })
    expect(chat[1]).toMatchObject({ mes: 'Hi', swipe_id: 1, variables: [{}, {}], variables_initialized: [false, false] })
    expect(Object.keys(chat[0] ?? {})).not.toContain('_lineIndex')
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

  it('formats markdown messages through a sanitized ST-compatible messageFormatting bridge', () => {
    setLocalVariable('mood', 'bright')

    const html = messageFormatting(
      'Hello **{{getvar::mood}}**\n<script>alert(1)</script><img src="x" onerror="bad()">',
      'Alice',
      false,
      false,
      0,
    )

    expect(html).toContain('<strong>bright</strong>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'messageFormatting', status: 'partial' }),
    ]))
  })

  it('returns a reusable markdown processor for JS-Slash-Runner render helpers', () => {
    const processor = reloadMarkdownProcessor()

    expect(processor.makeHtml('**Help**\nnext')).toContain('<strong>Help</strong>')
    expect(processor.makeHtml('<script>alert(1)</script>')).not.toContain('<script')
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'reloadMarkdownProcessor', status: 'partial' }),
    ]))
  })

  it('returns ST-style slash result objects when requested by plugin shims', async () => {
    SlashCommandParser.addCommand('pipe', (_args, unnamed) => unnamed)

    await expect(executeSlashCommandsWithOptions('/pipe value', { returnResultObject: true })).resolves.toMatchObject({
      pipe: 'value',
      isError: false,
    })
  })

  it('defaults plugin-visible slash option runners to ST-style result objects', async () => {
    SlashCommandParser.addCommand('plugin-pipe', (_args, unnamed) => unnamed)

    const context = getContext()
    const contextRunner = context.executeSlashCommandsWithOptions as (command: string) => Promise<unknown>
    const windowRunner = window.executeSlashCommandsWithOptions as (command: string) => Promise<unknown>
    const sillyTavernRunner = window.SillyTavern?.executeSlashCommandsWithOptions as ((command: string) => Promise<unknown>) | undefined

    await expect(executeSlashCommandsWithOptions('/plugin-pipe direct')).resolves.toBe('direct')
    await expect(contextRunner('/plugin-pipe context')).resolves.toMatchObject({ pipe: 'context', isError: false })
    await expect(windowRunner('/plugin-pipe window')).resolves.toMatchObject({ pipe: 'window', isError: false })
    await expect(sillyTavernRunner?.('/plugin-pipe host')).resolves.toMatchObject({ pipe: 'host', isError: false })
  })

  it('accepts the legacy executeSlashCommands(command, true) result-object form', async () => {
    SlashCommandParser.addCommand('json', () => JSON.stringify({ ok: true }))

    await expect(executeSlashCommands('/json', true)).resolves.toMatchObject({
      pipe: '{"ok":true}',
      isError: false,
    })
  })

  it('passes pipe output between basic slash command pipeline segments', async () => {
    SlashCommandParser.addCommand('pass', (_args, unnamed) => unnamed)
    SlashCommandParser.addCommand('wrap', (_args, unnamed) => `<${unnamed}>`)

    await expect(executeSlashCommandsWithOptions('/pass hello | /wrap', { returnResultObject: true })).resolves.toMatchObject({
      pipe: '<hello>',
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

  it('creates stable SillyTavern DOM anchors for extension panels and chat widgets', async () => {
    document.body.innerHTML = '<div id="chat"><div class="native-message">Native chat stays owned by React</div></div>'
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === '/api/worlds/settings') {
        return new Response(JSON.stringify({
          world_names: ['GlobalLore', 'LocalLore'],
          selected_world_info: ['GlobalLore'],
          world_info: { globalSelect: ['GlobalLore'], charLore: [], entries: {} },
          world_info_include_names: true,
          world_info_case_sensitive: false,
          world_info_match_whole_words: false,
          world_info_use_group_scoring: false,
          world_info_max_recursion_steps: 10,
          world_info_depth: 4,
          world_info_min_activations: 0,
          world_info_min_activations_depth_max: 0,
          world_info_budget: 25,
          world_info_budget_cap: 0,
          world_info_recursive: false,
          world_info_overflow_alert: false,
          world_info_character_strategy: 0,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    updateStExtensionContext({
      activeCharacter: {
        id: 'char-c',
        name: 'Cora',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'Cora',
        world: null,
      },
      activeChatId: 'chat-c',
      characters: [],
      messages: [],
      chatLines: [
        { chat_metadata: { variables: {}, extensions: {} }, user_name: 'User', character_name: 'Cora' },
        { name: 'User', is_user: true, is_system: false, mes: 'Hello', send_date: '2026-06-18T00:00:00.000Z', extra: {} },
        { name: 'Cora', is_user: false, is_system: false, mes: 'Hi', send_date: '2026-06-18T00:00:01.000Z', extra: {} },
      ],
    })
    await updateWorldInfoList()

    window.$?.('#extensions_settings').append('<div id="plugin-panel">Panel</div>')
    await Promise.resolve()

    expect(document.getElementById('crafttalker-st-compat-settings-panel')?.dataset.hasContent).toBe('true')
    expect(document.querySelector('#world_info option:nth-child(2)')?.textContent).toBe('GlobalLore')
    expect((document.getElementById('world_info') as HTMLSelectElement | null)?.multiple).toBe(true)
    expect(document.getElementById('world_editor_select')).toBeInstanceOf(HTMLSelectElement)
    expect(document.getElementById('send_form')).toBeInstanceOf(HTMLFormElement)
    expect(document.querySelector('#send_form .qr--buttons')).toBeTruthy()
    expect(document.getElementById('send_textarea')).toBeInstanceOf(HTMLTextAreaElement)
    const compatChat = document.getElementById('crafttalker-st-compat-root')?.querySelector('#chat')
    expect(document.querySelector('.native-message')?.textContent).toBe('Native chat stays owned by React')
    expect(Array.from(compatChat?.children ?? []).filter(child => child.classList.contains('mes'))).toHaveLength(2)
    expect(compatChat?.querySelector('.mes[mesid="1"] .mes_text')?.textContent).toBe('Hi')
  })

  it('updates the ST compatibility message DOM through updateMessageBlock', async () => {
    document.body.innerHTML = ''
    const rendered = vi.fn()
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, rendered)
    updateStExtensionContext({
      activeCharacter: {
        id: 'char-render',
        name: 'RenderBot',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'RenderBot',
        world: null,
      },
      activeChatId: 'chat-render',
      characters: [],
      messages: [],
      chatLines: [
        { chat_metadata: { variables: {}, extensions: {} }, user_name: 'User', character_name: 'RenderBot' },
        { name: 'RenderBot', is_user: false, is_system: false, mes: 'Initial', send_date: '2026-06-18T00:00:00.000Z', extra: {} },
      ],
    })

    const message = (getContext().chat as Array<Record<string, unknown>>)[0]
    message.mes = '**Changed**'
    updateMessageBlock(0, message, { rerenderMessage: true })
    await Promise.resolve()

    const compatChat = document.getElementById('crafttalker-st-compat-root')?.querySelector('#chat')
    expect(compatChat?.querySelector('.mes[mesid="0"] .mes_text')?.innerHTML).toContain('<strong>Changed</strong>')
    expect(rendered).toHaveBeenCalledWith(0)
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'updateMessageBlock', status: 'partial' }),
    ]))
  })

  it('refreshes existing forced addOneMessage entries without duplicating plugin-managed chat rows', () => {
    document.body.innerHTML = ''
    updateStExtensionContext({
      activeCharacter: null,
      activeChatId: null,
      characters: [],
      messages: [],
      chatLines: [
        { name: 'User', is_user: true, is_system: false, mes: 'Existing', send_date: '2026-06-18T00:00:00.000Z', extra: {} },
      ],
    })

    const chat = getContext().chat as Array<Record<string, unknown>>
    addOneMessage(chat[0], { forceId: 0 })

    expect(chat).toHaveLength(1)
    expect(document.getElementById('crafttalker-st-compat-root')?.querySelectorAll('#chat .mes')).toHaveLength(1)
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'addOneMessage', status: 'partial' }),
    ]))
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
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
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

  it('keeps ST global and chat variable stores stable for direct plugin writes', () => {
    const settingsVariables = extension_settings.variables as Record<string, unknown>
    const globalVariables = settingsVariables.global as Record<string, unknown>
    const context = getContext()
    const chatMetadata = context.chatMetadata as Record<string, unknown>
    const chatVariables = chatMetadata.variables as Record<string, unknown>
    const contextVariables = context.variables as Record<string, Record<string, unknown>>

    globalVariables.LAST_SEND_TOKENS = 321
    setGlobalVariable('nested.flag', true)
    chatVariables.mood = 'focused'
    setLocalVariable('stats.hp', 7)
    ;(contextVariables.local.set as (path: string, value: unknown) => unknown)('viaFacade', 'ok')
    contextVariables.global.directProperty = 'visible'

    expect(getGlobalVariable('LAST_SEND_TOKENS')).toBe(321)
    expect(globalVariables).toMatchObject({ nested: { flag: true }, directProperty: 'visible' })
    expect(getLocalVariable('mood')).toBe('focused')
    expect(chatVariables).toMatchObject({ stats: { hp: 7 }, viaFacade: 'ok' })
    const windowVariables = window.extension_settings?.variables as Record<string, unknown> | undefined
    expect(windowVariables?.global).toBe(globalVariables)
    expect((contextVariables.global.get as (path: string) => unknown)('LAST_SEND_TOKENS')).toBe(321)
    expect((getContext().chatMetadata as Record<string, unknown>).variables).toBe(chatVariables)
  })

  it('normalizes extension settings containers used by regex and quick-reply plugins', () => {
    const settings = extension_settings as Record<string, unknown>
    settings.regex = undefined
    settings.regex_presets = {}
    const setList = [{
      set: {
        name: 'Prompt Snippets',
        qrList: [
          { label: 'Greeting', message: 'Hello {{char}}' },
        ],
      },
    }]
    settings.quickReplyV2 = { config: { setList } }

    updateStExtensionContext({
      activeCharacter: null,
      activeChatId: null,
      characters: [],
      messages: [],
      chatLines: [],
    })

    expect(Array.isArray(settings.regex)).toBe(true)
    expect(Array.isArray(settings.regex_presets)).toBe(true)
    expect(settings.quickReplyV2).toMatchObject({ config: { setList } })
    expect(((settings.quickReplyV2 as Record<string, { setList: unknown[] }>).config).setList).toBe(setList)

    ;(settings.regex as Array<Record<string, unknown>>).push({ id: 'rx-1', scriptName: 'test' })
    settings.regex = (settings.regex as Array<Record<string, unknown>>).filter(entry => entry.id !== 'missing')

    expect(settings.regex).toEqual([{ id: 'rx-1', scriptName: 'test' }])
  })

  it('persists constrained character extension field writes for ST plugins', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/characters/FieldBot' && init?.method === 'PATCH') {
        return new Response(JSON.stringify({
          name: 'FieldBot',
          description: '',
          tags: [],
          creator: '',
          spec: 'chara_card_v2',
          spec_version: '2.0',
          avatar: null,
          file_name: 'FieldBot',
          created_at: 1,
          updated_at: 2,
          world: 'FieldWorld',
          personality: '',
          scenario: '',
          first_mes: '',
          mes_example: '',
          creator_notes: '',
          character_version: '1.0',
          extensions: {
            LittleWhiteBox: { variablesCore: { bumpAliases: { hp: 'health' } } },
            regex_scripts: [{ script_name: 'rx' }],
            world: 'FieldWorld',
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    updateStExtensionContext({
      activeCharacter: {
        id: 'field-bot',
        name: 'FieldBot',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'FieldBot',
        world: null,
      },
      activeChatId: 'field-chat',
      characters: [{
        id: 'field-bot',
        name: 'FieldBot',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'FieldBot',
        world: null,
        extensions: { keep: true },
      }],
      messages: [],
      chatLines: [],
    })

    await expect(writeExtensionField(0, 'LittleWhiteBox.variablesCore.bumpAliases', { hp: 'health' })).resolves.toBe(true)
    await expect(writeExtensionFieldBulk(0, { regex_scripts: [{ script_name: 'rx' }], world: 'FieldWorld' })).resolves.toBe(true)

    const character = getCharacter(0) as Record<string, unknown>
    const data = character.data as Record<string, unknown>
    const extensions = data.extensions as Record<string, unknown>
    const jsonData = JSON.parse(String(character.json_data)) as { data: { extensions: Record<string, unknown> } }

    expect(extensions).toMatchObject({
      LittleWhiteBox: { variablesCore: { bumpAliases: { hp: 'health' } } },
      regex_scripts: [{ script_name: 'rx' }],
      world: 'FieldWorld',
    })
    expect(jsonData.data.extensions).toMatchObject(extensions)
    expect(fetchMock).toHaveBeenCalledWith('/api/characters/FieldBot', expect.objectContaining({
      method: 'PATCH',
      body: expect.stringContaining('"LittleWhiteBox"'),
    }))
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'writeExtensionField', status: 'partial' }),
    ]))
  })

  it('blocks unsafe character extension field paths', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    updateStExtensionContext({
      activeCharacter: {
        id: 'unsafe-field-bot',
        name: 'UnsafeFieldBot',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'UnsafeFieldBot',
        world: null,
      },
      activeChatId: 'unsafe-field-chat',
      characters: [{
        id: 'unsafe-field-bot',
        name: 'UnsafeFieldBot',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'UnsafeFieldBot',
        world: null,
      }],
      messages: [],
      chatLines: [],
    })

    await expect(writeExtensionField(0, '__proto__.polluted', true)).resolves.toBe(false)

    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'writeExtensionField', status: 'stub' }),
    ]))
  })

  it('clears active chat variables on chats without metadata without breaking plugin-held references', () => {
    updateStExtensionContext({
      activeCharacter: {
        id: 'char-vars',
        name: 'Vars',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'Vars',
        world: null,
      },
      activeChatId: 'chat-vars-a',
      characters: [],
      messages: [],
      chatLines: [{
        chat_metadata: {
          variables: { mood: 'calm' },
          extensions: { LittleWhiteBox: { enabled: true } },
        },
        user_name: 'User',
        character_name: 'Vars',
      }],
    })
    const chatMetadata = getContext().chatMetadata as Record<string, unknown>
    const variablesRef = chatMetadata.variables as Record<string, unknown>
    const extensionsRef = chatMetadata.extensions as Record<string, unknown>

    updateStExtensionContext({
      activeChatId: 'chat-vars-empty',
      chatLines: [],
    })

    expect((getContext().chatMetadata as Record<string, unknown>).variables).toBe(variablesRef)
    expect((getContext().chatMetadata as Record<string, unknown>).extensions).toBe(extensionsRef)
    expect(variablesRef).toEqual({})
    expect(extensionsRef).toEqual({})
  })

  it('persists direct ST message variable writes through the typed message-variable bridge', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === '/api/chats/PromptBot/chat-msg-vars/metadata') {
        return new Response(JSON.stringify({
          chat_metadata: {
            variables: { scene: 'quiet' },
            extensions: {},
            modified: '2026-06-18T00:00:00.000Z',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === '/api/chats/PromptBot/chat-msg-vars/message-variables') {
        return new Response(JSON.stringify({ updated: 2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    updateStExtensionContext({
      activeCharacter: {
        id: 'char-msg-vars',
        name: 'PromptBot',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'PromptBot',
        world: null,
      },
      activeChatId: 'chat-msg-vars',
      characters: [],
      messages: [],
      chatLines: [
        { chat_metadata: { variables: { scene: 'quiet' }, extensions: {} }, user_name: 'User', character_name: 'PromptBot' },
        { name: 'User', is_user: true, is_system: false, mes: 'Hello', send_date: '2026-06-18T00:00:00.000Z', extra: {} },
        { name: 'PromptBot', is_user: false, is_system: false, mes: 'Hi', send_date: '2026-06-18T00:00:01.000Z', extra: {}, swipes: ['Hi', 'Alt'], swipe_id: 1 },
      ],
    })

    const chat = getContext().chat as Array<Record<string, unknown>>
    ;((chat[0]?.variables as Array<Record<string, unknown>>)[0] ?? {}).hp = 10
    ;((chat[1]?.variables as Array<Record<string, unknown>>)[1] ?? {}).mood = 'bright'
    ;(chat[1]?.variables_initialized as boolean[])[1] = true

    await saveChatConditional()

    expect(fetchMock).toHaveBeenCalledWith('/api/chats/PromptBot/chat-msg-vars/metadata', expect.objectContaining({
      method: 'PATCH',
    }))
    expect(fetchMock).toHaveBeenCalledWith('/api/chats/PromptBot/chat-msg-vars/message-variables', expect.objectContaining({
      method: 'PATCH',
    }))
    const messageVariablesCall = fetchMock.mock.calls.find(call => call[0] === '/api/chats/PromptBot/chat-msg-vars/message-variables')
    const body = JSON.parse(String((messageVariablesCall?.[1] as RequestInit).body))
    expect(body).toEqual({
      updates: [
        { lineIndex: 1, variables: [{ hp: 10 }], variables_initialized: [false] },
        { lineIndex: 2, variables: [{}, { mood: 'bright' }], variables_initialized: [false, true] },
      ],
    })
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'saveChatConditional', status: 'partial' }),
    ]))
  })

  it('does not persist untouched normalized empty message variable arrays', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === '/api/chats/PromptBot/chat-empty-vars/metadata') {
        return new Response(JSON.stringify({
          chat_metadata: {
            variables: {},
            extensions: {},
            modified: '2026-06-18T00:00:00.000Z',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    updateStExtensionContext({
      activeCharacter: {
        id: 'char-empty-vars',
        name: 'PromptBot',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'PromptBot',
        world: null,
      },
      activeChatId: 'chat-empty-vars',
      characters: [],
      messages: [],
      chatLines: [
        { chat_metadata: { variables: {}, extensions: {} }, user_name: 'User', character_name: 'PromptBot' },
        { name: 'User', is_user: true, is_system: false, mes: 'Hello', send_date: '2026-06-18T00:00:00.000Z', extra: {} },
        { name: 'PromptBot', is_user: false, is_system: false, mes: 'Hi', send_date: '2026-06-18T00:00:01.000Z', extra: {} },
      ],
    })

    await saveChatConditional()

    expect(fetchMock).toHaveBeenCalledWith('/api/chats/PromptBot/chat-empty-vars/metadata', expect.objectContaining({
      method: 'PATCH',
    }))
    expect(fetchMock).not.toHaveBeenCalledWith('/api/chats/PromptBot/chat-empty-vars/message-variables', expect.anything())
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'saveChatConditional', status: 'stub' }),
    ]))
  })

  it('records runtime diagnostics for partial or stubbed ST APIs', async () => {
    await saveMetadata()
    await (window.TavernHelper?.generateRaw as () => Promise<string>)?.()
    const context = getContext()
    const writeExtensionField = context.writeExtensionField as () => void
    writeExtensionField()

    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'saveMetadata',
        status: 'stub',
        count: 1,
      }),
      expect.objectContaining({
        id: 'TavernHelper.generateRaw',
        status: 'stub',
        count: 1,
      }),
      expect.objectContaining({
        id: 'writeExtensionField',
        status: 'stub',
        count: 1,
      }),
    ]))
    expect(window.CraftTalker?.stHost?.getDiagnostics()).toEqual(getDiagnostics())
  })

  it('routes TavernHelper.generateRaw through the governed ST backend bridge', async () => {
    const endedListener = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Bridge reply' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    eventSource.on(event_types.JS_GENERATION_ENDED, endedListener)

    const helper = window.TavernHelper as {
      generateRaw: (config: Record<string, unknown>) => Promise<string>
    }
    const result = await helper.generateRaw({
      generation_id: 'th-gen-1',
      user_input: 'Say hi',
      max_chat_history: 0,
      custom_api: {
        apiurl: 'https://openrouter.ai/api/v1/',
        key: 'sk-test',
        model: 'openai/gpt-4o-mini',
        source: 'openrouter',
      },
    })

    expect(result).toBe('Bridge reply')
    expect(fetchMock).toHaveBeenCalledWith('/api/backends/chat-completions/generate', expect.objectContaining({
      method: 'POST',
      signal: expect.any(AbortSignal),
    }))
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(request.body))
    expect(body).toMatchObject({
      chat_completion_source: 'openrouter',
      reverse_proxy: 'https://openrouter.ai/api/v1',
      proxy_password: 'sk-test',
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say hi' }],
      stream: false,
    })
    expect(endedListener).toHaveBeenCalledWith('Bridge reply', 'th-gen-1')
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'TavernHelper.generateRaw', status: 'partial' }),
    ]))
  })

  it('emits JS-Slash-Runner stream events for TavernHelper streaming generation', async () => {
    const fullListener = vi.fn()
    const incrementalListener = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    eventSource.on(event_types.STREAM_TOKEN_RECEIVED_FULLY, fullListener)
    eventSource.on(event_types.STREAM_TOKEN_RECEIVED_INCREMENTALLY, incrementalListener)

    const helper = window.TavernHelper as {
      generateRaw: (config: Record<string, unknown>) => Promise<string>
    }
    const result = await helper.generateRaw({
      generation_id: 'th-stream-1',
      user_input: 'Stream',
      should_stream: true,
      max_chat_history: 0,
      custom_api: {
        apiurl: 'https://api.example.test/v1',
        key: 'sk-test',
        model: 'gpt-test',
        source: 'openai',
      },
    })

    expect(result).toBe('Hello')
    expect(fullListener).toHaveBeenNthCalledWith(1, 'Hel', 'th-stream-1')
    expect(fullListener).toHaveBeenNthCalledWith(2, 'Hello', 'th-stream-1')
    expect(incrementalListener).toHaveBeenNthCalledWith(1, 'Hel', 'th-stream-1')
    expect(incrementalListener).toHaveBeenNthCalledWith(2, 'lo', 'th-stream-1')
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(request.body))).toMatchObject({ stream: true })
  })

  it('cancels active TavernHelper background generation by id', async () => {
    let capturedSignal: AbortSignal | null = null
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal instanceof AbortSignal ? init.signal : null
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          const error = new Error('Aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const helper = window.TavernHelper as {
      generateRaw: (config: Record<string, unknown>) => Promise<string>
      stopGenerationById: (generationId: string) => boolean
    }
    const pending = helper.generateRaw({
      generation_id: 'th-cancel-1',
      user_input: 'Long request',
      max_chat_history: 0,
      custom_api: {
        apiurl: 'https://api.example.test/v1',
        key: 'sk-test',
        model: 'gpt-test',
        source: 'openai',
      },
    })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(helper.stopGenerationById('th-cancel-1')).toBe(true)
    await expect(pending).resolves.toBe('')
    expect(Boolean(capturedSignal && (capturedSignal as AbortSignal).aborted)).toBe(true)
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'TavernHelper.stopGenerationById', status: 'partial' }),
      expect.objectContaining({ id: 'TavernHelper.generateRaw', status: 'partial' }),
    ]))
  })

  it('persists chat metadata through the active CraftTalker chat bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      chat_metadata: {
        variables: { mood: 'focused' },
        extensions: {},
        modified: '2026-06-18T00:00:00.000Z',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    updateStExtensionContext({
      activeCharacter: {
        id: 'char-b',
        name: 'Bob',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'Bob',
        world: null,
      },
      activeChatId: 'chat-b',
      characters: [],
      messages: [],
      chatLines: [{
        chat_metadata: { variables: { mood: 'calm' }, extensions: {}, stale: true },
        user_name: 'User',
        character_name: 'Bob',
      }],
    })
    setLocalVariable('mood', 'focused')

    await saveMetadata()

    expect(fetchMock).toHaveBeenCalledWith('/api/chats/Bob/chat-b/metadata', expect.objectContaining({
      method: 'PATCH',
    }))
    expect(getContext().chat_metadata).toMatchObject({
      variables: { mood: 'focused' },
      extensions: {},
      modified: '2026-06-18T00:00:00.000Z',
    })
    expect(getContext().chat_metadata).not.toHaveProperty('stale')
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'saveMetadata', status: 'partial' }),
    ]))
  })

  it('keeps debounced metadata writes bound to the chat that scheduled them', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      chat_metadata: {
        variables: { mood: 'queued' },
        extensions: {},
        modified: '2026-06-18T00:00:00.000Z',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
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
      characters: [],
      messages: [],
      chatLines: [{
        chat_metadata: { variables: { mood: 'calm' }, extensions: {} },
        user_name: 'User',
        character_name: 'Alice',
      }],
    })
    setLocalVariable('mood', 'queued')
    saveMetadataDebounced()

    updateStExtensionContext({
      activeCharacter: {
        id: 'char-b',
        name: 'Bob',
        avatar: null,
        description: '',
        model: 'default',
        lastMessage: '',
        pinned: false,
        file_name: 'Bob',
        world: null,
      },
      activeChatId: 'chat-b',
      characters: [],
      messages: [],
      chatLines: [{
        chat_metadata: { variables: { mood: 'fresh' }, extensions: {} },
        user_name: 'User',
        character_name: 'Bob',
      }],
    })

    await vi.runAllTimersAsync()

    expect(fetchMock).toHaveBeenCalledWith('/api/chats/Alice/chat-a/metadata', expect.objectContaining({
      method: 'PATCH',
    }))
    expect(getContext().chat_metadata).toMatchObject({
      variables: { mood: 'fresh' },
      extensions: {},
    })
  })

  it('loads CraftTalker worldbooks through read-only ST compatibility helpers', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/worlds/settings') {
        return new Response(JSON.stringify({
          world_names: ['GlobalLore', 'LocalLore'],
          selected_world_info: ['GlobalLore'],
          world_info: { globalSelect: ['GlobalLore'], charLore: [], entries: {} },
          world_info_include_names: true,
          world_info_case_sensitive: false,
          world_info_match_whole_words: false,
          world_info_use_group_scoring: false,
          world_info_max_recursion_steps: 12,
          world_info_depth: 6,
          world_info_min_activations: 2,
          world_info_min_activations_depth_max: 3,
          world_info_budget: 35,
          world_info_budget_cap: 900,
          world_info_recursive: true,
          world_info_overflow_alert: true,
          world_info_character_strategy: 1,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url === '/api/worlds/GlobalLore') {
        return new Response(JSON.stringify({
          name: 'GlobalLore',
          description: '',
          enabled: true,
          global_enabled: true,
          global_selective: false,
          selective_default: false,
          recursive_scanning: false,
          scan_depth: 100,
          token_budget: 500,
          recursive_scanning_depth: 2,
          extensions: {},
          entries: {
            '7': {
              uid: 7,
              key: ['portal'],
              keysecondary: [],
              comment: 'Portal',
              content: 'A silver door.',
              constant: true,
              selective: false,
              insertion_order: 100,
              enabled: true,
              position: 0,
              depth: 4,
              order: 100,
              use_regexp: false,
              probability: 100,
              group: '',
              group_override: false,
              exclude_recursion: false,
              prevent_recursion: false,
              delay_until_recursion: false,
              scan_depth: 100,
              match_whole_words: false,
              use_group_scoring: false,
              case_sensitive: false,
              automation_id: '',
              role: 0,
              sticky: 0,
              cooldown: 0,
              delay: 0,
              display_index: 7,
              extensions: {},
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await updateWorldInfoList()
    const world = await loadWorldInfo('GlobalLore')
    const helperEntries = await (window.TavernHelper?.getWorldbook as (name: string) => Promise<unknown[]>)?.('GlobalLore')

    expect(window.CraftTalker?.stHost?.world_names).toEqual(['GlobalLore', 'LocalLore'])
    expect(window.CraftTalker?.stHost?.selected_world_info).toEqual(['GlobalLore'])
    expect(window.CraftTalker?.stHost?.world_info.globalSelect).toBe(window.CraftTalker?.stHost?.selected_world_info)
    expect(window.CraftTalker?.stHost?.world_info_settings).toMatchObject({
      world_info_max_recursion_steps: 12,
      world_info_depth: 6,
      world_info_min_activations: 2,
      world_info_min_activations_depth_max: 3,
      world_info_budget: 35,
      world_info_budget_cap: 900,
      world_info_recursive: true,
      world_info_overflow_alert: true,
      world_info_character_strategy: 1,
    })
    expect(getContext().world_info_settings).toBe(window.CraftTalker?.stHost?.world_info_settings)
    expect(getContext().event_types).toBe(window.CraftTalker?.stHost?.event_types)
    expect(getContext().world_names).toBe(window.CraftTalker?.stHost?.world_names)
    expect(getContext().selected_world_info).toBe(window.CraftTalker?.stHost?.selected_world_info)
    expect(world?.entries['7']?.content).toBe('A silver door.')
    expect(helperEntries).toEqual([expect.objectContaining({ uid: 7, comment: 'Portal' })])
    expect(getDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'updateWorldInfoList', status: 'partial' }),
      expect.objectContaining({ id: 'loadWorldInfo', status: 'partial' }),
      expect.objectContaining({ id: 'TavernHelper.getWorldbook', status: 'partial' }),
    ]))
  })
})
