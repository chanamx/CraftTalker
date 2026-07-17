import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WORLD_INFO_INSERTION_STRATEGY,
  WORLD_INFO_LOGIC,
  WORLD_INFO_POSITION,
  checkWorldInfo,
  checkWorldInfoSync,
  getSortedWorldInfoEntries,
  type WorldInfoEntriesLoadedHookInput,
  type WorldInfoPromptContentTransformEntry,
  type WorldInfoScanHookInput,
  type WorldInfoVectorActivationInput,
} from '../lib/world-info-compat.js'
import { normalizeWorldEntry, type WorldBookEntry } from '../services/world.service.js'

function makeEntry(overrides: Partial<WorldBookEntry> = {}): WorldBookEntry {
  return {
    uid: 1,
    key: [],
    keysecondary: [],
    comment: '',
    content: '',
    constant: false,
    selective: false,
    insertion_order: 0,
    enabled: true,
    position: 0,
    depth: 4,
    order: 0,
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
    display_index: 0,
    ...overrides,
  }
}

function scan(entries: Record<string, WorldBookEntry>, chat: string[], settings = {}) {
  return checkWorldInfoSync({
    sources: [{ name: 'test-world', type: 'character', entries }],
    chat,
    settings: { depth: 4, budgetTokens: Number.MAX_SAFE_INTEGER, ...settings },
  })
}

