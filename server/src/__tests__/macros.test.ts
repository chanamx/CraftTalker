import { describe, it, expect } from 'vitest'
import { resolveMacros } from '../lib/macros.js'

describe('resolveMacros', () => {
  const env = { user: 'Alice', char: 'Luna' }

  it('replaces {{user}} and {{char}}', () => {
    expect(resolveMacros('Hello {{user}}, I am {{char}}.', env))
      .toBe('Hello Alice, I am Luna.')
  })

  it('handles case-insensitive keys', () => {
    expect(resolveMacros('{{User}} meets {{CHAR}}', env))
      .toBe('Alice meets Luna')
  })

  it('preserves unknown macros', () => {
    expect(resolveMacros('{{unknown}} stays', env))
      .toBe('{{unknown}} stays')
  })

  it('returns empty string for empty input', () => {
    expect(resolveMacros('', env)).toBe('')
  })

  it('returns text unchanged when no macros present', () => {
    const text = 'No macros here'
    expect(resolveMacros(text, env)).toBe(text)
  })

  it('handles null/undefined gracefully', () => {
    expect(resolveMacros(null as any, env)).toBe(null)
    expect(resolveMacros(undefined as any, env)).toBe(undefined)
  })

  it('resolves {{char_name}} and {{user_name}} aliases', () => {
    expect(resolveMacros('{{char_name}} and {{user_name}}', env))
      .toBe('Luna and Alice')
  })

  it('resolves {{isodate}} in YYYY-MM-DD format', () => {
    const result = resolveMacros('{{isodate}}', env)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('resolves {{time}} in HH:mm format', () => {
    const result = resolveMacros('{{time}}', env)
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })

  it('handles multiple macros in one string', () => {
    expect(resolveMacros('{{char}} says hi to {{user}}. {{char}} is happy.', env))
      .toBe('Luna says hi to Alice. Luna is happy.')
  })

  it('handles macros with whitespace in key', () => {
    expect(resolveMacros('{{ user }}', env)).toBe('Alice')
    expect(resolveMacros('{{  char  }}', env)).toBe('Luna')
  })

  // ST compatibility: character card fields commonly use these patterns
  it('resolves macros in typical ST character card text', () => {
    const description = '{{char}} is a cheerful girl who loves talking to {{user}}.'
    expect(resolveMacros(description, env))
      .toBe('Luna is a cheerful girl who loves talking to Alice.')
  })
})
