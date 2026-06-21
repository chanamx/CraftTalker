import { describe, expect, it } from 'vitest'
import { buildSTPrompt } from '../prompt-builder.js'
import type { CharacterCard } from '../png-parser.js'

const baseChar: CharacterCard = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  name: 'Alice',
  description: 'A helpful assistant',
  personality: 'kind and witty',
  scenario: 'A cozy cafe',
  first_mes: 'Hello!',
  mes_example: '<START>\n{{user}}: Hi\n{{char}}: Hello there!',
  creator_notes: '',
  system_prompt: 'You are {{char}}.',
  post_history_instructions: 'Stay in character as {{char}} for {{user}}.',
  tags: [],
  creator: 'test',
  character_version: '1.0',
  extensions: {},
}

describe('buildSTPrompt', () => {
  it('builds system prompt with all character fields', () => {
    const { messages } = buildSTPrompt({
      character: baseChar,
      messages: [{ role: 'user', content: 'Hi' }],
    })

    const system = messages.find(m => m.role === 'system' && m.content.includes('You are Alice'))
    expect(system).toBeDefined()
    expect(system?.content).toContain('A helpful assistant')
    expect(system?.content).toContain('kind and witty')
    expect(system?.content).toContain('A cozy cafe')
    expect(system?.content).toContain('Example Dialogue')
    expect(system?.content).toContain('---')
  })

  it('applies macros to system, post-history, example, world-info, and chat messages', () => {
    const { messages } = buildSTPrompt({
      character: baseChar,
      messages: [{ role: 'user', content: '{{char}} is speaking to {{user}}' }],
      userName: 'Bob',
      worldInfo: ['{{char}} keeps a notebook for {{user}}'],
    })

    expect(messages.map(message => message.content).join('\n')).toContain('You are Alice')
    expect(messages.map(message => message.content).join('\n')).toContain('Alice keeps a notebook for Bob')
    expect(messages.map(message => message.content).join('\n')).toContain('Stay in character as Alice for Bob')
    expect(messages.find(m => m.role === 'user')?.content).toBe('Alice is speaking to Bob')
  })

  it('inserts post_history_instructions before the last user message', () => {
    const { messages } = buildSTPrompt({
      character: baseChar,
      messages: [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Reply' },
        { role: 'user', content: 'Second' },
      ],
    })

    const postIdx = messages.findIndex(m => m.content.includes('Stay in character'))
    const lastUserIdx = messages.findIndex(m => m.content === 'Second')
    expect(postIdx).toBeGreaterThan(0)
    expect(postIdx).toBeLessThan(lastUserIdx)
  })

  it('appends post_history_instructions after existing messages when there is no user message', () => {
    const { messages } = buildSTPrompt({
      character: baseChar,
      messages: [{ role: 'assistant', content: 'Existing assistant text' }],
      userName: 'Bob',
    })

    expect(messages.at(-2)).toMatchObject({
      role: 'assistant',
      content: 'Existing assistant text',
    })
    expect(messages.at(-1)).toMatchObject({
      role: 'system',
      content: 'Stay in character as Alice for Bob.',
    })
  })

  it('works without optional fields', () => {
    const minimal: CharacterCard = {
      ...baseChar,
      system_prompt: undefined,
      post_history_instructions: undefined,
      personality: '',
      scenario: '',
      mes_example: '',
    }

    const { messages } = buildSTPrompt({
      character: minimal,
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(messages.length).toBeGreaterThanOrEqual(1)
    expect(messages.at(-1)?.content).toBe('Hi')
  })

  it('places even world info entries in the labeled before block and odd entries after scenario text', () => {
    const { messages } = buildSTPrompt({
      character: baseChar,
      messages: [{ role: 'user', content: 'Hi' }],
      worldInfo: ['Before lore A', 'After lore B', 'Before lore C'],
    })

    const system = messages[0]?.content ?? ''
    expect(system).toContain('[World Info]\nBefore lore A\nBefore lore C')
    expect(system).toContain('[Scenario]\nA cozy cafe')
    expect(system.indexOf('After lore B')).toBeGreaterThan(system.indexOf('[Scenario]'))
  })
})
