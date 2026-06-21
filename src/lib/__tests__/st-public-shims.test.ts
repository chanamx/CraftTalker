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
      eventSource?: { on: (...args: unknown[]) => unknown }
      extension_settings?: Record<string, unknown>
      characters?: Array<Record<string, unknown>>
      getContext?: () => Record<string, unknown>
      loadWorldInfo?: (name: string) => Promise<unknown>
      updateWorldInfoList?: () => Promise<void>
      recordCompatDiagnostic?: (id: string, status: string, note: string) => void
      messageFormatting?: (...args: unknown[]) => string
      reloadMarkdownProcessor?: () => { makeHtml: (value: unknown) => string }
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

async function importRegexEngineShim() {
  // @ts-expect-error Public compatibility shims are served as plain browser JS.
  return await import('../../../public/scripts/compat/extensions/regex/engine.js')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
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

    expect(result.worldInfoBefore).toBe('Dragon lore')
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

    expect(await worldInfoShim.createNewWorldInfo('NewLore')).toBeNull()
    expect(worldInfoShim.createWorldInfoEntry('GlobalLore', { uid: 7, content: 'ghost' })).toBeNull()
    await expect(worldInfoShim.saveWorldInfo('GlobalLore')).resolves.toBe(false)
    await expect(worldInfoShim.deleteWorldInfoEntry('GlobalLore', 7)).resolves.toBe(false)
    await expect(worldInfoShim.deleteWorldInfo('GlobalLore')).resolves.toBe(false)

    expect(worldInfoShim.world_names).toEqual(['GlobalLore'])
    expect(entries).toEqual({})
    expect(diagnostics.map(item => [item.id, item.status])).toEqual([
      ['createNewWorldInfo', 'blocked'],
      ['createWorldInfoEntry', 'blocked'],
      ['saveWorldInfo', 'blocked'],
      ['deleteWorldInfoEntry', 'blocked'],
      ['deleteWorldInfo', 'blocked'],
    ])
  })

  it('blocks command-style world info selection changes without mutating active worlds', async () => {
    const diagnostics: Array<{ id: string; status: string; note: string }> = []
    testGlobal().CraftTalker = {
      stHost: {
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        world_names: ['GlobalLore', 'CharacterLore'],
        selected_world_info: ['GlobalLore'],
        world_info: { globalSelect: ['GlobalLore'], charLore: [], entries: {} },
        world_info_settings: {},
        loadWorldInfo: async () => null,
        updateWorldInfoList: async () => {},
        recordCompatDiagnostic: (id, status, note) => diagnostics.push({ id, status, note }),
      },
    }

    const worldInfoShim = await importWorldInfoShim()

    expect(worldInfoShim.onWorldInfoChange({ state: 'off', silent: true }, 'GlobalLore')).toBe('')
    expect(worldInfoShim.onWorldInfoChange('__notSlashCommand__')).toBe('')
    expect(worldInfoShim.selected_world_info).toEqual(['GlobalLore'])
    expect(diagnostics.map(item => [item.id, item.status])).toEqual([
      ['onWorldInfoChange', 'blocked'],
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
})

function testGlobal(): typeof globalThis & TestGlobal {
  return globalThis as typeof globalThis & TestGlobal
}
