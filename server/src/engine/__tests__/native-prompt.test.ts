import { describe, expect, it } from 'vitest'
import type { CharacterCard } from '../../lib/png-parser.js'
import type { MatchedEntry } from '../../lib/world-match.js'
import { buildCompletionPrompt, buildOpenAIMessages } from '../native-prompt.js'
import type { EnginePromptAnchors } from '../types.js'

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
  it('places typed extension prompts around the native main prompt', () => {
    const anchors: EnginePromptAnchors = {
      beforeMain: [{ role: 'user', content: 'Before {{char}}' }],
      afterMain: [{ role: 'assistant', content: 'After {{user}}' }],
    }
    const macroEnv = { user: 'Writer', char: 'TestBot' }
    const chat = [{ role: 'user', content: 'Hello' }]

    const deepWorldEntry = worldEntry({ content: 'Deep world', depth: 99 })
    const openAI = buildOpenAIMessages(chat, character, macroEnv, [deepWorldEntry], anchors)
    expect(openAI).toEqual([
      { role: 'user', content: 'Before TestBot' },
      expect.objectContaining({ role: 'system', content: expect.stringContaining('A test character') }),
      { role: 'assistant', content: 'After Writer' },
      { role: 'system', content: 'Deep world' },
      { role: 'user', content: 'Hello' },
    ])

    const completion = buildCompletionPrompt(chat, character, macroEnv, [deepWorldEntry], anchors)
    expect(completion.indexOf('Before TestBot')).toBeLessThan(completion.indexOf('A test character'))
    expect(completion.indexOf('A test character')).toBeLessThan(completion.indexOf('After Writer'))
    expect(completion.indexOf('After Writer')).toBeLessThan(completion.indexOf('Deep world'))
    expect(completion.indexOf('Deep world')).toBeLessThan(completion.indexOf('Hello'))
  })

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
