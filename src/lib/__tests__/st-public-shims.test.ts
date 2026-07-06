import { afterEach, describe, expect, it, vi } from 'vitest'

interface TestGlobal {
  CraftTalker?: {
    stHost: {
      getRequestHeaders: () => Record<string, string>
      selected_world_info?: string[]
      world_info?: Record<string, unknown>
      world_info_settings?: Record<string, unknown>
      world_names?: string[]
      event_types?: Record<string, string>
      eventSource?: {
        on: (...args: unknown[]) => unknown
        emit?: (...args: unknown[]) => unknown
      }
      extension_settings?: Record<string, unknown>
      characters?: Array<Record<string, unknown>>
      getContext?: () => Record<string, unknown>
      getCharacters?: () => Promise<Array<Record<string, unknown>>>
      getOneCharacter?: (id: unknown) => Promise<Record<string, unknown> | null>
      unshallowCharacter?: (id: unknown) => Promise<Record<string, unknown> | null>
      createNewWorldInfo?: (name: string, options?: Record<string, unknown>) => Promise<boolean>
      setWorldInfoSelection?: (names: string | string[], state: 'on' | 'off' | 'toggle') => Promise<boolean>
      loadWorldInfo?: (name: string) => Promise<unknown>
      saveWorldInfo?: (name: string, data: unknown, immediately?: boolean) => Promise<boolean>
      updateWorldInfoList?: () => Promise<void>
      recordCompatDiagnostic?: (id: string, status: string, note: string) => void
      messageFormatting?: (...args: unknown[]) => string
      reloadMarkdownProcessor?: () => { makeHtml: (value: unknown) => string }
      replaceVariableMacros?: (value: unknown) => string
      writeExtensionField?: (...args: unknown[]) => unknown
      writeExtensionFieldBulk?: (...args: unknown[]) => unknown
      updateContext?: (...args: unknown[]) => unknown
      registerMacro?: (...args: unknown[]) => unknown
      unregisterMacro?: (...args: unknown[]) => unknown
      registerMacroLike?: (...args: unknown[]) => unknown
      unregisterMacroLike?: (...args: unknown[]) => unknown
    }
  }
  SillyTavern?: unknown
  oai_settings?: Record<string, unknown>
  openai_settings?: Record<string, unknown>
}

function sseResponse(chunks: string[]): Response {
  return new Response(chunks.join(''), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

async function importOpenAiShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/openai.js')
}

async function importCustomRequestShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/custom-request.js')
}

async function importWorldInfoShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/world-info.js')
}

async function importScriptShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/script.js')
}

async function importPopupShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/popup.js')
}

async function importPersonasShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/personas.js')
}

async function importPowerUserShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/power-user.js')
}

async function importPresetManagerShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/preset-manager.js')
}

async function importRegexEngineShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/extensions/regex/engine.js')
}

async function importCharDataShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/char-data.js')
}

async function importGroupChatsShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/group-chats.js')
}

async function importExtensionsShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/extensions.js')
}

async function importConstantsShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/constants.js')
}

async function importTagsShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/tags.js')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
  document.body.innerHTML = ''
  document.getElementById('crafttalker-st-popup-style')?.remove()
  delete testGlobal().CraftTalker
  delete testGlobal().SillyTavern
  delete testGlobal().oai_settings
  delete testGlobal().openai_settings
})

