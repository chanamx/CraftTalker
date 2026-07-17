import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  RUN_ARTIFACT_MAX_BYTES,
  RunArtifactStore,
  type RunOutputArtifactRef,
} from '../services/run-artifact.store.js'

let dataDir = ''
let runsDir = ''
let store: RunArtifactStore

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crafttalker-run-artifact-'))
  runsDir = path.join(dataDir, 'runs')
  store = new RunArtifactStore(runsDir)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('run artifact store', () => {
  it('atomically writes and verifies UTF-8 output artifacts', async () => {
    const runId = crypto.randomUUID()
    const ref = await store.write(runId, 'partial', '你好 world')

    expect(ref.kind).toBe('partial')
    expect(ref.relativePath).toMatch(new RegExp(`^artifacts/${runId}/partial-[a-f0-9]{64}\\.txt$`))
    expect(ref.bytes).toBe(Buffer.byteLength('你好 world', 'utf8'))
    expect(ref.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(await store.read(ref)).toBe('你好 world')

    const replaced = await store.write(runId, 'partial', 'replacement')
    expect(await store.read(replaced)).toBe('replacement')
    expect(fs.readdirSync(path.join(runsDir, 'artifacts', runId))).toHaveLength(2)
  })

  it('rejects oversized output before creating an artifact', async () => {
    const runId = crypto.randomUUID()
    await expect(store.write(runId, 'partial', 'x'.repeat(RUN_ARTIFACT_MAX_BYTES + 1)))
      .rejects.toThrow('exceeds')
    expect(fs.existsSync(path.join(runsDir, 'artifacts', runId))).toBe(false)
  })

  it('rejects escaped and corrupted artifact references', async () => {
    const ref = await store.write(crypto.randomUUID(), 'final', 'trusted')
    const escaped = {
      ...ref,
      relativePath: '../outside.txt',
    } as RunOutputArtifactRef
    await expect(store.read(escaped)).rejects.toThrow('Invalid run artifact reference')

    const absolute = path.join(runsDir, ...ref.relativePath.split('/'))
    fs.writeFileSync(absolute, 'tampered', 'utf8')
    await expect(store.read(ref)).rejects.toThrow('integrity')
  })

  it('flushes final artifacts and removes temp files after rename failure', async () => {
    const realWriteFile = fsPromises.writeFile.bind(fsPromises)
    const writeSpy = vi.spyOn(fsPromises, 'writeFile').mockImplementation((...args) => realWriteFile(...args))
    const ref = await store.write(crypto.randomUUID(), 'final', 'final output')
    expect((writeSpy.mock.calls[0]?.[2] as { flush?: boolean }).flush).toBe(true)
    expect(await store.read(ref)).toBe('final output')

    vi.restoreAllMocks()
    vi.spyOn(fsPromises, 'rename').mockRejectedValueOnce(new Error('simulated rename failure'))
    const failedRunId = crypto.randomUUID()
    await expect(store.write(failedRunId, 'partial', 'partial output')).rejects.toThrow('simulated rename failure')
    const artifactDir = path.join(runsDir, 'artifacts', failedRunId)
    expect(fs.existsSync(artifactDir) ? fs.readdirSync(artifactDir) : []).toEqual([])
  })
})