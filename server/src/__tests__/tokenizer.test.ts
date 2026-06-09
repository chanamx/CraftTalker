import { describe, expect, it } from 'vitest'
import { createTokenCounter } from '../lib/tokenizer.js'

describe('tokenizer adapter', () => {
  it('counts text with a model tokenizer when available', () => {
    const countTokens = createTokenCounter('gpt-4o-mini')
    expect(countTokens('hello world')).toBeGreaterThan(0)
  })

  it('falls back for unknown model names without blocking callers', () => {
    const countTokens = createTokenCounter('unknown-local-model')
    expect(countTokens('hello world')).toBeGreaterThan(0)
  })
})
