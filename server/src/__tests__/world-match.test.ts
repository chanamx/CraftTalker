import { describe, it, expect } from 'vitest'
import { matchWorldEntries } from '../lib/world-match.js'
import type { WorldBookEntry } from '../services/world.service.js'

function makeEntry(overrides: Partial<WorldBookEntry>): WorldBookEntry {
  return {
    uid: 1, key: [], keysecondary: [], comment: '', content: '',
    constant: false, selective: false, insertion_order: 0, enabled: true,
    position: 0, depth: 4, order: 0, use_regexp: false,
    probability: 100, group: '', group_override: false,
    exclude_recursion: false, prevent_recursion: false,
    delay_until_recursion: false, scan_depth: 100, match_whole_words: false,
    use_group_scoring: false, case_sensitive: false, automation_id: '',
    role: 0, sticky: 0, cooldown: 0, delay: 0, display_index: 0,
    ...overrides,
  }
}

describe('matchWorldEntries', () => {
  it('matches entries by keyword', () => {
    const entries = {
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'Dragons are powerful.' }),
    }
    const result = matchWorldEntries(entries, 'I saw a dragon in the sky')
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Dragons are powerful.')
  })

  it('returns empty for no keyword match', () => {
    const entries = {
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'Dragons are powerful.' }),
    }
    expect(matchWorldEntries(entries, 'The cat sat on the mat')).toHaveLength(0)
  })

  it('always includes constant entries', () => {
    const entries = {
      '1': makeEntry({ uid: 1, key: ['nomatch'], content: 'Always here.', constant: true }),
    }
    const result = matchWorldEntries(entries, 'unrelated text')
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Always here.')
  })

  it('skips disabled entries', () => {
    const entries = {
      '1': makeEntry({ uid: 1, key: ['dragon'], content: 'Hidden.', enabled: false }),
    }
    expect(matchWorldEntries(entries, 'dragon')).toHaveLength(0)
  })

  it('respects ST disable when enabled is not present', () => {
    const disabled = {
      '1': {
        uid: 1,
        key: ['dragon'],
        content: 'Hidden.',
        disable: true,
      } as WorldBookEntry,
    }

    const enabled = {
      '1': {
        uid: 1,
        key: ['dragon'],
        content: 'Visible.',
        disable: false,
      } as WorldBookEntry,
    }

    expect(matchWorldEntries(disabled, 'dragon')).toHaveLength(0)
    expect(matchWorldEntries(enabled, 'dragon')).toHaveLength(1)
  })

  it('respects selective mode with secondary keys', () => {
    const entries = {
      '1': makeEntry({
        uid: 1, key: ['magic'], keysecondary: ['fire'], content: 'Fire magic.',
        selective: true,
      }),
    }
    expect(matchWorldEntries(entries, 'magic is cool')).toHaveLength(0)
    expect(matchWorldEntries(entries, 'magic fire spell')).toHaveLength(1)
  })

  it('case insensitive by default', () => {
    const entries = {
      '1': makeEntry({ uid: 1, key: ['Dragon'], content: 'Found.' }),
    }
    expect(matchWorldEntries(entries, 'DRAGON')).toHaveLength(1)
  })

  it('respects case_sensitive flag', () => {
    const entries = {
      '1': makeEntry({ uid: 1, key: ['Dragon'], content: 'Found.', case_sensitive: true }),
    }
    expect(matchWorldEntries(entries, 'dragon')).toHaveLength(0)
    expect(matchWorldEntries(entries, 'Dragon')).toHaveLength(1)
  })

  it('supports regex keys', () => {
    const entries = {
      '1': makeEntry({ uid: 1, key: ['drag(on|ons)'], content: 'Regex hit.', use_regexp: true }),
    }
    expect(matchWorldEntries(entries, 'dragons fly')).toHaveLength(1)
  })

  it('sorts by insertion_order', () => {
    const entries = {
      '1': makeEntry({ uid: 1, key: ['a'], content: 'Second', insertion_order: 10 }),
      '2': makeEntry({ uid: 2, key: ['a'], content: 'First', insertion_order: 5 }),
    }
    const result = matchWorldEntries(entries, 'a')
    expect(result[0].content).toBe('First')
    expect(result[1].content).toBe('Second')
  })
})