function scanAsync(entries: Record<string, WorldBookEntry>, chat: string[], settings = {}) {
  return checkWorldInfo({
    sources: [{ name: 'test-world', type: 'character', entries }],
    chat,
    settings: { depth: 4, budgetTokens: Number.MAX_SAFE_INTEGER, ...settings },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('world-info compatibility scanning', () => {
  it('sorts sources with ST-style character/global strategy', () => {
    const chatEntry = makeEntry({ uid: 0, order: 1, content: 'chat' })
    const personaEntry = makeEntry({ uid: 3, order: 1, content: 'persona' })
    const characterEntry = makeEntry({ uid: 1, order: 10, content: 'character' })
    const globalEntry = makeEntry({ uid: 2, order: 100, content: 'global' })

    const sorted = getSortedWorldInfoEntries([
      { name: 'chat', type: 'chat', entries: { '0': chatEntry } },
      { name: 'persona', type: 'persona', entries: { '3': personaEntry } },
      { name: 'global', type: 'global', entries: { '2': globalEntry } },
      { name: 'character', type: 'character', entries: { '1': characterEntry } },
    ], { characterStrategy: WORLD_INFO_INSERTION_STRATEGY.character_first })

    expect(sorted.map(entry => entry.content)).toEqual(['chat', 'persona', 'character', 'global'])
  })

  it('does not activate empty non-constant entries but activates constants', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: [], content: 'empty key' }),
      '2': makeEntry({ uid: 2, key: [], content: 'constant', constant: true }),
    }, ['anything'])

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['constant'])
  })

  it('activates empty-content automation entries without injecting prompt content', () => {
    const result = scan({
      '1': makeEntry({
        uid: 1,
        key: ['dragon'],
        content: '',
        automation_id: 'open-gate',
      }),
    }, ['dragon'])

    expect(result.allActivatedEntries).toEqual([
      expect.objectContaining({
        world: 'test-world',
        uid: 1,
        content: '',
        automationId: 'open-gate',
      }),
    ])
    expect(result.matchedEntries).toEqual([])
    expect(result.worldInfoString).toBe('')
    expect(result.worldInfoDepth).toEqual([])
    expect(result.outletEntries).toEqual({})
  })

  it('applies async prompt content transforms after activation without mutating event entries', async () => {
    const result = await scanAsync({
      '1': makeEntry({ uid: 1, key: ['gate'], content: 'sealed gate' }),
    }, ['gate'], {
      promptContentTransformer: async (entries: WorldInfoPromptContentTransformEntry[]) => Object.fromEntries(
        entries.map(entry => [entry.id, entry.content.replace('sealed', 'opened')]),
      ),
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['opened gate'])
    expect(result.worldInfoBefore).toBe('opened gate')
    expect(result.allActivatedEntries).toEqual([
      expect.objectContaining({ content: 'sealed gate' }),
    ])
    expect(result.scanEvents.at(-1)?.newSuccessfulEntries).toEqual([
      expect.objectContaining({ content: 'sealed gate' }),
    ])
  })

  it('supports ST selective logic variants', () => {
    const base = {
      key: ['magic'],
      keysecondary: ['fire', 'ice'],
      selective: true,
    }

    expect(scan({ '1': makeEntry({ uid: 1, ...base, selectiveLogic: WORLD_INFO_LOGIC.AND_ANY, content: 'and any' }) }, ['magic fire']).matchedEntries).toHaveLength(1)
    expect(scan({ '1': makeEntry({ uid: 1, ...base, selectiveLogic: WORLD_INFO_LOGIC.AND_ALL, content: 'and all' }) }, ['magic fire']).matchedEntries).toHaveLength(0)
    expect(scan({ '1': makeEntry({ uid: 1, ...base, selectiveLogic: WORLD_INFO_LOGIC.AND_ALL, content: 'and all' }) }, ['magic fire ice']).matchedEntries).toHaveLength(1)
    expect(scan({ '1': makeEntry({ uid: 1, ...base, selectiveLogic: WORLD_INFO_LOGIC.NOT_ANY, content: 'not any' }) }, ['magic wind']).matchedEntries).toHaveLength(1)
    expect(scan({ '1': makeEntry({ uid: 1, ...base, selectiveLogic: WORLD_INFO_LOGIC.NOT_ANY, content: 'not any' }) }, ['magic fire']).matchedEntries).toHaveLength(0)
    expect(scan({ '1': makeEntry({ uid: 1, ...base, selectiveLogic: WORLD_INFO_LOGIC.NOT_ALL, content: 'not all' }) }, ['magic fire']).matchedEntries).toHaveLength(1)
    expect(scan({ '1': makeEntry({ uid: 1, ...base, selectiveLogic: WORLD_INFO_LOGIC.NOT_ALL, content: 'not all' }) }, ['magic fire ice']).matchedEntries).toHaveLength(0)
  })

  it('supports slash regex keys and whole-word matching', () => {
    const regexResult = scan({
      '1': makeEntry({ uid: 1, key: ['/drag(on|ons)/i'], content: 'regex' }),
    }, ['DRAGONS arrive'])
    expect(regexResult.matchedEntries).toHaveLength(1)

    const wholeWordMiss = scan({
      '1': makeEntry({ uid: 1, key: ['cat'], content: 'whole word', match_whole_words: true }),
    }, ['cathedral'])
    expect(wholeWordMiss.matchedEntries).toHaveLength(0)

    const wholeWordHit = scan({
      '1': makeEntry({ uid: 1, key: ['cat'], content: 'whole word', match_whole_words: true }),
    }, ['the cat, waits'])
    expect(wholeWordHit.matchedEntries).toHaveLength(1)
  })

  it('keeps ST scan segment boundaries so regex keys do not span adjacent chat messages', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['/hello\\s+world/'], content: 'cross-message regex hit' }),
    }, ['hello', 'world'], { depth: 2 })

    expect(result.matchedEntries).toHaveLength(0)
  })

  it('does not let one entry scanDepth raise the default depth for other entries', () => {
    const result = checkWorldInfoSync({
      sources: [{ name: 'test-world', type: 'character', entries: {
        '1': makeEntry({ uid: 1, key: ['fifth message'], content: 'ordinary depth hit', insertion_order: 1 }),
        '2': makeEntry({ uid: 2, key: ['fifth message'], content: 'deep scan depth hit', insertion_order: 2, scan_depth: 8 }),
      } }],
      chat: ['first', 'second', 'third', 'fourth', 'fifth message'],
      settings: { budgetTokens: Number.MAX_SAFE_INTEGER },
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['deep scan depth hit'])
  })

  it('recursively scans activated entry content', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'ancient rune' }),
      '2': makeEntry({ uid: 2, key: ['rune'], content: 'recursive hit' }),
    }, ['a dragon appears'], { recursive: true, maxRecursionSteps: 2 })

    expect(result.matchedEntries.map(entry => entry.content)).toContain('ancient rune')
    expect(result.matchedEntries.map(entry => entry.content)).toContain('recursive hit')
  })

  it('resolves ST macros while scanning keys and recursive content', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['{{user}}'], content: '{{char}} sigil', insertion_order: 1 }),
      '2': makeEntry({ uid: 2, key: ['Luna sigil'], content: 'macro recursive hit', insertion_order: 2 }),
    }, ['Alice arrives'], {
      recursive: true,
      maxRecursionSteps: 2,
      macroResolver: (text: string) => text
        .replaceAll('{{user}}', 'Alice')
        .replaceAll('{{char}}', 'Luna'),
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['Luna sigil', 'macro recursive hit'])
  })

  it('keeps recursive buffer text in ST activation order across multiple recursion loops', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['alpha'], content: 'first lore', insertion_order: 1 }),
      '2': makeEntry({ uid: 2, key: ['first lore'], content: 'second lore', insertion_order: 2 }),
      '3': makeEntry({
        uid: 3,
        key: ['/first lore[\\s\\S]*second lore/'],
        content: 'ordered recursive hit',
        insertion_order: 3,
        prevent_recursion: true,
      }),
    }, ['alpha'], {
      recursive: true,
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual([
      'first lore',
      'second lore',
      'ordered recursive hit',
    ])
    expect(result.scanEvents.map(event => event.currentState)).toEqual(['initial', 'recursion', 'recursion'])
  })

  it('does not activate later recursive entries from an inclusion group already used by ST', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['alpha'], content: 'beta clue', group: 'guild', insertion_order: 1 }),
      '2': makeEntry({ uid: 2, key: ['beta clue'], content: 'same group recursive hit', group: 'guild', insertion_order: 2 }),
    }, ['alpha'], {
      recursive: true,
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['beta clue'])
  })

  it('uses ST exact group-string checks for previously activated inclusion groups', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['alpha'], content: 'beta clue', group: 'guild, party', insertion_order: 1 }),
      '2': makeEntry({ uid: 2, key: ['beta clue'], content: 'single group recursive hit', group: 'guild', insertion_order: 2 }),
    }, ['alpha'], {
      recursive: true,
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['beta clue', 'single group recursive hit'])
  })

  it('runs recursion after min-activation depth expansion when recurse context exists', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['alpha'], content: 'rune', insertion_order: 1 }),
      '2': makeEntry({
        uid: 2,
        key: ['rune'],
        keysecondary: ['beta'],
        content: 'combined recursive hit',
        insertion_order: 2,
        selective: true,
        selectiveLogic: WORLD_INFO_LOGIC.AND_ANY,
      }),
    }, ['alpha', 'beta'], {
      depth: 1,
      minActivations: 2,
      recursive: true,
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['rune', 'combined recursive hit'])
  })

  it('keeps ST-style final min-activation scan at the chat depth boundary', () => {
    const hook = vi.fn()
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['alpha'], content: 'first hit', insertion_order: 1 }),
    }, ['alpha'], {
      depth: 1,
      minActivations: 2,
      scanDoneHooks: [hook],
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['first hit'])
    expect(hook).toHaveBeenCalledTimes(2)
    expect(result.scanEvents.map(event => event.currentState)).toEqual(['initial', 'min_activations'])
    expect(result.scanEvents.map(event => event.nextState)).toEqual(['min_activations', null])
  })

  it('treats max recursion steps and min activations as ST-mutually-exclusive settings', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['alpha'], content: 'first hit', insertion_order: 1, scan_depth: 1 }),
      '2': makeEntry({ uid: 2, key: ['beta'], content: 'depth-expanded hit', insertion_order: 2, scan_depth: 1 }),
    }, ['alpha', 'beta'], {
      depth: 1,
      minActivations: 2,
      minActivationsDepthMax: 2,
      maxRecursionSteps: 3,
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['first hit'])
    expect(result.scanEvents).toHaveLength(1)
    expect(result.scanEvents[0]).toMatchObject({
      currentState: 'initial',
      nextState: null,
    })
  })

  it('scans ST-style message names by default and can disable name prefixes', () => {
    const entries = {
      '1': makeEntry({ uid: 1, key: ['Alice:'], content: 'speaker lore' }),
    }

    const defaultResult = checkWorldInfoSync({
      sources: [{ name: 'test-world', type: 'character', entries }],
      chat: ['hello there'],
      chatMessages: [{ name: 'Alice', content: 'hello there' }],
      settings: { depth: 4, budgetTokens: Number.MAX_SAFE_INTEGER },
    })
    expect(defaultResult.matchedEntries.map(entry => entry.content)).toEqual(['speaker lore'])

    const disabledResult = checkWorldInfoSync({
      sources: [{ name: 'test-world', type: 'character', entries }],
      chat: ['hello there'],
      chatMessages: [{ name: 'Alice', content: 'hello there' }],
      settings: { depth: 4, budgetTokens: Number.MAX_SAFE_INTEGER, includeNames: false },
    })
    expect(disabledResult.matchedEntries).toHaveLength(0)
  })

  it('scans extension prompt text marked for world-info scanning', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['hidden archive'], content: 'extension prompt lore' }),
    }, ['plain chat'], {
      scanInjects: ['The hidden archive is open.'],
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['extension prompt lore'])
  })

  it('scans ST global character fields when entry opts in', () => {
    const result = scan({
      '1': makeEntry({
        uid: 1,
        key: ['royal archive'],
        content: 'description hit',
        insertion_order: 1,
        extensions: { match_character_description: true },
      }),
      '2': makeEntry({
        uid: 2,
        key: ['moonlit harbor'],
        content: 'scenario hit',
        insertion_order: 2,
        extensions: { match_scenario: true },
      }),
      '3': makeEntry({
        uid: 3,
        key: ['private note'],
        content: 'creator hit',
        insertion_order: 3,
        extensions: { match_creator_notes: true },
      }),
      '4': makeEntry({
        uid: 4,
        key: ['silver mask'],
        content: 'persona hit',
        insertion_order: 4,
        extensions: { match_persona_description: true },
      }),
    }, ['plain chat'], {
      globalScanData: {
        personaDescription: 'The persona carries a silver mask.',
        characterDescription: 'Keeper of the royal archive.',
        scenario: 'They meet at the moonlit harbor.',
        creatorNotes: 'private note',
      },
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual([
      'description hit',
      'scenario hit',
      'creator hit',
      'persona hit',
    ])
  })

  it('supports ST activation decorators', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['missing'], content: '@@activate\nforced' }),
      '2': makeEntry({ uid: 2, key: ['dragon'], content: '@@dont_activate\nblocked' }),
    }, ['dragon'])

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['forced'])
  })

  it('matches ST decorator precedence when activate and dont-activate are both present', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['missing'], content: '@@activate\n@@dont_activate\nforced anyway' }),
    }, ['plain chat'])

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['forced anyway'])
  })

  it('supports ST external force activations for vectorized entries', () => {
    const entries = {
      '0': makeEntry({ uid: 0, key: ['missing'], content: 'vector lore', vectorized: true }),
    }

    const unforced = scan(entries, ['plain chat'])
    expect(unforced.matchedEntries).toHaveLength(0)
    expect(unforced.vectorizedSkipped).toHaveLength(0)

    const forced = scan(entries, ['plain chat'], {
      forceActivations: [{ world: 'test-world', uid: 0 }],
    })
    expect(forced.matchedEntries.map(entry => entry.content)).toEqual(['vector lore'])
    expect(forced.vectorizedSkipped).toHaveLength(0)
  })

  it('keeps ST keyword scanning active for vectorized entries without a vector hit', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'keyword vector lore', vectorized: true }),
    }, ['a dragon appears'])

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['keyword vector lore'])
    expect(result.vectorizedSkipped).toHaveLength(0)
  })

  it('activates vectorized entries from static vector activations', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['missing'], content: 'vector lore', vectorized: true }),
    }, ['plain chat'], {
      vectorActivations: [{ world: 'test-world', uid: 1, source: 'test-vector-store', score: 0.82 }],
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['vector lore'])
    expect(result.vectorizedSkipped).toHaveLength(0)
    expect(result.vectorizedActivated).toEqual([
      expect.objectContaining({
        type: 'vectorized_activated',
        entryId: 'test-world.1',
        source: 'test-vector-store',
        score: 0.82,
      }),
    ])
  })

  it('lets async vector activators feed ST-style external activations', async () => {
    const vectorActivator = vi.fn(async (input: WorldInfoVectorActivationInput) => {
      expect(input.vectorizedEntries.map(entry => entry.uid)).toEqual([2])
      expect(input.chat).toEqual(['plain chat'])
      expect(input.scanText).toContain('plain chat')
      expect(input.trigger).toBe('continue')
      expect(input.isDryRun).toBe(true)
      return [{
        world: 'test-world',
        uid: 2,
        content: 'retrieved vector lore',
        source: 'async-vector',
        score: 0.91,
      }]
    })

    const result = await scanAsync({
      '2': makeEntry({ uid: 2, key: ['missing'], content: 'stored vector lore', vectorized: true }),
    }, ['plain chat'], {
      trigger: 'continue',
      dryRun: true,
      vectorActivator,
    })

    expect(vectorActivator).toHaveBeenCalledTimes(1)
    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['retrieved vector lore'])
    expect(result.vectorizedActivated).toEqual([
      expect.objectContaining({
        entryId: 'test-world.2',
        source: 'async-vector',
        score: 0.91,
      }),
    ])
  })

  it('reports the vector activation metadata that supplied the final entry override', async () => {
    const result = await scanAsync({
      '4': makeEntry({ uid: 4, key: ['missing'], content: 'stored vector lore', vectorized: true }),
    }, ['plain chat'], {
      vectorActivations: [{
        world: 'test-world',
        uid: 4,
        content: 'metadata vector lore',
        source: 'chat-metadata',
        score: 0.4,
      }],
      vectorActivator: async () => [{
        world: 'test-world',
        uid: 4,
        content: 'runtime vector lore',
        source: 'runtime-vector-store',
        score: 0.93,
      }],
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['runtime vector lore'])
    expect(result.vectorizedActivated).toEqual([
      expect.objectContaining({
        entryId: 'test-world.4',
        source: 'runtime-vector-store',
        score: 0.93,
      }),
    ])
  })

  it('requires synchronous vector activators in checkWorldInfoSync', () => {
    expect(() => scan({
      '3': makeEntry({ uid: 3, key: ['missing'], content: 'vector lore', vectorized: true }),
    }, ['plain chat'], {
      vectorActivator: async () => [{ world: 'test-world', uid: 3 }],
    })).toThrow('checkWorldInfoSync requires a synchronous vectorActivator')
  })

  it('filters by generation trigger and character filter', () => {
    const entries = {
      '1': makeEntry({
        uid: 1,
        key: ['dragon'],
        content: 'triggered',
        insertion_order: 1,
        extensions: { triggers: ['continue'] },
      }),
      '2': makeEntry({
        uid: 2,
        key: ['dragon'],
        content: 'character matched',
        insertion_order: 2,
        characterFilter: { names: ['Alice'], tags: [], isExclude: false },
      }),
      '3': makeEntry({
        uid: 3,
        key: ['dragon'],
        content: 'tag excluded',
        insertion_order: 3,
        character_filter: { names: [], tags: ['villain'], isExclude: true },
      }),
    }

    const normal = scan(entries, ['dragon'], {
      trigger: 'normal',
      characterName: 'Alice',
      characterTags: ['villain'],
    })
    expect(normal.matchedEntries.map(entry => entry.content)).toEqual(['character matched'])

    const continued = scan(entries, ['dragon'], {
      trigger: 'continue',
      characterName: 'Alice',
      characterTags: [],
    })
    expect(continued.matchedEntries.map(entry => entry.content)).toEqual(['triggered', 'character matched', 'tag excluded'])
  })

  it('requires ST character filter names and tags to pass as separate include checks', () => {
    const entries = {
      '1': makeEntry({
        uid: 1,
        key: ['dragon'],
        content: 'name and tag matched',
        characterFilter: { names: ['Alice'], tags: ['hero'], isExclude: false },
      }),
    }

    expect(scan(entries, ['dragon'], {
      characterName: 'Alice',
      characterTags: ['villain'],
    }).matchedEntries).toHaveLength(0)

    expect(scan(entries, ['dragon'], {
      characterName: 'Bob',
      characterTags: ['hero'],
    }).matchedEntries).toHaveLength(0)

    expect(scan(entries, ['dragon'], {
      characterName: 'Alice',
      characterTags: ['hero'],
    }).matchedEntries.map(entry => entry.content)).toEqual(['name and tag matched'])
  })

  it('matches character filter tags against resolved tag ids and display names', () => {
    const entries = {
      '1': makeEntry({
        uid: 1,
        key: ['dragon'],
        content: 'tag display name matched',
        characterFilter: { names: [], tags: ['Hero'], isExclude: false },
      }),
      '2': makeEntry({
        uid: 2,
        key: ['dragon'],
        content: 'tag display name excluded',
        characterFilter: { names: [], tags: ['Hero'], isExclude: true },
      }),
    }

    const result = scan(entries, ['dragon'], {
      characterTags: ['tag-hero'],
      characterTagNames: ['Hero'],
    } as any)

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['tag display name matched'])
  })

  it('honors token budget unless an entry ignores budget', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['a'], content: 'small', order: 20 }),
      '2': makeEntry({ uid: 2, key: ['a'], content: 'this content is too large for the tiny test budget', order: 10 }),
      '3': makeEntry({ uid: 3, key: ['a'], content: 'forced', order: 5, ignoreBudget: true }),
    }, ['a'], { budgetTokens: 3 })

    const contents = result.matchedEntries.map(entry => entry.content)
    expect(result.overflowed).toBe(true)
    expect(contents).toHaveLength(2)
    expect(contents).toContain('small')
    expect(contents).toContain('forced')
  })

  it('supports ST-style budget percent and cap semantics', () => {
    const hook = vi.fn()

    const percentResult = checkWorldInfoSync({
      sources: [{
        name: 'test-world',
        type: 'character',
        entries: {
          '1': makeEntry({ uid: 1, key: ['a'], content: 'one two', order: 20 }),
          '2': makeEntry({ uid: 2, key: ['a'], content: 'three four', order: 10 }),
        },
      }],
      chat: ['a'],
      maxContext: 8,
      settings: {
        depth: 4,
        budgetPercent: 50,
        tokenCounter: (text: string) => text.trim().split(/\s+/).filter(Boolean).length,
        scanDoneHooks: [hook],
      },
    })

    expect(percentResult.overflowed).toBe(true)
    expect(percentResult.matchedEntries.map(entry => entry.content)).toEqual(['one two'])
    expect(hook.mock.calls[0][0].budgetRemaining).toBe(2)

    const cappedResult = checkWorldInfoSync({
      sources: [{
        name: 'test-world',
        type: 'character',
        entries: {
          '1': makeEntry({ uid: 1, key: ['a'], content: 'one two three four', order: 20 }),
          '2': makeEntry({ uid: 2, key: ['a'], content: 'five six', order: 10 }),
        },
      }],
      chat: ['a'],
      maxContext: 100,
      settings: {
        depth: 4,
        budgetPercent: 100,
        budgetCap: 5,
        tokenCounter: (text: string) => text.trim().split(/\s+/).filter(Boolean).length,
      },
    })

    expect(cappedResult.overflowed).toBe(true)
    expect(cappedResult.matchedEntries.map(entry => entry.content)).toEqual(['one two three four'])
  })

  it('uses injected async token counters for ST-style budget checks', async () => {
    const tokenCounter = vi.fn(async (text: string) => text.trim().split(/\s+/).filter(Boolean).length)
    const result = await scanAsync({
      '1': makeEntry({ uid: 1, key: ['a'], content: 'one two', order: 20 }),
      '2': makeEntry({ uid: 2, key: ['a'], content: 'three four', order: 10 }),
    }, ['a'], {
      budgetTokens: 4,
      tokenCounter,
    })

    expect(tokenCounter).toHaveBeenCalled()
    expect(result.overflowed).toBe(true)
    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['one two'])
  })

  it('passes the scan signal to async token counters and aborts before producing a result', async () => {
    const controller = new AbortController()
    let notifyCounterStarted!: () => void
    const counterStarted = new Promise<void>(resolve => { notifyCounterStarted = resolve })
    const tokenCounter = vi.fn((_text: string, signal?: AbortSignal) => {
      notifyCounterStarted()
      if (!signal) return Promise.resolve(1)
      return new Promise<number>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('scan canceled')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      })
    })
    const scanPromise = scanAsync({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'cancelable lore' }),
    }, ['dragon'], {
      signal: controller.signal,
      tokenCounter,
    })

    await counterStarted
    controller.abort('request disconnected')
    await expect(scanPromise).rejects.toMatchObject({ name: 'AbortError' })
    expect(tokenCounter).toHaveBeenCalled()
  })

  it('checks cancellation after the final synchronous scan effect', () => {
    const controller = new AbortController()

    expect(() => scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'cancelable lore' }),
    }, ['dragon'], {
      signal: controller.signal,
      promptContentTransformer: (entries: WorldInfoPromptContentTransformEntry[]) => {
        controller.abort('request disconnected')
        return Object.fromEntries(entries.map(entry => [entry.id, entry.content]))
      },
    })).toThrow(expect.objectContaining({ name: 'AbortError' }))
  })

  it('uses keyword-matched vectorized content in recursive scans without a vector runtime', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'normal lore', insertion_order: 1 }),
      '2': makeEntry({ uid: 2, key: ['dragon'], content: 'vector clue', insertion_order: 2, extensions: { vectorized: true } }),
      '3': makeEntry({ uid: 3, key: ['vector clue'], content: 'recursive vector lore', insertion_order: 3 }),
    }, ['dragon'], { recursive: true, maxRecursionSteps: 3 })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual([
      'normal lore',
      'vector clue',
      'recursive vector lore',
    ])
    expect(result.vectorizedSkipped).toHaveLength(0)
  })

  it('lets scan-done hooks inspect and patch the next scan state', async () => {
    const hook = vi.fn().mockResolvedValue({ nextState: null })
    const result = await scanAsync({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'ancient rune' }),
      '2': makeEntry({ uid: 2, key: ['rune'], content: 'recursive hit' }),
    }, ['a dragon appears'], {
      recursive: true,
      maxRecursionSteps: 3,
      scanDoneHooks: [hook],
    })

    expect(hook).toHaveBeenCalledTimes(1)
    expect(hook.mock.calls[0][0]).toMatchObject({
      loopCount: 1,
      currentState: 'initial',
      nextState: 'recursion',
      overflowed: false,
    })
    expect(result.scanEvents).toContainEqual(expect.objectContaining({
      type: 'scan_done',
      nextState: null,
      activatedCount: 1,
    }))
    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['ancient rune'])
  })

  it('passes ST-shaped scan-done hook metadata', () => {
    const snapshots: Array<{
      newAll: string[]
      newSuccessful: string[]
      activatedKeys: string[]
      activatedText: string
      sortedUids: number[]
      firstSuccessfulStickyActive: boolean
    }> = []
    const hook = vi.fn((input: WorldInfoScanHookInput) => {
      snapshots.push({
        newAll: input.new.all.map(entry => entry.content),
        newSuccessful: input.new.successful.map(entry => entry.content),
        activatedKeys: [...input.activated.entries.keys()],
        activatedText: input.activated.text,
        sortedUids: input.sortedEntries.map(entry => entry.uid),
        firstSuccessfulStickyActive: input.timedEffects.isEffectActive('sticky', input.new.successful[0]),
      })
    })
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'first rune', insertion_order: 1, sticky: 2 }),
      '2': makeEntry({ uid: 2, key: ['rune'], content: 'delayed rune', insertion_order: 2, delay_until_recursion: 2, prevent_recursion: true }),
    }, ['dragon'], {
      recursive: true,
      trigger: 'continue',
      dryRun: true,
      scanDoneHooks: [hook],
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['first rune', 'delayed rune'])
    expect(hook).toHaveBeenCalledTimes(2)
    expect(hook.mock.calls[0][0]).toMatchObject({
      loopCount: 1,
      currentState: 'initial',
      nextState: 'recursion',
      trigger: 'continue',
      isDryRun: true,
      isFinal: false,
      state: {
        current: 'initial',
        next: 'recursion',
        loopCount: 1,
      },
      budget: {
        current: Number.MAX_SAFE_INTEGER,
        overflowed: false,
      },
      recursionDelay: {
        currentLevel: 2,
        availableLevels: [],
      },
    })
    expect(snapshots[0]).toMatchObject({
      newAll: ['first rune'],
      newSuccessful: ['first rune'],
      activatedKeys: ['test-world.1'],
      activatedText: 'first rune\n',
      sortedUids: [1, 2],
      firstSuccessfulStickyActive: false,
    })
    expect(result.scanEvents[0]).toMatchObject({
      type: 'scan_done',
      newAllEntries: [expect.objectContaining({ uid: 1, content: 'first rune' })],
      newSuccessfulEntries: [expect.objectContaining({ uid: 1, content: 'first rune' })],
      activatedEntries: [expect.objectContaining({ uid: 1, content: 'first rune' })],
      activatedText: 'first rune\n',
    })
    expect(result.scanEvents[1]).toMatchObject({
      activatedEntries: [
        expect.objectContaining({ uid: 1, content: 'first rune' }),
        expect.objectContaining({ uid: 2, content: 'delayed rune' }),
      ],
      activatedText: 'first rune\n',
    })
    expect(result.scanEvents[0]?.newAllEntries?.[0]).not.toHaveProperty('raw')
    expect(result.sortedEntries.map(entry => entry.uid)).toEqual([1, 2])
    expect(result.sortedEntries[0]).not.toHaveProperty('raw')
    expect(result.sourceEntries.characterLore.map(entry => entry.uid)).toEqual([1, 2])
    expect(result.sourceEntries.characterLore[0]).not.toHaveProperty('raw')
    expect(result.allActivatedEntries[0]).not.toHaveProperty('raw')
  })

  it('returns ST-shaped source entry groups for entries-loaded event mirrors', () => {
    const result = checkWorldInfoSync({
      sources: [
        { name: 'global-world', type: 'global', entries: { '1': makeEntry({ uid: 1, key: ['g'], content: 'global lore' }) } },
        { name: 'character-world', type: 'character', entries: { '2': makeEntry({ uid: 2, key: ['c'], content: 'character lore' }) } },
        { name: 'chat-world', type: 'chat', entries: { '3': makeEntry({ uid: 3, key: ['ch'], content: 'chat lore' }) } },
        { name: 'persona-world', type: 'persona', entries: { '4': makeEntry({ uid: 4, key: ['p'], content: 'persona lore' }) } },
      ],
      chat: ['plain'],
      settings: { depth: 4, budgetTokens: Number.MAX_SAFE_INTEGER },
    })

    expect(result.sourceEntries.globalLore.map(entry => `${entry.world}.${entry.uid}`)).toEqual(['global-world.1'])
    expect(result.sourceEntries.characterLore.map(entry => `${entry.world}.${entry.uid}`)).toEqual(['character-world.2'])
    expect(result.sourceEntries.chatLore.map(entry => `${entry.world}.${entry.uid}`)).toEqual(['chat-world.3'])
    expect(result.sourceEntries.personaLore.map(entry => `${entry.world}.${entry.uid}`)).toEqual(['persona-world.4'])
    expect(result.sourceEntries.globalLore[0]).not.toHaveProperty('raw')
  })

  it('lets trusted entries-loaded hooks adjust source groups before sorting and scanning', () => {
    const hook = vi.fn((input: WorldInfoEntriesLoadedHookInput) => {
      expect(input.globalLore.map(entry => entry.content)).toEqual(['global lore'])
      expect(input.characterLore.map(entry => entry.content)).toEqual(['blocked character lore', 'kept character lore'])
      expect(input.trigger).toBe('normal')

      input.globalLore[0].content = 'mutated global lore'
      input.characterLore.splice(0, 1)
      return {
        personaLore: [
          {
            ...input.characterLore[0],
            sourceType: 'persona' as const,
            world: 'hook-persona',
            uid: 99,
            key: ['dragon'],
            content: 'hook-added persona lore',
          },
        ],
      }
    })

    const result = checkWorldInfoSync({
      sources: [
        { name: 'global-world', type: 'global', entries: { '1': makeEntry({ uid: 1, key: ['dragon'], content: 'global lore', order: 30 }) } },
        { name: 'character-world', type: 'character', entries: {
          '2': makeEntry({ uid: 2, key: ['dragon'], content: 'blocked character lore', order: 20 }),
          '3': makeEntry({ uid: 3, key: ['dragon'], content: 'kept character lore', order: 10 }),
        } },
      ],
      chat: ['dragon'],
      settings: {
        depth: 4,
        budgetTokens: Number.MAX_SAFE_INTEGER,
        entriesLoadedHooks: [hook],
      },
    })

    expect(hook).toHaveBeenCalledTimes(1)
    expect(result.sortedEntries.map(entry => entry.content)).toEqual([
      'hook-added persona lore',
      'kept character lore',
      'mutated global lore',
    ])
    expect(result.matchedEntries.map(entry => entry.content)).toEqual(expect.arrayContaining([
      'hook-added persona lore',
      'kept character lore',
      'mutated global lore',
    ]))
    expect(result.matchedEntries.map(entry => entry.content)).not.toContain('blocked character lore')
    expect(result.sourceEntries.globalLore.map(entry => entry.content)).toEqual(['mutated global lore'])
    expect(result.sourceEntries.characterLore.map(entry => entry.content)).toEqual(['kept character lore'])
    expect(result.sourceEntries.personaLore.map(entry => entry.content)).toEqual(['hook-added persona lore'])
    expect(result.sourceEntries.personaLore[0]).not.toHaveProperty('raw')
  })

  it('lets ST-shaped scan-done hooks mutate state, budget, recursion text, and timed effects', () => {
    const hook = vi.fn((input: WorldInfoScanHookInput) => {
      if (input.loopCount !== 1) return
      input.activated.text = 'seed'
      input.budget.current = 5
      input.budget.overflowed = false
      input.state.next = 'recursion'
      input.nextState = 'recursion'
      input.recursionDelay.currentLevel = 3
      input.recursionDelay.availableLevels = []
      input.timedEffects.setTimedEffect('sticky', input.new.successful[0], true)
    })

    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'first lore', insertion_order: 1, sticky: 4 }),
      '2': makeEntry({ uid: 2, key: ['dragon'], content: 'mutated recursion hit', insertion_order: 2, delay_until_recursion: 3 }),
      '3': makeEntry({ uid: 3, key: ['dragon'], content: 'budget blocked', insertion_order: 3, delay_until_recursion: 3 }),
    }, ['dragon'], {
      recursive: true,
      tokenCounter: (text: string) => text.trim().split(/\s+/).filter(Boolean).length,
      scanDoneHooks: [hook],
    })

    expect(hook).toHaveBeenCalledTimes(2)
    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['first lore', 'mutated recursion hit'])
    expect(result.overflowed).toBe(true)
    expect(result.scanEvents[0]).toMatchObject({
      type: 'scan_done',
      nextState: 'recursion',
      overflowed: false,
    })
    expect(result.scanEvents[1]).toMatchObject({
      type: 'scan_done',
      nextState: null,
      overflowed: true,
    })
    expect(Object.keys(result.timedEffects.sticky)).toEqual(['test-world.1'])
  })

  it('keeps timed-effect metadata isolated between scan event snapshots', () => {
    const hook = vi.fn((input: WorldInfoScanHookInput) => {
      const entry = input.activated.entries.get('test-world.1')
      if (!entry) return
      input.timedEffects.setTimedEffect('sticky', entry, input.loopCount === 1)
    })

    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'first lore', sticky: 4 }),
      '2': makeEntry({ uid: 2, key: ['first lore'], content: 'recursive lore', prevent_recursion: true }),
    }, ['dragon'], {
      recursive: true,
      scanDoneHooks: [hook],
    })

    expect(result.scanEvents).toHaveLength(2)
    expect(Object.keys(result.scanEvents[0]?.timedEffectsMetadata?.sticky ?? {})).toEqual(['test-world.1'])
    expect(result.scanEvents[1]?.timedEffectsMetadata).toEqual({ sticky: {}, cooldown: {} })
    expect(Object.keys(result.timedEffects.sticky)).toEqual(['test-world.1'])
  })
  it('applies scan-done activated entry patches before later hooks observe the same scan', () => {
    const replacementEntry = {
      ...getSortedWorldInfoEntries([{ name: 'test-world', type: 'character', entries: {
        '99': makeEntry({ uid: 99, content: 'hook replacement lore' }),
      } }])[0],
      content: 'hook replacement lore',
    }
    const replacementEntries = new Map([[`test-world.${replacementEntry.uid}`, replacementEntry]])
    const observedKeys: string[][] = []
    const firstHook = vi.fn(() => ({
      activated: {
        entries: replacementEntries,
        text: 'hook replacement lore',
      },
    }))
    const secondHook = vi.fn((input: WorldInfoScanHookInput) => {
      observedKeys.push([...input.activated.entries.keys()])
      expect(input.activatedEntries.map(entry => entry.content)).toEqual(['hook replacement lore'])
    })

    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'original lore' }),
    }, ['dragon'], {
      scanDoneHooks: [firstHook, secondHook],
    })

    expect(firstHook).toHaveBeenCalledTimes(1)
    expect(secondHook).toHaveBeenCalledTimes(1)
    expect(observedKeys).toEqual([['test-world.99']])
    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['hook replacement lore'])
  })

  it('reports probability-passed entries as scan-done successful even when budget blocks insertion', () => {
    const snapshots: Array<{
      successful: string[]
      activated: string[]
    }> = []
    const hook = vi.fn((input: WorldInfoScanHookInput) => {
      snapshots.push({
        successful: input.new.successful.map(entry => entry.content),
        activated: [...input.activated.entries.values()].map(entry => entry.content),
      })
    })

    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'one two', order: 20, insertion_order: 1 }),
      '2': makeEntry({ uid: 2, key: ['dragon'], content: 'three four', order: 10, insertion_order: 2 }),
    }, ['dragon'], {
      budgetTokens: 3,
      tokenCounter: (text: string) => text.trim().split(/\s+/).filter(Boolean).length,
      scanDoneHooks: [hook],
    })

    expect(result.overflowed).toBe(true)
    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['one two'])
    expect(snapshots).toEqual([{
      successful: ['one two', 'three four'],
      activated: ['one two'],
    }])
    expect(result.scanEvents[0]).toMatchObject({
      type: 'scan_done',
      newSuccessfulEntries: [
        expect.objectContaining({ uid: 1, content: 'one two' }),
        expect.objectContaining({ uid: 2, content: 'three four' }),
      ],
    })
  })

  it('keeps scan-done timed-effect hook writes dry-run compatible', () => {
    const hook = vi.fn((input: WorldInfoScanHookInput) => {
      const entry = input.new.successful[0]
      input.timedEffects.setTimedEffect('sticky', entry, true)
      input.timedEffects.setTimedEffect('delay', entry, true)
      expect(input.timedEffects.isEffectActive('sticky', entry)).toBe(false)
      expect(input.timedEffects.isEffectActive('delay', entry)).toBe(true)
    })

    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'dry-run hook lore', sticky: 4 }),
    }, ['dragon'], {
      dryRun: true,
      scanDoneHooks: [hook],
    })

    expect(hook).toHaveBeenCalledTimes(1)
    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['dry-run hook lore'])
    expect(result.timedEffectsChanged).toBe(false)
    expect(result.timedEffects).toEqual({ sticky: {}, cooldown: {} })
    expect(result.scanEvents[0]).toMatchObject({
      timedEffectActiveEntryIds: {
        sticky: [],
        cooldown: [],
        delay: ['test-world.1'],
      },
    })
  })

  it('keeps one entry per inclusion group using override, scoring, or weight', () => {
    const overrideResult = scan({
      '1': makeEntry({ uid: 1, key: ['a'], content: 'normal', group: 'lore', order: 100 }),
      '2': makeEntry({ uid: 2, key: ['a'], content: 'override', group: 'lore', groupOverride: true, order: 10 }),
    }, ['a'])
    expect(overrideResult.matchedEntries.map(entry => entry.content)).toEqual(['override'])

    const scoredResult = scan({
      '1': makeEntry({ uid: 1, key: ['a'], content: 'lower score', group: 'score', groupWeight: 1, useGroupScoring: null }),
      '2': makeEntry({ uid: 2, key: ['a', 'b'], content: 'higher score', group: 'score', groupWeight: 1, useGroupScoring: null }),
    }, ['a b'], { useGroupScoring: true })
    expect(scoredResult.matchedEntries.map(entry => entry.content)).toEqual(['higher score'])

    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const weightedResult = scan({
      '1': makeEntry({ uid: 1, key: ['a'], content: 'low weight', group: 'weight', groupWeight: 1 }),
      '2': makeEntry({ uid: 2, key: ['a'], content: 'high weight', group: 'weight', groupWeight: 9 }),
    }, ['a'])
    expect(weightedResult.matchedEntries.map(entry => entry.content)).toEqual(['high weight'])
  })

  it('keeps tied ST group-scoring entries eligible for weighted winner selection', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)

    const result = scan({
      '1': makeEntry({ uid: 1, key: ['a'], content: 'low weight tied score', group: 'score', groupWeight: 1, useGroupScoring: null }),
      '2': makeEntry({ uid: 2, key: ['a'], content: 'high weight tied score', group: 'score', groupWeight: 9, useGroupScoring: null }),
    }, ['a'], { useGroupScoring: true })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['high weight tied score'])
  })

  it('keeps zero-weight inclusion-group entries out of positive ST rolls', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001)

    const result = scan({
      '1': makeEntry({ uid: 1, key: ['a'], content: 'zero weight', group: 'weight', groupWeight: 0 }),
      '2': makeEntry({ uid: 2, key: ['a'], content: 'positive weight', group: 'weight', groupWeight: 100 }),
    }, ['a'])

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['positive weight'])
  })

  it('does not remove unscored entries during ST group scoring', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)

    const result = scan({
      '1': makeEntry({
        uid: 1,
        key: ['a'],
        content: 'unscored low score high weight',
        group: 'score',
        groupWeight: 100,
        useGroupScoring: false,
      }),
      '2': makeEntry({
        uid: 2,
        key: ['a', 'b'],
        content: 'scored high score low weight',
        group: 'score',
        groupWeight: 1,
        useGroupScoring: true,
      }),
    }, ['a b'], { useGroupScoring: true })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['unscored low score high weight'])
  })

  it('keeps all active sticky entries in the same inclusion group like ST', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['missing'], content: 'first sticky', group: 'sticky', sticky: 4, insertion_order: 1 }),
      '2': makeEntry({ uid: 2, key: ['missing'], content: 'second sticky', group: 'sticky', sticky: 4, insertion_order: 2 }),
    }, ['plain', 'second'], {
      timedEffects: {
        sticky: {
          'test-world.1': { end: 5, world: 'test-world', uid: 1 },
          'test-world.2': { end: 5, world: 'test-world', uid: 2 },
        },
        cooldown: {},
      },
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['first sticky', 'second sticky'])
  })

  it('treats non-slash use_regexp keys as plaintext in ST-compatible scans', () => {
    const regexLike = scan({
      '1': makeEntry({ uid: 1, key: ['drag(on|ons)'], content: 'regex-like hit', use_regexp: true }),
    }, ['dragons fly'])
    expect(regexLike.matchedEntries).toHaveLength(0)

    const literal = scan({
      '1': makeEntry({ uid: 1, key: ['drag(on|ons)'], content: 'literal hit', use_regexp: true }),
    }, ['drag(on|ons)'])
    expect(literal.matchedEntries.map(entry => entry.content)).toEqual(['literal hit'])
  })

  it('suppresses delayed entries until the chat is long enough', () => {
    const entries = {
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'delayed', delay: 3 }),
    }

    expect(scan(entries, ['dragon']).matchedEntries).toHaveLength(0)
    expect(scan(entries, ['dragon', 'second', 'third']).matchedEntries.map(entry => entry.content)).toEqual(['delayed'])
  })

  it('returns timed effect metadata and lets sticky entries reactivate without rerolling probability', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const first = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'sticky lore', sticky: 2, probability: 100 }),
    }, ['dragon', 'second'])

    expect(first.matchedEntries.map(entry => entry.content)).toEqual(['sticky lore'])
    expect(first.timedEffectsChanged).toBe(true)
    expect(Object.keys(first.timedEffects.sticky)).toEqual(['test-world.1'])
    expect(first.scanEvents[0]?.timedEffectsMetadata).toEqual({
      sticky: {},
      cooldown: {},
    })

    const second = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'sticky lore', sticky: 2, probability: 1 }),
    }, ['no trigger', 'second', 'third'], {
      timedEffects: first.timedEffects,
    })

    expect(second.matchedEntries.map(entry => entry.content)).toEqual(['sticky lore'])
  })

  it('lets active sticky entries bypass recursion-delay and exclude-recursion gates like ST', () => {
    const seeded = scan({
      '1': makeEntry({
        uid: 1,
        key: ['dragon'],
        content: 'sticky delayed lore',
        sticky: 3,
      }),
    }, ['dragon'], { recursive: true })

    const result = scan({
      '1': makeEntry({
        uid: 1,
        key: ['dragon'],
        content: 'sticky delayed lore',
        sticky: 3,
        delay_until_recursion: 2,
        exclude_recursion: true,
      }),
    }, ['plain follow-up', 'new turn'], {
      recursive: true,
      timedEffects: seeded.timedEffects,
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['sticky delayed lore'])
  })

  it('suppresses cooldown entries and converts expired sticky entries into cooldown', () => {
    const entries = {
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'cooldown lore', sticky: 1, cooldown: 2 }),
    }
    const seeded = scan(entries, ['dragon'])
    const seededCooldown = {
      sticky: {},
      cooldown: {
        'test-world.1': {
          ...seeded.timedEffects.sticky['test-world.1'],
          start: 1,
          end: 5,
          protected: false,
        },
      },
    }

    const activeCooldown = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'cooldown lore', cooldown: 2 }),
    }, ['dragon', 'second'], {
      timedEffects: seededCooldown,
    })

    expect(activeCooldown.matchedEntries).toHaveLength(0)

    const seededSticky = {
      sticky: {
        'test-world.1': {
          ...seeded.timedEffects.sticky['test-world.1'],
          start: 1,
          end: 2,
          protected: false,
        },
      },
      cooldown: {},
    }

    const expiredSticky = scan(entries, ['dragon', 'second', 'third', 'fourth'], {
      timedEffects: seededSticky,
    })

    expect(expiredSticky.matchedEntries).toHaveLength(0)
    expect(expiredSticky.timedEffects.cooldown['test-world.1']).toMatchObject({
      start: 4,
      end: 6,
      protected: true,
    })
  })

  it('cleans invalid timedWorldInfo records and reports metadata changes', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'valid lore', sticky: 2 }),
    }, ['plain', 'second'], {
      timedEffects: {
        sticky: {
          invalid: { hash: Number.NaN, start: 0, end: 1 },
        },
        cooldown: {
          primitive: 'bad-value',
        },
      },
    })

    expect(result.timedEffectsChanged).toBe(true)
    expect(result.timedEffects).toEqual({ sticky: {}, cooldown: {} })
  })

  it('normalizes plugin-shaped sticky timedWorldInfo records by world and uid', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'foreign sticky lore', sticky: 3, probability: 1 }),
    }, ['plain', 'second'], {
      timedEffects: {
        sticky: {
          'test-world.1': { end: 5, world: 'test-world', uid: 1 },
        },
        cooldown: {},
      },
    })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['foreign sticky lore'])
    expect(result.timedEffectsChanged).toBe(true)
    expect(result.timedEffects.sticky['test-world.1']).toMatchObject({
      hash: expect.any(Number),
      start: 1,
      end: 5,
      protected: false,
    })
    expect(result.timedEffects.sticky['test-world.1']).not.toHaveProperty('world')
    expect(result.timedEffects.sticky['test-world.1']).not.toHaveProperty('uid')
  })

  it('normalizes plugin-shaped cooldown timedWorldInfo records before filtering entries', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'foreign cooldown lore', cooldown: 3 }),
    }, ['dragon', 'second'], {
      timedEffects: {
        sticky: {},
        cooldown: {
          'test-world.1': { end: 5, world: 'test-world', uid: '1' },
        },
      },
    })

    expect(result.matchedEntries).toHaveLength(0)
    expect(result.timedEffectsChanged).toBe(true)
    expect(result.timedEffects.cooldown['test-world.1']).toMatchObject({
      hash: expect.any(Number),
      start: 1,
      end: 5,
      protected: false,
    })
  })

  it('cleans plugin-shaped timedWorldInfo records when the referenced entry is missing', () => {
    const result = scan({}, ['plain'], {
      timedEffects: {
        sticky: {
          'test-world.404': { end: 4, world: 'test-world', uid: 404 },
        },
        cooldown: {},
      },
    })

    expect(result.timedEffectsChanged).toBe(true)
    expect(result.timedEffects).toEqual({ sticky: {}, cooldown: {} })
  })

  it('does not write sticky or cooldown metadata during dry runs', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'dry lore', sticky: 2, cooldown: 2 }),
    }, ['dragon'], { dryRun: true })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['dry lore'])
    expect(result.timedEffectsChanged).toBe(false)
    expect(result.timedEffects).toEqual({ sticky: {}, cooldown: {} })
  })

  it('normalizes ST extension fields used by the compatibility layer', () => {
    const entry = normalizeWorldEntry({
      uid: 1,
      keys: ['dragon'],
      secondary_keys: ['fire'],
      content: 'lore',
      extensions: {
        position: 'at_depth',
        depth: 7,
        probability: 50,
        group_weight: 33,
        group_override: true,
        ignore_budget: true,
        selective_logic: WORLD_INFO_LOGIC.AND_ALL,
        delay_until_recursion: 2,
        outlet_name: 'memo',
        match_character_description: true,
        vectorized: true,
        triggers: ['normal'],
      },
      character_filter: { names: ['Alice'], tags: ['hero'], isExclude: false },
    })

    expect(entry.position).toBe(WORLD_INFO_POSITION.atDepth)
    expect(entry.depth).toBe(7)
    expect(entry.probability).toBe(50)
    expect(entry.groupWeight).toBe(33)
    expect(entry.groupOverride).toBe(true)
    expect(entry.ignoreBudget).toBe(true)
    expect(entry.selectiveLogic).toBe(WORLD_INFO_LOGIC.AND_ALL)
    expect(entry.excludeRecursion).toBe(false)
    expect(entry.preventRecursion).toBe(false)
    expect(entry.delay_until_recursion).toBe(2)
    expect(entry.delayUntilRecursion).toBe(2)
    expect(entry.outletName).toBe('memo')
    expect(entry.matchCharacterDescription).toBe(true)
    expect(entry.vectorized).toBe(true)
    expect(entry.extensions?.match_character_description).toBe(true)
    expect(entry.extensions?.triggers).toEqual(['normal'])
    expect(entry.character_filter).toEqual({ names: ['Alice'], tags: ['hero'], isExclude: false })
    expect(entry.characterFilter).toEqual({ names: ['Alice'], tags: ['hero'], isExclude: false })
  })

  it('normalizes ST extension-only advanced fields into canonical scan fields', () => {
    const entry = normalizeWorldEntry({
      uid: 2,
      key: ['archive'],
      content: 'advanced lore',
      extensions: {
        useProbability: false,
        match_persona_description: true,
        match_character_personality: true,
        match_character_depth_prompt: true,
        match_scenario: true,
        match_creator_notes: true,
        scan_depth: 8,
        case_sensitive: true,
        match_whole_words: true,
        use_group_scoring: false,
        automation_id: 'auto-1',
        sticky: 3,
        cooldown: 4,
        delay: 5,
        triggers: ['continue'],
      },
    })

    expect(entry.useProbability).toBe(false)
    expect(entry.matchPersonaDescription).toBe(true)
    expect(entry.matchCharacterPersonality).toBe(true)
    expect(entry.matchCharacterDepthPrompt).toBe(true)
    expect(entry.matchScenario).toBe(true)
    expect(entry.matchCreatorNotes).toBe(true)
    expect(entry.scanDepth).toBe(8)
    expect(entry.scan_depth).toBe(8)
    expect(entry.caseSensitive).toBe(true)
    expect(entry.case_sensitive).toBe(true)
    expect(entry.matchWholeWords).toBe(true)
    expect(entry.match_whole_words).toBe(true)
    expect(entry.useGroupScoring).toBe(false)
    expect(entry.use_group_scoring).toBe(false)
    expect(entry.automationId).toBe('auto-1')
    expect(entry.automation_id).toBe('auto-1')
    expect(entry.sticky).toBe(3)
    expect(entry.cooldown).toBe(4)
    expect(entry.delay).toBe(5)
    expect(entry.triggers).toEqual(['continue'])
  })
})
