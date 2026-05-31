import { describe, it, expect } from 'vitest'
import { buildSTPrompt } from '../src/lib/prompt-builder.js'
import type { CharacterCard } from '../src/lib/png-parser.js'

const baseChar: CharacterCard = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  name: 'Alice',
  description: 'A helpful assistant',
  personality: 'kind and witty',
  scenario: 'A cozy cafe',
  first_mes: 'Hello!',
  mes_example: '{{user}}: Hi\n{{char}}: Hello there!',
  creator_notes: '',
  system_prompt: 'You are Alice.',
  post_history_instructions: 'Stay in character as {{char}}.',
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
    expect(system!.content).toContain('A helpful assistant')
    expect(system!.content).toContain('kind and witty')
    expect(system!.content).toContain('A cozy cafe')
    expect(system!.content).toContain('Example Dialogue')
  })

  it('applies macros to messages', () => {
    const { messages } = buildSTPrompt({
      character: baseChar,
      messages: [{ role: 'user', content: '{{char}} is great' }],
      userName: 'Bob',
    })

    const userMsg = messages.find(m => m.role === 'user')
    expect(userMsg!.content).toBe('Alice is great')
  })

  it('inserts post_history_instructions before last user message', () => {
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
    expect(postIdx).toBeLessThan(lastUserIdx)
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
    expect(messages[messages.length - 1].content).toBe('Hi')
  })

  it('includes world info', () => {
    const { messages } = buildSTPrompt({
      character: baseChar,
      messages: [{ role: 'user', content: 'Hi' }],
      worldInfo: ['Dragons exist in this world', 'Magic is common'],
    })

    const system = messages[0]
    expect(system.content).toContain('Dragons exist')
    expect(system.content).toContain('Magic is common')
  })
})
