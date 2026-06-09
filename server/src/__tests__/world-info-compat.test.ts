import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WORLD_INFO_INSERTION_STRATEGY,
  WORLD_INFO_LOGIC,
  WORLD_INFO_POSITION,
  checkWorldInfo,
  checkWorldInfoSync,
  getSortedWorldInfoEntries,
  type WorldInfoScanHookInput,
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

  it('supports ST external force activations for vectorized entries', () => {
    const entries = {
      '0': makeEntry({ uid: 0, key: ['missing'], content: 'vector lore', vectorized: true }),
    }

    const unforced = scan(entries, ['plain chat'])
    expect(unforced.matchedEntries).toHaveLength(0)
    expect(unforced.vectorizedSkipped.map(event => event.entryId)).toEqual(['test-world.0'])

    const forced = scan(entries, ['plain chat'], {
      forceActivations: [{ world: 'test-world', uid: 0 }],
    })
    expect(forced.matchedEntries.map(entry => entry.content)).toEqual(['vector lore'])
    expect(forced.vectorizedSkipped).toHaveLength(0)
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

  it('skips vectorized entries without a vector runtime and reports scan events', () => {
    const result = scan({
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'normal lore', insertion_order: 1 }),
      '2': makeEntry({ uid: 2, key: ['dragon'], content: 'vector lore', insertion_order: 2, extensions: { vectorized: true } }),
    }, ['dragon'], { recursive: true, maxRecursionSteps: 3 })

    expect(result.matchedEntries.map(entry => entry.content)).toEqual(['normal lore'])
    expect(result.vectorizedSkipped).toHaveLength(1)
    expect(result.vectorizedSkipped[0]).toMatchObject({
      entryId: 'test-world.2',
      world: 'test-world',
      uid: 2,
      type: 'vectorized_skipped',
    })
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
  })

  it('keeps one entry per inclusion group using override, scoring, or weight', () => {
    const overrideResult = scan({
      '1': makeEntry({ uid: 1, key: ['a'], content: 'normal', group: 'lore', order: 100 }),
      '2': makeEntry({ uid: 2, key: ['a'], content: 'override', group: 'lore', groupOverride: true, order: 10 }),
    }, ['a'])
    expect(overrideResult.matchedEntries.map(entry => entry.content)).toEqual(['override'])

    const scoredResult = scan({
      '1': makeEntry({ uid: 1, key: ['a'], content: 'lower score', group: 'score', groupWeight: 1 }),
      '2': makeEntry({ uid: 2, key: ['a', 'b'], content: 'higher score', group: 'score', groupWeight: 1 }),
    }, ['a b'], { useGroupScoring: true })
    expect(scoredResult.matchedEntries.map(entry => entry.content)).toEqual(['higher score'])

    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const weightedResult = scan({
      '1': makeEntry({ uid: 1, key: ['a'], content: 'low weight', group: 'weight', groupWeight: 1 }),
      '2': makeEntry({ uid: 2, key: ['a'], content: 'high weight', group: 'weight', groupWeight: 9 }),
    }, ['a'])
    expect(weightedResult.matchedEntries.map(entry => entry.content)).toEqual(['high weight'])
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
    expect(entry.delay_until_recursion).toBe(2)
    expect(entry.outletName).toBe('memo')
    expect(entry.vectorized).toBe(true)
    expect(entry.extensions?.match_character_description).toBe(true)
    expect(entry.extensions?.triggers).toEqual(['normal'])
    expect(entry.character_filter).toEqual({ names: ['Alice'], tags: ['hero'], isExclude: false })
  })
})
