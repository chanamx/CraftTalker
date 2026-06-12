import { describe, expect, it } from 'vitest'
import type { CharacterCard } from '../../lib/png-parser.js'
import type { MatchedEntry } from '../../lib/world-match.js'
import { buildOpenAIMessages } from '../native-prompt.js'

const character: CharacterCard = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  name: 'TestBot',
  description: 'A test character',
  personality: '',
  scenario: '',
  first_mes: '',
  mes_example: '',
  creator_notes: '',
  system_prompt: '',
  post_history_instructions: '',
  alternate_greetings: [],
  tags: [],
  creator: '',
  character_version: '',
  extensions: {},
}

function worldEntry(overrides: Partial<MatchedEntry>): MatchedEntry {
  return {
    content: '',
    position: 4,
    depth: 1,
    insertion_order: 0,
    role: 0,
    ...overrides,
  }
}

describe('native prompt world-info injection', () => {
  it('preserves ST at-depth world-info roles in chat messages', () => {
    const messages = buildOpenAIMessages(
      [{ role: 'user', content: 'Hello' }],
      character,
      { user: 'User', char: 'TestBot' },
      [
        worldEntry({ content: 'depth as user', role: 1, insertion_order: 1 }),
        worldEntry({ content: 'depth as assistant', role: 2, insertion_order: 2 }),
        worldEntry({ content: 'depth as system', role: 0, insertion_order: 3 }),
        worldEntry({ content: 'depth invalid role', role: 99, insertion_order: 4 }),
      ],
    )

    expect(messages).toEqual([
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: 'depth as user' },
      { role: 'assistant', content: 'depth as assistant' },
      { role: 'system', content: 'depth as system' },
      { role: 'system', content: 'depth invalid role' },
      { role: 'user', content: 'Hello' },
    ])
  })
})
