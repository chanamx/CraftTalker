import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { evaluateBuildSizeBudget, readSizeBudgets } from './size-budget.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('release size budget', () => {
  it('fails closed when the build output is missing', () => {
    const result = evaluateBuildSizeBudget(path.join(os.tmpdir(), 'missing-crafttalker-dist'), readSizeBudgets({}))

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('Build output is missing: dist')
  })

  it('checks main, ST host, and total release budgets independently', () => {
    const distDir = makeDist({
      'assets/main-test.js': 'main bundle content',
      'assets/st-extension-host-test.js': 'ST host bundle content',
      'assets/other.js': 'other release content',
    })
    const result = evaluateBuildSizeBudget(distDir, {
      mainGzipBytes: 1,
      stHostGzipBytes: 1,
      releaseBytes: 1,
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('main gzip'),
      expect.stringContaining('ST host gzip'),
      expect.stringContaining('release build'),
    ]))
  })

  it('accepts positive integer environment overrides', () => {
    expect(readSizeBudgets({
      CRAFTTALKER_MAX_MAIN_GZIP_BYTES: '123',
      CRAFTTALKER_MAX_ST_HOST_GZIP_BYTES: '456',
      CRAFTTALKER_MAX_RELEASE_BYTES: '789',
    })).toEqual({ mainGzipBytes: 123, stHostGzipBytes: 456, releaseBytes: 789 })
  })
})

function makeDist(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'crafttalker-size-budget-'))
  temporaryDirectories.push(directory)
  for (const [relativePath, body] of Object.entries(files)) {
    const filePath = path.join(directory, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, body)
  }
  return directory
}
