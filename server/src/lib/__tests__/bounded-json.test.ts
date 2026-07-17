import { describe, expect, it } from 'vitest'
import { inspectJsonComplexity } from '../bounded-json.js'

describe('bounded JSON complexity', () => {
  it('accepts ordinary nested values', () => {
    expect(inspectJsonComplexity({ a: [1, { b: true }] }, { maxDepth: 5, maxNodes: 20, maxArrayLength: 10 })).toEqual({ ok: true })
  })
  it('rejects excessive depth, nodes, and arrays', () => {
    expect(inspectJsonComplexity({ a: { b: { c: { d: 1 } } } }, { maxDepth: 2, maxNodes: 20, maxArrayLength: 10 }).ok).toBe(false)
    expect(inspectJsonComplexity({ a: 1, b: 2, c: 3 }, { maxDepth: 5, maxNodes: 2, maxArrayLength: 10 }).ok).toBe(false)
    expect(inspectJsonComplexity([1, 2, 3], { maxDepth: 5, maxNodes: 20, maxArrayLength: 2 }).ok).toBe(false)
  })
})
