import { describe, expect, it } from 'vitest'
import { transformWorldInfoEntriesWithRegex } from '../lib/regex-transform.js'

describe('bounded world-info regex transforms', () => {
  it('applies ST world-info prompt scripts in source array order', async () => {
    const result = await transformWorldInfoEntriesWithRegex([
      { id: 'world.1', content: 'foo', depth: 4 },
      { id: 'world.2', content: 'foo', depth: 1 },
    ], [
      { findRegex: 'foo', replaceString: 'bar', placement: [5], promptOnly: true },
      { findRegex: 'bar', replaceString: 'baz', placement: [5], promptOnly: true },
      { findRegex: 'baz', replaceString: 'deep', placement: [5], promptOnly: true, minDepth: 3 },
      { findRegex: 'deep', replaceString: 'disabled', placement: [5], promptOnly: true, disabled: true },
    ], { timeoutMs: 1_000 })

    expect(result).toEqual({
      contents: {
        'world.1': 'deep',
        'world.2': 'baz',
      },
      timedOut: false,
      truncated: false,
    })
  })

  it('terminates catastrophic regex work and falls back to original content', async () => {
    const content = `${'a'.repeat(30_000)}!`
    const result = await transformWorldInfoEntriesWithRegex([
      { id: 'world.1', content, depth: 4 },
    ], [
      { findRegex: '/(a+)+$/g', replaceString: 'blocked', placement: [5], promptOnly: true },
    ], { timeoutMs: 50 })

    expect(result.contents).toEqual({ 'world.1': content })
    expect(result.timedOut).toBe(true)
    expect(result.truncated).toBe(false)
    expect(result.diagnostic).toEqual({ code: 'timeout' })
  })

  it('terminates the regex worker and rejects when the scan signal is aborted', async () => {
    const controller = new AbortController()
    const content = `${'a'.repeat(30_000)}!`
    const transform = transformWorldInfoEntriesWithRegex([
      { id: 'world.1', content, depth: 4 },
    ], [
      { findRegex: '/(a+)+$/g', replaceString: 'blocked', placement: [5], promptOnly: true },
    ], { timeoutMs: 2_000, signal: controller.signal })

    setTimeout(() => controller.abort('request disconnected'), 25)
    await expect(transform).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('accepts legacy numeric world-info placement values', async () => {
    const result = await transformWorldInfoEntriesWithRegex([{ id: 'legacy', content: 'foo' }], [{ findRegex: 'foo', replaceString: 'bar', placement: 5, promptOnly: true }])
    expect(result.contents).toEqual({ legacy: 'bar' })
  })

  it('fails closed for duplicate entry ids instead of overwriting data', async () => {
    const result = await transformWorldInfoEntriesWithRegex([{ id: 'same', content: 'one' }, { id: 'same', content: 'two' }], [{ findRegex: 'one', replaceString: 'changed', placement: [5], promptOnly: true }])
    expect(result.truncated).toBe(true)
    expect(result.diagnostic).toEqual({ code: 'input-truncated' })
  })

  it('fails closed for malformed runtime entries instead of throwing', async () => {
    const result = await transformWorldInfoEntriesWithRegex([
      null as unknown as { id: string; content: string },
    ], [
      { findRegex: 'foo', replaceString: 'bar', placement: [5], promptOnly: true },
    ])

    expect(result.truncated).toBe(true)
    expect(result.contents).toEqual({ '0': '' })
    expect(result.diagnostic).toEqual({ code: 'input-truncated' })
  })

  it('applies trim strings to numbered, named, and match replacement groups', async () => {
    const result = await transformWorldInfoEntriesWithRegex([
      { id: 'groups', content: 'alpha[secret]' },
    ], [{
      findRegex: '/alpha\\[(?<value>[^\\]]+)\\]/g',
      replaceString: '$1|$<value>|{{match}}',
      trimStrings: ['sec'],
      placement: [5],
      promptOnly: true,
    }])

    expect(result.contents).toEqual({ groups: 'ret|ret|alpha[ret]' })
  })

  it('substitutes replacement macros after capture groups so dollar values stay literal', async () => {
    const result = await transformWorldInfoEntriesWithRegex([
      { id: 'replacement-macro', content: 'foo' },
    ], [{
      findRegex: '/(foo)/g',
      replaceString: '{{user}}-$1',
      placement: [5],
      promptOnly: true,
    }], {
      macroResolver: text => text.replace(/{{user}}/gi, '$1'),
    })

    expect(result.contents).toEqual({ 'replacement-macro': '$1-foo' })
  })

  it('supports ST escaped macro substitution inside find regex patterns', async () => {
    const result = await transformWorldInfoEntriesWithRegex([
      { id: 'escaped-find', content: 'a+b and aaab' },
    ], [{
      findRegex: '{{user}}',
      replaceString: 'hit',
      substituteRegex: 2,
      placement: [5],
      promptOnly: true,
    }], {
      macroResolver: text => text.replace(/{{user}}/gi, 'a+b'),
    })

    expect(result.contents).toEqual({ 'escaped-find': 'hit and aaab' })
  })

  it('preserves ST regex flags instead of forcing global case-insensitive replacement', async () => {
    const transform = async (findRegex: string) => transformWorldInfoEntriesWithRegex([
      { id: 'flags', content: 'foo FOO foo' },
    ], [{ findRegex, replaceString: 'bar', placement: [5], promptOnly: true }])

    await expect(transform('foo')).resolves.toMatchObject({ contents: { flags: 'bar FOO foo' } })
    await expect(transform('/foo/i')).resolves.toMatchObject({ contents: { flags: 'bar FOO foo' } })
    await expect(transform('/foo/gi')).resolves.toMatchObject({ contents: { flags: 'bar bar bar' } })
  })
})
