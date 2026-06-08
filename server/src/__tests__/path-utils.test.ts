import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { safePath, validatePathInBase } from '../lib/path-utils.js'

describe('path-utils', () => {
  it('allows paths inside the base directory', () => {
    const base = path.resolve('data')
    const result = validatePathInBase(path.join(base, 'characters', 'Luna'), base)
    expect(result).toBe(path.resolve(base, 'characters', 'Luna'))
  })

  it('rejects sibling directories that only share a prefix', () => {
    const base = path.resolve('data')
    const sibling = `${base}-outside`
    expect(() => validatePathInBase(path.join(sibling, 'card.png'), base)).toThrow()
  })

  it('sanitizes unsafe path segments before joining', () => {
    const base = path.resolve('data')
    const result = safePath(base, '../Luna/../../avatar.png')
    expect(path.dirname(result)).toBe(base)
    expect(path.basename(result)).not.toContain(path.sep)
  })
})