describe('ST public compatibility shims', () => {
  it('exposes common SillyTavern chat completion source constants', async () => {
    const { chat_completion_sources, oai_settings } = await importOpenAiShim()

    expect(chat_completion_sources).toMatchObject({
      OPENAI: 'openai',
      CLAUDE: 'claude',
      MAKERSUITE: 'makersuite',
      OPENROUTER: 'openrouter',
      MISTRALAI: 'mistralai',
      GROQ: 'groq',
      DEEPSEEK: 'deepseek',
      XAI: 'xai',
      AZURE_OPENAI: 'azure_openai',
      CUSTOM: 'custom',
    })
    expect(oai_settings).toMatchObject({
      azure_base_url: '',
      azure_deployment_name: '',
      azure_api_version: '2024-10-21',
    })
    expect(testGlobal().oai_settings).toBe(oai_settings)
    expect(testGlobal().openai_settings).toBe(oai_settings)
  })

  it('exposes ST injection constants used by native prompt builders', async () => {
    const { debounce_timeout, inject_ids } = await importConstantsShim()

    expect(debounce_timeout).toMatchObject({ quick: 100, standard: 300, relaxed: 1000 })
    expect(inject_ids.DEPTH_PROMPT).toBe('DEPTH_PROMPT')
    expect(inject_ids.DEPTH_PROMPT_INDEX(2)).toBe('DEPTH_PROMPT_2')
    expect(inject_ids.CUSTOM_WI_DEPTH_ROLE(4, 0)).toBe('customDepthWI_4_0')
    expect(inject_ids.CUSTOM_WI_OUTLET('after')).toBe('customWIOutlet_after')
  })

  it('exposes an ST-shaped preset manager for common third-party plugins', async () => {
    const eventEmit = vi.fn()
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-Test': 'presets' }),
        event_types: { OAI_PRESET_CHANGED_AFTER: 'oai_preset_changed_after', PRESET_CHANGED: 'preset_changed' },
        eventSource: { on: vi.fn(), emit: eventEmit },
        recordCompatDiagnostic: vi.fn(),
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(['Creative', 'Balanced']), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        name: 'Creative',
        temperature: 1.2,
        extensions: { js_slash_runner: { enabled: true } },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        name: 'Balanced',
        temperature: 0.7,
        extensions: {},
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const { getPresetManager } = await importPresetManagerShim()
    const manager = getPresetManager('openai')

    expect(manager.getSelectedPreset).toEqual(expect.any(Function))
    expect(manager.getSelectedPresetName()).toBe('CraftTalker Default')
    expect(manager.getSelectedPreset()).toBe('0')
    expect(manager.getPresetList()).toMatchObject({
      presets: [expect.objectContaining({ name: 'CraftTalker Default' })],
      preset_names: { 'CraftTalker Default': 0 },
    })

    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))

    const presetList = manager.getPresetList()
    expect(presetList.presets).toEqual([
      expect.objectContaining({ name: 'Creative', extensions: { js_slash_runner: { enabled: true } } }),
      expect.objectContaining({ name: 'Balanced', extensions: {} }),
    ])
    expect(presetList.preset_names).toEqual({ Creative: 0, Balanced: 1 })
    expect(manager.getAllPresets()).toEqual(['Creative', 'Balanced'])
    expect(manager.getSelectedPresetName()).toBe('Creative')
    expect(manager.getSelectedPreset()).toBe('0')
    expect(manager.findPreset('Balanced')).toBe('1')
    expect(manager.getCompletionPresetByName('Creative')).toMatchObject({ temperature: 1.2 })

    manager.selectPreset('1')
    expect(manager.getSelectedPresetName()).toBe('Balanced')
    expect(eventEmit).toHaveBeenCalledWith('oai_preset_changed_after')
    expect(eventEmit).toHaveBeenCalledWith('preset_changed')
  })

  it('persists ST preset manager saves through the typed CraftTalker presets API', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-Test': 'save-preset' }),
        event_types: {},
        eventSource: { on: vi.fn(), emit: vi.fn() },
        recordCompatDiagnostic: vi.fn(),
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        name: 'Plugin Preset',
        extensions: { js_slash_runner: { scripts: [] } },
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const { getPresetManager } = await importPresetManagerShim()
    const manager = getPresetManager('openai')
    await manager.savePreset('Plugin Preset', { extensions: { js_slash_runner: { scripts: [] } } }, { skipUpdate: true })

    expect(fetchMock).toHaveBeenLastCalledWith('/api/presets/openai', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test': 'save-preset' },
      body: JSON.stringify({ extensions: { js_slash_runner: { scripts: [] } }, name: 'Plugin Preset' }),
    }))
    expect(manager.getPresetList().preset_names).toMatchObject({ 'Plugin Preset': expect.any(Number) })
    expect(manager.getCompletionPresetByName('Plugin Preset')).toMatchObject({
      extensions: { js_slash_runner: { scripts: [] } },
    })
  })

  it('bridges sendOpenAIRequest through the ST backend generate endpoint', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-Test': 'openai-shim' }),
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'OpenAI shim reply' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { sendOpenAIRequest, oai_settings, chat_completion_sources } = await importOpenAiShim()
    oai_settings.chat_completion_source = chat_completion_sources.OPENROUTER
    oai_settings.model = 'openai/gpt-4o-mini'
    oai_settings.reverse_proxy = 'https://openrouter.ai/api/v1'
    const result = await sendOpenAIRequest('normal', [{ role: 'user', content: 'Hello' }])

    expect(result).toMatchObject({ choices: [{ message: { content: 'OpenAI shim reply' } }] })
    expect(fetchMock).toHaveBeenCalledWith('/api/backends/chat-completions/generate', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-Test': 'openai-shim' }),
      body: expect.stringContaining('"chat_completion_source":"openrouter"'),
    }))
    expect(fetchMock).toHaveBeenCalledWith('/api/backends/chat-completions/generate', expect.objectContaining({
      body: expect.stringContaining('"reverse_proxy":"https://openrouter.ai/api/v1"'),
    }))
  })

  it('returns a ST-shaped stream generator when sendOpenAIRequest streaming is enabled', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const { sendOpenAIRequest, oai_settings } = await importOpenAiShim()
    oai_settings.stream_openai = true

    const streamFactory = await sendOpenAIRequest('normal', [{ role: 'user', content: 'Hello' }])
    const states = []
    for await (const state of streamFactory()) {
      states.push(state)
    }

    expect(states.map(state => state.text)).toEqual(['Hel', 'Hello'])
    expect(fetchMock).toHaveBeenCalledWith('/api/backends/chat-completions/generate', expect.objectContaining({
      body: expect.stringContaining('"stream":true'),
    }))
  })

  it('keeps quiet sendOpenAIRequest calls non-streaming for ST extension compatibility', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Quiet reply' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { sendOpenAIRequest, oai_settings } = await importOpenAiShim()
    oai_settings.stream_openai = true

    const result = await sendOpenAIRequest('quiet', [{ role: 'user', content: 'Summarize' }])

    expect(result).toMatchObject({ choices: [{ message: { content: 'Quiet reply' } }] })
    expect(fetchMock).toHaveBeenCalledWith('/api/backends/chat-completions/generate', expect.objectContaining({
      body: expect.not.stringContaining('"stream":true'),
    }))
  })

  it('builds ST generation parameters without sending a request', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        getContext: () => ({
          name1: 'User',
          name2: 'Narrator',
          selected_group: 'party',
          groups: [{ id: 'party', members: ['Alice.png', 'Bob.png'] }],
          characters: [
            { name: 'Alice', avatar: 'Alice.png' },
            { name: 'Bob', avatar: 'Bob.png' },
          ],
        }),
      },
    }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const powerUserShim = await importPowerUserShim()
    powerUserShim.power_user.custom_stopping_strings = JSON.stringify(['<END>', ''])
    const { createGenerationParameters, openai_max_stop_strings, chat_completion_sources } = await importOpenAiShim()

    const result = await createGenerationParameters({
      chat_completion_source: chat_completion_sources.OPENROUTER,
      model: 'preset-model',
      stream_openai: true,
      n: 2,
      temp_openai: 0.7,
      freq_pen_openai: 0.1,
      pres_pen_openai: 0.2,
      top_p_openai: 0.9,
      top_k_openai: 40,
      min_p_openai: 0.05,
      repetition_penalty_openai: 1.1,
      openai_max_tokens: 512,
      reverse_proxy: 'https://openrouter.example/v1',
    }, 'override-model', 'normal', [
      { role: 'user', content: 'Plan' },
      null,
    ], {
      jsonSchema: { name: 'plan', schema: { type: 'object' } },
      tools: [{ type: 'function', function: { name: 'lookup' } }],
      tool_choice: { type: 'function', function: { name: 'lookup' } },
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(openai_max_stop_strings).toBe(4)
    expect(result.stream).toBe(true)
    expect(result.canMultiSwipe).toBe(true)
    expect(result.generate_data).toMatchObject({
      chat_completion_source: 'openrouter',
      model: 'override-model',
      messages: [{ role: 'user', content: 'Plan' }],
      stream: true,
      temperature: 0.7,
      max_tokens: 512,
      stop: ['<END>'],
      user_name: 'User',
      char_name: 'Narrator',
      group_names: ['Alice', 'Bob'],
      reverse_proxy: 'https://openrouter.example/v1',
      json_schema: { name: 'plan', schema: { type: 'object' } },
      tools: [{ type: 'function', function: { name: 'lookup' } }],
      tool_choice: { type: 'function', function: { name: 'lookup' } },
    })
  })

  it('parses ST example blocks into chat-completion example messages', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        getContext: () => ({ name1: 'User', name2: 'Alice' }),
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
      },
    }
    const { parseExampleIntoIndividual } = await importOpenAiShim()

    expect(parseExampleIntoIndividual('Example\nUser: hello\nAlice: hi')).toEqual([
      { role: 'system', name: 'example_user', content: 'hello' },
      { role: 'system', name: 'example_assistant', content: 'hi' },
    ])
  })

  it('keeps ST OpenAI message example arrays usable for JS-Slash-Runner', async () => {
    const { setOpenAIMessageExamples } = await importOpenAiShim()

    expect(setOpenAIMessageExamples(['<START>\nUser: hello'])).toEqual(['<START>\nUser: hello'])
    expect(setOpenAIMessageExamples(null)).toEqual([])
  })

  it('forwards public messageFormatting and reloadMarkdownProcessor to the active ST host', async () => {
    const messageFormatting = vi.fn((value: unknown, name: unknown) => `<p>${String(name)}:${String(value)}</p>`)
    const makeHtml = vi.fn((value: unknown) => `<p>${String(value)}</p>`)
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        getContext: () => ({ this_chid: 0, name1: 'You', name2: 'Alice' }),
        event_types: { CHAT_CHANGED: 'chat_changed', APP_READY: 'app_ready' },
        eventSource: { on: vi.fn() },
        messageFormatting,
        reloadMarkdownProcessor: () => ({ makeHtml }),
      },
    }

    const scriptShim = await importScriptShim()

    expect(scriptShim.messageFormatting('**Hello**', 'Alice', false, false, 2)).toBe('<p>Alice:**Hello**</p>')
    expect(messageFormatting).toHaveBeenCalledWith('**Hello**', 'Alice', false, false, 2)
    expect(scriptShim.reloadMarkdownProcessor().makeHtml('help')).toBe('<p>help</p>')
    expect(makeHtml).toHaveBeenCalledWith('help')
  })

  it('forwards legacy public UI helpers to the active ST context when available', async () => {
    const reloadCurrentChat = vi.fn()
    let sendPressed = false
    const activateSendButtons = vi.fn(() => {
      sendPressed = false
    })
    const deactivateSendButtons = vi.fn(() => {
      sendPressed = true
    })
    const scrollChatToBottom = vi.fn()
    const setGenerationProgress = vi.fn()
    const eventHandlers = new Map<string, Array<() => void>>()
    const eventSource = {
      on: vi.fn((eventName: unknown, callback: unknown) => {
        if (typeof eventName !== 'string' || typeof callback !== 'function') return
        const handlers = eventHandlers.get(eventName) ?? []
        handlers.push(callback as () => void)
        eventHandlers.set(eventName, handlers)
      }),
    }
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        getContext: () => ({
          this_chid: 0,
          get is_send_press() {
            return sendPressed
          },
          isGenerating: () => sendPressed,
          reloadCurrentChat,
          activateSendButtons,
          deactivateSendButtons,
          scrollChatToBottom,
          setGenerationProgress,
        }),
        event_types: {
          CHAT_CHANGED: 'chat_changed',
          APP_READY: 'app_ready',
          GENERATION_STARTED: 'generation_started',
          JS_GENERATION_STARTED: 'js_generation_started',
          GENERATION_ENDED: 'generation_ended',
          JS_GENERATION_ENDED: 'js_generation_ended',
          GENERATION_STOPPED: 'generation_stopped',
        },
        eventSource,
      },
    }

    const scriptShim = await importScriptShim()

    expect(scriptShim.is_send_press).toBe(false)
    expect(scriptShim.isGenerating()).toBe(false)
    scriptShim.reloadCurrentChat()
    scriptShim.deactivateSendButtons()
    expect(scriptShim.is_send_press).toBe(true)
    expect(scriptShim.isGenerating()).toBe(true)
    scriptShim.activateSendButtons()
    expect(scriptShim.is_send_press).toBe(false)
    expect(scriptShim.isGenerating()).toBe(false)
    scriptShim.scrollChatToBottom({ waitForFrame: true })
    scriptShim.setGenerationProgress(50)

    expect(reloadCurrentChat).toHaveBeenCalledOnce()
    expect(activateSendButtons).toHaveBeenCalledOnce()
    expect(deactivateSendButtons).toHaveBeenCalledOnce()
    expect(scrollChatToBottom).toHaveBeenCalledWith({ waitForFrame: true })
    expect(setGenerationProgress).toHaveBeenCalledWith(50)
    eventHandlers.get('generation_started')?.forEach(callback => callback())
    expect(scriptShim.is_send_press).toBe(true)
    expect(scriptShim.isGenerating()).toBe(true)
    eventHandlers.get('generation_ended')?.forEach(callback => callback())
    expect(scriptShim.is_send_press).toBe(false)
    expect(scriptShim.isGenerating()).toBe(false)
  })

  it('exposes lightweight runtime-only named exports required by common third-party plugins', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        getContext: () => ({ this_chid: -1 }),
        event_types: { CHAT_CHANGED: 'chat_changed', APP_READY: 'app_ready' },
        eventSource: { on: vi.fn() },
      },
    }

    const scriptShim = await importScriptShim()
    const charDataShim = await importCharDataShim()
    const groupChatsShim = await importGroupChatsShim()
    const regexData = new charDataShim.RegexScriptData({ scriptName: 'Filter', findRegex: 'foo' })

    expect(scriptShim.GenerateOptions).toEqual({})
    expect(regexData).toMatchObject({ scriptName: 'Filter', findRegex: 'foo', disabled: false })
    expect(groupChatsShim.getGroupMembers()).toEqual([])
  })

  it('aggregates high-use ST helper exports from the root script shim', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        getContext: () => ({ this_chid: -1, name1: 'You', name2: '' }),
        event_types: { CHAT_CHANGED: 'chat_changed', APP_READY: 'app_ready' },
        eventSource: { on: vi.fn(), emit: vi.fn() },
        world_names: [],
        selected_world_info: [],
        world_info: { globalSelect: [], charLore: [], entries: {} },
        world_info_settings: {},
        loadWorldInfo: vi.fn(),
        updateWorldInfoList: vi.fn(),
        replaceVariableMacros: (value: unknown) => String(value),
        registerMacro: vi.fn(),
        unregisterMacro: vi.fn(),
        registerMacroLike: vi.fn(),
        unregisterMacroLike: vi.fn(),
      },
    }

    const scriptShim = await importScriptShim()

    expect(scriptShim).toMatchObject({
      promptManager: expect.any(Object),
      oai_settings: expect.any(Object),
      createGenerationParameters: expect.any(Function),
      getWorldInfoPrompt: expect.any(Function),
      saveWorldInfo: expect.any(Function),
      uuidv4: expect.any(Function),
      Stopwatch: expect.any(Function),
      v1CharData: expect.any(Function),
      RegexScriptData: expect.any(Function),
      getRegexedString: expect.any(Function),
      getCustomStoppingStrings: expect.any(Function),
      executeSlashCommandsWithOptions: expect.any(Function),
      getTokenCountAsync: expect.any(Function),
      getPresetManager: expect.any(Function),
      MacrosParser: expect.any(Function),
      commonEnumProviders: expect.any(Object),
      enumTypes: expect.any(Object),
    })
    expect(scriptShim.DEFAULT_DEPTH).toBe(4)
    expect(scriptShim.world_info_position).toMatchObject({ before: 0, after: 1, atDepth: 4 })
  })

  it('refreshes live script context exports before plugin click handlers run', async () => {
    let currentContext = { this_chid: -1, name1: 'You', name2: '' }
    const eventSource = { on: vi.fn() }
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        getContext: () => currentContext,
        event_types: { CHAT_CHANGED: 'chat_changed', CHAT_LOADED: 'chat_loaded', APP_READY: 'app_ready' },
        eventSource,
      },
    }

    const scriptShim = await importScriptShim()
    expect(scriptShim.this_chid).toBe(-1)

    currentContext = { this_chid: 2, name1: 'You', name2: 'Miku' }
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(scriptShim.this_chid).toBe(2)
    expect(scriptShim.name2).toBe('Miku')
  })

  it('renders ST-compatible promise popups without native alert blocking', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onOpen = vi.fn()
    const { POPUP_RESULT, POPUP_TYPE, callGenericPopup, getTopmostModalLayer } = await importPopupShim()

    const resultPromise = callGenericPopup(
      '<strong id="popup-content">Saved</strong>',
      POPUP_TYPE.TEXT,
      '',
      { okButton: 'Save', wide: true, leftAlign: true, onOpen },
    )
    await Promise.resolve()
    await Promise.resolve()

    const dialog = document.querySelector<HTMLElement>('.crafttalker-st-popup-dialog')
    expect(alertSpy).not.toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalled()
    expect(dialog?.dataset.size).toBe('wide')
    expect(dialog?.dataset.leftAlign).toBe('true')
    expect(getTopmostModalLayer()).toBe(dialog)
    expect(document.getElementById('popup-content')?.textContent).toBe('Saved')

    const saveButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.crafttalker-st-popup-button'))
      .find(button => button.textContent === 'Save')
    saveButton?.click()

    await expect(resultPromise).resolves.toBe(POPUP_RESULT.AFFIRMATIVE)
    expect(document.querySelector('.crafttalker-st-popup-root')).toBeNull()
  })

  it('returns ST-compatible confirm and input popup results', async () => {
    const { POPUP_RESULT, POPUP_TYPE, callGenericPopup } = await importPopupShim()

    const confirmPromise = callGenericPopup('Delete?', POPUP_TYPE.CONFIRM)
    await Promise.resolve()
    await Promise.resolve()
    const noButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.crafttalker-st-popup-button'))
      .find(button => button.textContent === 'No')
    noButton?.click()
    await expect(confirmPromise).resolves.toBe(POPUP_RESULT.NEGATIVE)

    const inputPromise = callGenericPopup('Name', POPUP_TYPE.INPUT, 'Alice', { okButton: 'Apply' })
    await Promise.resolve()
    await Promise.resolve()
    const input = document.querySelector<HTMLInputElement>('.crafttalker-st-popup-input')
    expect(input?.value).toBe('Alice')
    if (input) input.value = 'Bob'
    const applyButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.crafttalker-st-popup-button'))
      .find(button => button.textContent === 'Apply')
    applyButton?.click()

    await expect(inputPromise).resolves.toBe('Bob')
  })

  it('exposes ST Popup.show helpers and string custom button results', async () => {
    const { POPUP_RESULT, Popup } = await importPopupShim()

    expect(Popup.util.lastResult).toBeNull()

    const textPromise = Popup.show.text('Header', '<p>Body</p>', {
      customButtons: ['Inspect'],
      defaultResult: 2,
    })
    await Promise.resolve()
    await Promise.resolve()
    const inspectButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.crafttalker-st-popup-button'))
      .find(button => button.textContent === 'Inspect')
    inspectButton?.click()

    await expect(textPromise).resolves.toBe(2)
    expect(Popup.util.lastResult).toMatchObject({ value: 2, result: 2 })

    const confirmPromise = Popup.show.confirm('Delete?', 'This cannot be undone.')
    await Promise.resolve()
    await Promise.resolve()
    const yesButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.crafttalker-st-popup-button'))
      .find(button => button.textContent === 'Yes')
    yesButton?.click()

    await expect(confirmPromise).resolves.toBe(POPUP_RESULT.AFFIRMATIVE)

    const inputPromise = Popup.show.input('Name', 'Rename preset', 'Alice')
    await Promise.resolve()
    await Promise.resolve()
    const input = document.querySelector<HTMLInputElement>('.crafttalker-st-popup-input')
    if (input) input.value = ''
    const okButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.crafttalker-st-popup-button'))
      .find(button => button.textContent === 'OK')
    okButton?.click()

    await expect(inputPromise).resolves.toBe('')
  })

  it('collects ST custom popup inputs into Popup.util.lastResult', async () => {
    const { POPUP_TYPE, Popup, callGenericPopup } = await importPopupShim()

    const resultPromise = callGenericPopup('Advanced options', POPUP_TYPE.CONFIRM, '', {
      okButton: 'Apply',
      customInputs: [
        { id: 'enabled', label: 'Enabled', type: 'checkbox', defaultState: true },
        { id: 'title', label: 'Title', type: 'text', defaultState: 'Draft' },
        { id: 'notes', label: 'Notes', type: 'textarea', defaultState: 'Line one', rows: 2 },
        { id: 'limit', label: 'Limit', type: 'number', defaultState: 3, min: 1, max: 5 },
      ],
    })
    await Promise.resolve()
    await Promise.resolve()

    const enabled = document.getElementById('enabled') as HTMLInputElement | null
    const title = document.getElementById('title') as HTMLInputElement | null
    const notes = document.getElementById('notes') as HTMLTextAreaElement | null
    const limit = document.getElementById('limit') as HTMLInputElement | null
    if (enabled) enabled.checked = false
    if (title) title.value = 'Ready'
    if (notes) notes.value = 'Line two'
    if (limit) {
      limit.value = '9'
      limit.dispatchEvent(new Event('change'))
    }

    const applyButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.crafttalker-st-popup-button'))
      .find(button => button.textContent === 'Apply')
    applyButton?.click()

    await expect(resultPromise).resolves.toBe(1)
    const inputResults = Popup.util.lastResult.inputResults as Map<string, string | boolean>
    expect(inputResults).toBeInstanceOf(Map)
    expect(Object.fromEntries(inputResults)).toEqual({
      enabled: false,
      title: 'Ready',
      notes: 'Line two',
      limit: '5',
    })
  })

  it('matches ST input negative and cancelled completion semantics', async () => {
    const { POPUP_TYPE, Popup } = await importPopupShim()

    const negativePopup = new Popup('Name', POPUP_TYPE.INPUT, 'Alice')
    const negativePromise = negativePopup.show()
    await Promise.resolve()
    await Promise.resolve()
    await negativePopup.completeNegative()
    await expect(negativePromise).resolves.toBe(false)

    const cancelledPopup = new Popup('Name', POPUP_TYPE.INPUT, 'Alice')
    const cancelledPromise = cancelledPopup.show()
    await Promise.resolve()
    await Promise.resolve()
    await cancelledPopup.completeCancelled()
    await expect(cancelledPromise).resolves.toBeNull()
  })

  it('keeps popup DOM available during onClose and appends jQuery-like multi-element content', async () => {
    const { POPUP_TYPE, callGenericPopup } = await importPopupShim()
    const first = document.createElement('span')
    first.id = 'first-popup-content'
    first.textContent = 'One'
    const second = document.createElement('span')
    second.id = 'second-popup-content'
    second.textContent = 'Two'
    const content = { 0: first, 1: second, length: 2, jquery: 'test' }
    const onClose = vi.fn((popup: { root: HTMLElement; content: HTMLElement }) => {
      expect(document.body.contains(popup.root)).toBe(true)
      expect(popup.content.querySelector('#first-popup-content')?.textContent).toBe('One')
      expect(popup.content.querySelector('#second-popup-content')?.textContent).toBe('Two')
    })

    const resultPromise = callGenericPopup(content, POPUP_TYPE.TEXT, '', { onClose })
    await Promise.resolve()
    await Promise.resolve()
    const okButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.crafttalker-st-popup-button'))
      .find(button => button.textContent === 'OK')
    okButton?.click()

    await expect(resultPromise).resolves.toBe(1)
    expect(onClose).toHaveBeenCalledOnce()
    expect(document.getElementById('first-popup-content')).toBeNull()
    expect(document.getElementById('second-popup-content')).toBeNull()
  })

  it('auto-sizes ST plugin form popups that do not pass explicit popup options', async () => {
    const { POPUP_RESULT, POPUP_TYPE, callGenericPopup } = await importPopupShim()
    const editor = document.createElement('div')
    editor.id = 'xiaobai_template_editor'
    editor.innerHTML = [
      '<div class="xiaobai_template_editor">',
      '<h3 class="flex-container justifyCenter alignItemsBaseline"><strong>Template editor</strong></h3>',
      '<div class="flex-container flexFlowColumn">',
      '<label for="fixed_text_custom_regex"><small>Regex</small></label>',
      '<input id="fixed_text_custom_regex" class="text_pole textarea_compact" type="text">',
      '<label class="checkbox_label"><input id="disable_parsers" type="checkbox"><span>Disable parsers</span></label>',
      '<label for="fixed_text_template"><small>Template</small></label>',
      '<textarea id="fixed_text_template" class="text_pole textarea_compact" style="min-height: 20vh;"></textarea>',
      '</div>',
      '</div>',
    ].join('')

    const resultPromise = callGenericPopup(editor, POPUP_TYPE.CONFIRM, '', { okButton: 'Save', cancelButton: 'Cancel' })
    await Promise.resolve()
    await Promise.resolve()

    const dialog = document.querySelector<HTMLElement>('.crafttalker-st-popup-dialog')
    expect(dialog?.dataset.size).toBe('wider')
    expect(dialog?.dataset.leftAlign).toBe('true')
    expect(dialog?.dataset.formLayout).toBe('true')

    const saveButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.crafttalker-st-popup-button'))
      .find(button => button.textContent === 'Save')
    saveButton?.click()

    await expect(resultPromise).resolves.toBe(POPUP_RESULT.AFFIRMATIVE)
  })

  it('exposes shared ST persona state and avatar URL helpers for third-party plugins', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(['user.png', 'Alt Avatar.png']), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'X-Test': 'avatars' }),
        getContext: () => ({ this_chid: -1 }),
        event_types: { CHAT_CHANGED: 'chat_changed', APP_READY: 'app_ready' },
        eventSource: { on: vi.fn() },
      },
    }

    const personasShim = await importPersonasShim()
    const powerUserShim = await importPowerUserShim()
    const avatars = await personasShim.getUserAvatars(false)
    await personasShim.setUserAvatar('Alt Avatar.png')
    const scriptShim = await importScriptShim()

    expect(avatars).toEqual(['user.png', 'Alt Avatar.png'])
    expect(fetchMock).toHaveBeenCalledWith('/api/avatars/get', expect.objectContaining({
      method: 'POST',
      headers: { 'X-Test': 'avatars' },
    }))
    expect(personasShim.getUserAvatar('Alt Avatar.png')).toBe('/User%20Avatars/Alt%20Avatar.png')
    expect(scriptShim.user_avatar).toBe('Alt Avatar.png')
    expect(scriptShim.getThumbnailUrl('persona', 'Alt Avatar.png')).toBe('/User%20Avatars/Alt%20Avatar.png')
    expect(scriptShim.getThumbnailUrl('avatar', '/api/characters/Detail%20Bot/avatar')).toBe('/thumbnail?type=avatar&file=Detail%20Bot.png')
    expect(scriptShim.getThumbnailUrl('avatar', 'DetailBot.png')).toBe('/thumbnail?type=avatar&file=DetailBot.png')
    expect(scriptShim.default_user_avatar).toMatch(/^data:image\/png;base64,/)
    expect(powerUserShim.persona_description_positions).toMatchObject({
      IN_PROMPT: 0,
      AT_DEPTH: 4,
      NONE: 9,
    })
    expect(powerUserShim.power_user).toMatchObject({
      personas: {},
      persona_descriptions: {},
      persona_description_depth: 2,
      streaming_fps: 30,
    })
  })

  it('forwards ST character refresh helpers to the active compatibility host', async () => {
    const refreshedCharacter = { name: 'ImportBot', avatar: 'ImportBot.png', first_mes: 'Fresh hello' }
    const characters = [{ name: 'ImportBot', avatar: 'ImportBot.png' }]
    const getCharacters = vi.fn().mockResolvedValue(characters)
    const getOneCharacter = vi.fn().mockResolvedValue(refreshedCharacter)
    const unshallowCharacter = vi.fn().mockResolvedValue(refreshedCharacter)
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        getContext: () => ({ this_chid: 0 }),
        event_types: { CHAT_CHANGED: 'chat_changed', APP_READY: 'app_ready' },
        eventSource: { on: vi.fn() },
        characters,
        getCharacters,
        getOneCharacter,
        unshallowCharacter,
      },
    }

    const scriptShim = await importScriptShim()

    await expect(scriptShim.getCharacters()).resolves.toBe(characters)
    await expect(scriptShim.getOneCharacter('ImportBot.png')).resolves.toBe(refreshedCharacter)
    await expect(scriptShim.unshallowCharacter('0')).resolves.toBe(refreshedCharacter)
    expect(getCharacters).toHaveBeenCalled()
    expect(getOneCharacter).toHaveBeenCalledWith('ImportBot.png')
    expect(unshallowCharacter).toHaveBeenCalledWith('0')
  })

  it('falls back to local ST character lookup by index, avatar, and current id', async () => {
    const characters = [
      { name: 'Alpha', file_name: 'Alpha', avatar: 'Alpha.png' },
      { name: 'Beta', file_name: 'Beta', avatar: '/api/characters/Beta/avatar' },
    ]
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        getContext: () => ({ this_chid: 1 }),
        event_types: { CHAT_CHANGED: 'chat_changed', APP_READY: 'app_ready' },
        eventSource: { on: vi.fn() },
        characters,
      },
    }

    const scriptShim = await importScriptShim()

    expect(scriptShim.getOneCharacter(0)).toBe(characters[0])
    expect(scriptShim.getOneCharacter('Alpha.png')).toBe(characters[0])
    expect(scriptShim.getOneCharacter('/api/characters/Beta/avatar')).toBe(characters[1])
    expect(scriptShim.getOneCharacter('current')).toBe(characters[1])
    await expect(scriptShim.unshallowCharacter('Beta.png')).resolves.toBe(characters[1])
    await expect(scriptShim.getCharacters()).resolves.toBe(characters)
  })

  it('loads read-only ST-compatible past chat summaries for the active character', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        file_id: 'chat-a',
        file_name: 'Display Name',
        chat_items: 2,
        mes: 'Last line',
        last_mes: 1760000000000,
      },
    ]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'X-Test': 'chats' }),
        getContext: () => ({ this_chid: 0 }),
        event_types: { CHAT_CHANGED: 'chat_changed', APP_READY: 'app_ready' },
        eventSource: { on: vi.fn() },
        characters: [{ file_name: 'HistoryBot', name: 'HistoryBot', avatar: 'HistoryBot.png' }],
      },
    }

    const scriptShim = await importScriptShim()
    const chats = await scriptShim.getPastCharacterChats(0)

    expect(fetchMock).toHaveBeenCalledWith('/api/chats/HistoryBot', expect.objectContaining({
      method: 'GET',
      headers: { 'X-Test': 'chats' },
    }))
    expect(chats).toEqual([expect.objectContaining({
      file_name: 'chat-a.jsonl',
      display_name: 'Display Name',
      ch_name: 'HistoryBot',
      character_name: 'HistoryBot',
      avatar_url: 'HistoryBot.png',
    })])
  })

  it('applies basic ST regex scripts through the public regex engine shim', async () => {
    const diagnostics: Array<{ id: string; status: string; note: string }> = []
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        extension_settings: {
          regex: [
            { id: 'ai', findRegex: 'foo', replaceString: 'bar', placement: [2], promptOnly: true, markdownOnly: false, disabled: false, order: 2 },
            { id: 'display', findRegex: '/bar/g', replaceString: 'shown', placement: [2], promptOnly: false, markdownOnly: true, disabled: false, order: 3 },
            { id: 'disabled', findRegex: 'shown', replaceString: 'hidden', placement: [2], disabled: true, order: 4 },
          ],
        },
        characters: [],
        getContext: () => ({ this_chid: -1 }),
        recordCompatDiagnostic: (id, status, note) => diagnostics.push({ id, status, note }),
      },
    }

    const regexEngine = await importRegexEngineShim()

    expect(regexEngine.regex_placement.REASONING).toBe(6)
    expect(regexEngine.getRegexedString('foo', regexEngine.regex_placement.AI_OUTPUT, { isPrompt: true })).toBe('bar')
    expect(regexEngine.getRegexedString('foo', regexEngine.regex_placement.USER_INPUT, { isPrompt: true })).toBe('foo')
    expect(regexEngine.getRegexedString('bar', regexEngine.regex_placement.AI_OUTPUT, { isMarkdown: true })).toBe('shown')
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'getRegexedString', status: 'partial' }),
    ]))
  })

  it('forwards character extension field writes through the public extensions shim', async () => {
    const writeExtensionField = vi.fn().mockResolvedValue(true)
    const writeExtensionFieldBulk = vi.fn().mockResolvedValue(true)
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        extension_settings: {},
        extensionNames: [],
        extensionTypes: {},
        getContext: () => ({}),
        getExtensionManifest: () => null,
        ModuleWorkerWrapper: class {},
        renderExtensionTemplate: () => '',
        renderExtensionTemplateAsync: async () => '',
        saveMetadataDebounced: vi.fn(),
        writeExtensionField,
        writeExtensionFieldBulk,
      } as never,
    }

    const extensionsShim = await importExtensionsShim()

    await expect(extensionsShim.writeExtensionField(0, 'LittleWhiteBox', { enabled: true })).resolves.toBe(true)
    await expect(extensionsShim.writeExtensionFieldBulk(0, { regex_scripts: [] })).resolves.toBe(true)
    expect(writeExtensionField).toHaveBeenCalledWith(0, 'LittleWhiteBox', { enabled: true })
    expect(writeExtensionFieldBulk).toHaveBeenCalledWith(0, { regex_scripts: [] })
  })

  it('routes ChatCompletionService non-streaming requests through the ST backend bridge', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-Test': 'shim' }),
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Shim reply' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { ChatCompletionService } = await importCustomRequestShim()
    const result = await ChatCompletionService.sendRequest({
      chat_completion_source: 'openrouter',
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expect(result).toMatchObject({ content: 'Shim reply', reasoning: '' })
    expect(fetchMock).toHaveBeenCalledWith('/api/backends/chat-completions/generate', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-Test': 'shim' }),
      body: expect.stringContaining('"chat_completion_source":"openrouter"'),
    }))
  })

  it('exposes the current ST backend bridge URL for legacy callers', async () => {
    const { getGenerateUrl } = await importCustomRequestShim()

    expect(getGenerateUrl()).toBe('/api/backends/chat-completions/generate')
  })

  it('routes ChatCompletionService streaming requests through a ST-shaped async generator', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const { ChatCompletionService } = await importCustomRequestShim()
    const streamFactory = await ChatCompletionService.sendRequest({
      chat_completion_source: 'openai',
      model: 'local-model',
      stream: true,
      messages: [{ role: 'user', content: 'Hello' }],
    }, false)

    const states = []
    for await (const state of streamFactory()) {
      states.push(state)
    }

    expect(states.map(state => state.text)).toEqual(['Hel', 'Hello'])
    expect(fetchMock).toHaveBeenCalledWith('/api/backends/chat-completions/generate', expect.objectContaining({
      body: expect.stringContaining('"stream":true'),
    }))
  })

  it('exposes ST-shaped world info settings through public named exports', async () => {
    const worldInfo = { globalSelect: ['GlobalLore'], charLore: [], entries: {} }
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        world_names: ['GlobalLore'],
        selected_world_info: ['GlobalLore'],
        world_info: worldInfo,
        world_info_settings: {
          world_info_include_names: false,
          world_info_case_sensitive: true,
          world_info_match_whole_words: true,
          world_info_use_group_scoring: true,
          world_info_max_recursion_steps: 12,
          world_info_depth: 6,
          world_info_min_activations: 2,
          world_info_min_activations_depth_max: 3,
          world_info_budget: 35,
          world_info_budget_cap: 900,
          world_info_recursive: true,
          world_info_overflow_alert: true,
          world_info_character_strategy: 1,
        },
        loadWorldInfo: async () => null,
        updateWorldInfoList: async () => {},
      },
    }

    const worldInfoShim = await importWorldInfoShim()
    const settings = worldInfoShim.getWorldInfoSettings()

    expect(worldInfoShim.world_info_max_recursion_steps).toBe(12)
    expect(worldInfoShim.world_info_recursive).toBe(true)
    expect(settings).toMatchObject({
      world_info: worldInfo,
      world_info_include_names: false,
      world_info_case_sensitive: true,
      world_info_match_whole_words: true,
      world_info_use_group_scoring: true,
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
  })

  it('routes public world info prompt scans through the read-only ST endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      matchedEntries: [{ content: 'Dragon lore' }],
      worldInfoBefore: 'Dragon lore',
      worldInfoAfter: '',
      worldInfoExamples: [],
      worldInfoDepth: [],
      anBefore: [],
      anAfter: [],
      outletEntries: {},
      allActivatedEntries: [],
      overflowed: false,
      timedEffects: {},
      timedEffectsChanged: false,
      scanEvents: [],
      vectorizedSkipped: [],
      vectorizedActivated: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-Test': 'world-scan' }),
        world_names: ['GlobalLore'],
        selected_world_info: ['GlobalLore'],
        world_info: { globalSelect: ['GlobalLore'], charLore: [], entries: {} },
        world_info_settings: {},
        getContext: () => ({
          characterId: 0,
          chatId: 'chat-1',
          characters: [{ file_name: 'Alice', name: 'Alice' }],
        }),
        loadWorldInfo: async () => null,
        updateWorldInfoList: async () => {},
      },
    }

    const worldInfoShim = await importWorldInfoShim()
    const result = await worldInfoShim.getWorldInfoPrompt([{ name: 'You', mes: 'dragon' }], 8192, true, { trigger: 'normal' })
    const aliasResult = await worldInfoShim.checkWorldInfo([{ name: 'You', mes: 'dragon' }], 8192, true, { trigger: 'normal' })

    expect(result.worldInfoBefore).toBe('Dragon lore')
    expect(aliasResult.allActivatedEntries).toEqual([])
    expect(aliasResult.EMEntries).toEqual([])
    expect(aliasResult.WIDepthEntries).toEqual([])
    expect(fetchMock).toHaveBeenCalledWith('/api/worldinfo/check', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-Test': 'world-scan' }),
    }))
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(body).toMatchObject({
      maxContext: 8192,
      isDryRun: true,
      characterName: 'Alice',
      chatId: 'chat-1',
      globalScanData: { trigger: 'normal' },
      chat: [{ name: 'You', content: 'dragon' }],
    })
  })

  it('matches SillyTavern world info position enum values used by third-party sorters', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        world_names: [],
        selected_world_info: [],
        world_info: { globalSelect: [], charLore: [], entries: {} },
        world_info_settings: {},
        loadWorldInfo: async () => null,
        updateWorldInfoList: async () => {},
      },
    }

    const worldInfoShim = await importWorldInfoShim()

    expect(worldInfoShim.world_info_position).toEqual({
      before: 0,
      after: 1,
      ANTop: 2,
      ANBottom: 3,
      atDepth: 4,
      EMTop: 5,
      EMBottom: 6,
      outlet: 7,
    })
    expect(worldInfoShim.wi_anchor_position).toEqual({ before: 0, after: 1 })
  })

  it('routes public world info saves through the permissioned host bridge', async () => {
    const saveWorldInfo = vi.fn().mockResolvedValue(true)
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        world_names: ['GlobalLore'],
        selected_world_info: ['GlobalLore'],
        world_info: { globalSelect: ['GlobalLore'], charLore: [], entries: {} },
        world_info_settings: {},
        loadWorldInfo: async () => null,
        saveWorldInfo,
        updateWorldInfoList: async () => {},
      },
    }

    const worldInfoShim = await importWorldInfoShim()
    const data = { entries: { 1: { uid: 1, content: 'saved' } } }

    await expect(worldInfoShim.saveWorldInfo('GlobalLore', data, true)).resolves.toBe(true)
    expect(saveWorldInfo).toHaveBeenCalledWith('GlobalLore', data, true)
  })

  it('supports safe in-memory world info entry helpers used before saveWorldInfo', async () => {
    const diagnostics: Array<{ id: string; status: string; note: string }> = []
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        world_names: ['GlobalLore'],
        selected_world_info: ['GlobalLore'],
        world_info: { globalSelect: ['GlobalLore'], charLore: [], entries: {} },
        world_info_settings: {},
        loadWorldInfo: async () => null,
        updateWorldInfoList: async () => {},
        recordCompatDiagnostic: (id, status, note) => diagnostics.push({ id, status, note }),
      },
    }

    const worldInfoShim = await importWorldInfoShim()
    const data: { entries: Record<number, unknown> } = { entries: { 0: { uid: 0, content: 'old' } } }
    const entry = worldInfoShim.createWorldInfoEntry('GlobalLore', data)

    expect(entry).toMatchObject({ uid: 1, key: [], content: '', enabled: true })
    expect(data.entries[1]).toBe(entry)
    await expect(worldInfoShim.deleteWorldInfoEntry(data, 0, { silent: true })).resolves.toBe(true)
    expect(data.entries[0]).toBeUndefined()
    expect(worldInfoShim.getFreeWorldEntryUid(data)).toBe(0)
    expect(diagnostics.map(item => [item.id, item.status])).toEqual([
      ['createWorldInfoEntry', 'partial'],
      ['deleteWorldInfoEntry', 'partial'],
    ])
  })

  it('routes public world info creation through the permissioned host bridge', async () => {
    const createNewWorldInfo = vi.fn().mockResolvedValue(true)
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        world_names: [],
        selected_world_info: [],
        world_info: { globalSelect: [], charLore: [], entries: {} },
        world_info_settings: {},
        createNewWorldInfo,
        loadWorldInfo: async () => null,
        updateWorldInfoList: async () => {},
      },
    }

    const worldInfoShim = await importWorldInfoShim()

    await expect(worldInfoShim.createNewWorldInfo('NewLore', { interactive: false })).resolves.toBe(true)
    expect(createNewWorldInfo).toHaveBeenCalledWith('NewLore', { interactive: false })
  })

  it('blocks public world info write helpers without mutating local mirrors', async () => {
    const diagnostics: Array<{ id: string; status: string; note: string }> = []
    const entries: Record<string, unknown> = {}
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        world_names: ['GlobalLore'],
        selected_world_info: ['GlobalLore'],
        world_info: { globalSelect: ['GlobalLore'], charLore: [], entries },
        world_info_settings: {},
        loadWorldInfo: async () => null,
        updateWorldInfoList: async () => {},
        recordCompatDiagnostic: (id, status, note) => diagnostics.push({ id, status, note }),
      },
    }

    const worldInfoShim = await importWorldInfoShim()

    expect(await worldInfoShim.createNewWorldInfo('NewLore')).toBe(false)
    expect(worldInfoShim.createWorldInfoEntry('GlobalLore', { uid: 7, content: 'ghost' })).toBeUndefined()
    await expect(worldInfoShim.saveWorldInfo('GlobalLore')).resolves.toBe(false)
    await expect(worldInfoShim.deleteWorldInfoEntry('GlobalLore', 7)).resolves.toBe(false)
    await expect(worldInfoShim.deleteWorldInfo('GlobalLore')).resolves.toBe(false)
    await expect(worldInfoShim.charUpdatePrimaryWorld('CharacterLore')).resolves.toBe(false)

    expect(worldInfoShim.world_names).toEqual(['GlobalLore'])
    expect(entries).toEqual({})
    expect(diagnostics.map(item => [item.id, item.status])).toEqual([
      ['createNewWorldInfo', 'blocked'],
      ['createWorldInfoEntry', 'blocked'],
      ['saveWorldInfo', 'blocked'],
      ['deleteWorldInfoEntry', 'blocked'],
      ['deleteWorldInfo', 'blocked'],
      ['charUpdatePrimaryWorld', 'blocked'],
    ])
  })

  it('routes command-style world info selection changes through the host bridge', async () => {
    const diagnostics: Array<{ id: string; status: string; note: string }> = []
    const setWorldInfoSelection = vi.fn().mockResolvedValue(true)
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        world_names: ['GlobalLore', 'CharacterLore'],
        selected_world_info: ['GlobalLore'],
        world_info: { globalSelect: ['GlobalLore'], charLore: [], entries: {} },
        world_info_settings: {},
        loadWorldInfo: async () => null,
        updateWorldInfoList: async () => {},
        setWorldInfoSelection,
        recordCompatDiagnostic: (id, status, note) => diagnostics.push({ id, status, note }),
      },
    }

    const worldInfoShim = await importWorldInfoShim()

    await expect(worldInfoShim.onWorldInfoChange({ state: 'off', silent: true }, 'GlobalLore')).resolves.toBe('')
    await expect(worldInfoShim.onWorldInfoChange({ state: 'toggle' }, 'GlobalLore, CharacterLore')).resolves.toBe('')
    await expect(worldInfoShim.onWorldInfoChange({ silent: true }, '')).resolves.toBe('')
    await expect(worldInfoShim.onWorldInfoChange('__notSlashCommand__')).resolves.toBe('')
    expect(setWorldInfoSelection).toHaveBeenNthCalledWith(1, ['GlobalLore'], 'off')
    expect(setWorldInfoSelection).toHaveBeenNthCalledWith(2, ['GlobalLore', 'CharacterLore'], 'toggle')
    expect(setWorldInfoSelection).toHaveBeenNthCalledWith(3, [], 'off')
    expect(diagnostics.map(item => [item.id, item.status])).toEqual([
      ['onWorldInfoChange', 'blocked'],
    ])
  })

  it('keeps world info selection writes blocked when no host bridge is available', async () => {
    const diagnostics: Array<{ id: string; status: string; note: string }> = []
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        world_names: ['GlobalLore'],
        selected_world_info: ['GlobalLore'],
        world_info: { globalSelect: ['GlobalLore'], charLore: [], entries: {} },
        world_info_settings: {},
        loadWorldInfo: async () => null,
        updateWorldInfoList: async () => {},
        recordCompatDiagnostic: (id, status, note) => diagnostics.push({ id, status, note }),
      },
    }

    const worldInfoShim = await importWorldInfoShim()

    await expect(worldInfoShim.onWorldInfoChange({ state: 'off' }, 'GlobalLore')).resolves.toBe('')
    expect(worldInfoShim.selected_world_info).toEqual(['GlobalLore'])
    expect(diagnostics.map(item => [item.id, item.status])).toEqual([
      ['onWorldInfoChange', 'blocked'],
    ])
  })

  it('keeps callback-style world info change listeners inert and removable', async () => {
    const diagnostics: Array<{ id: string; status: string; note: string }> = []
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        world_names: [],
        selected_world_info: [],
        world_info: { globalSelect: [], charLore: [], entries: {} },
        world_info_settings: {},
        loadWorldInfo: async () => null,
        updateWorldInfoList: async () => {},
        recordCompatDiagnostic: (id, status, note) => diagnostics.push({ id, status, note }),
      },
    }

    const worldInfoShim = await importWorldInfoShim()
    const unsubscribe = worldInfoShim.onWorldInfoChange(() => {})

    expect(unsubscribe).toEqual(expect.any(Function))
    expect(unsubscribe()).toBeUndefined()
    expect(diagnostics).toEqual([])
  })

  it('derives ST-compatible character tag maps from the active host', async () => {
    testGlobal().CraftTalker = {
      stHost: {
        characters: [
          { id: 'alice-id', name: 'Alice', avatar: 'Alice.png', tags: ['hero', 'mage'] },
          { id: 'bob-id', name: 'Bob', file_name: 'Bob', data: { tags: ['villain'] } },
        ],
        getContext: () => ({}),
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
      },
    }

    const tagsShim = await importTagsShim()

    expect(tagsShim.getTagKeyForEntity(0)).toBe('Alice.png')
    expect(tagsShim.getTagKeyForEntity('bob-id')).toBe('Bob')
    expect(tagsShim.tag_map['Alice.png']).toEqual(['hero', 'mage'])
    expect(tagsShim.tag_map.Bob).toEqual(['villain'])
    expect(tagsShim.tags.map((tag: { id: string }) => tag.id)).toEqual(['hero', 'mage', 'villain'])
    expect(Object.keys(tagsShim.tags)).toEqual(['0', '1', '2'])
    expect([...tagsShim.tags].map((tag: { id: string }) => tag.id)).toEqual(['hero', 'mage', 'villain'])
    expect(JSON.parse(JSON.stringify(tagsShim.tags))).toEqual([
      { id: 'hero', name: 'hero', color: '', color2: '' },
      { id: 'mage', name: 'mage', color: '', color2: '' },
      { id: 'villain', name: 'villain', color: '', color2: '' },
    ])
    expect(JSON.parse(JSON.stringify(tagsShim.tag_map))).toEqual({
      'Alice.png': ['hero', 'mage'],
      Bob: ['villain'],
    })
  })

  it('exposes ST script helpers used by first-party iframe plugins', async () => {
    const emitted: Array<[string, unknown]> = []
    testGlobal().CraftTalker = {
      stHost: {
        characters: [
          { name: 'Alice', avatar: 'Alice.png', file_name: 'Alice', tags: [] },
        ],
        event_types: { CHARACTER_PAGE_LOADED: 'character_page_loaded' },
        eventSource: { on: () => undefined, emit: (type, payload) => emitted.push([String(type), payload]) },
        getContext: () => ({ example_separator: '<EXAMPLE>' }),
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        replaceVariableMacros: (value: unknown) => String(value).replace('<EXAMPLE>', '<EXAMPLE>'),
        updateContext: vi.fn(),
      },
    }

    const scriptShim = await importScriptShim()

    expect(scriptShim.depth_prompt_depth_default).toBe(4)
    expect(scriptShim.depth_prompt_role_default).toBe('system')
    expect(scriptShim.parseMesExamples('Alice: hello', true)).toEqual(['<START>\nAlice: hello\n'])
    await expect(scriptShim.select_selected_character(0)).resolves.toBe(true)
    expect(scriptShim.this_chid).toBe(0)
    expect(scriptShim.name2).toBe('Alice')
    expect(emitted[0]?.[0]).toBe('character_page_loaded')
  })
})

function testGlobal(): typeof globalThis & TestGlobal {
  return globalThis as typeof globalThis & TestGlobal
}
