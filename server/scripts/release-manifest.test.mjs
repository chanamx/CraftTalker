import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createReleaseManifest, verifyReleaseManifest } from './release-manifest.mjs'

describe('release manifest', () => {
  it('creates a stable fingerprint and verifies exact artifact contents', async () => {
    const distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crafttalker-release-'))
    try {
      await fs.mkdir(path.join(distDir, 'nested'))
      await fs.writeFile(path.join(distDir, 'index.js'), 'console.log("ok")\n')
      await fs.writeFile(path.join(distDir, 'nested', 'module.js'), 'export const value = 1\n')

      const first = await createReleaseManifest({
        distDir,
        packageVersion: '1.2.3',
        revision: 'test-revision',
      })
      const second = await createReleaseManifest({
        distDir,
        packageVersion: '1.2.3',
        revision: 'test-revision',
      })

      expect(second.fingerprint).toBe(first.fingerprint)
      expect(second.files.map(file => file.path)).toEqual(['index.js', 'nested/module.js'])
      await expect(verifyReleaseManifest(distDir)).resolves.toMatchObject({ fingerprint: first.fingerprint })
    } finally {
      await fs.rm(distDir, { recursive: true, force: true })
    }
  })

  it('rejects modified, missing, or extra files', async () => {
    const distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crafttalker-release-tamper-'))
    try {
      await fs.writeFile(path.join(distDir, 'index.js'), 'original\n')
      await createReleaseManifest({ distDir, packageVersion: '1.0.0' })
      await fs.writeFile(path.join(distDir, 'index.js'), 'modified\n')
      await expect(verifyReleaseManifest(distDir)).rejects.toThrow(/hash mismatch/i)

      await fs.writeFile(path.join(distDir, 'index.js'), 'original\n')
      await fs.writeFile(path.join(distDir, 'extra.js'), 'extra\n')
      await expect(verifyReleaseManifest(distDir)).rejects.toThrow(/file set mismatch/i)
    } finally {
      await fs.rm(distDir, { recursive: true, force: true })
    }
  })
})
