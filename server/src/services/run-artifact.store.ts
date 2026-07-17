import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { safePath, validatePathInBase } from '../lib/path-utils.js'

export const RUN_ARTIFACT_MAX_BYTES = 16 * 1024 * 1024
export type RunOutputArtifactKind = 'partial' | 'final'

export const runOutputArtifactRefSchema = z.object({
  kind: z.enum(['partial', 'final']),
  relativePath: z.string().regex(/^artifacts\/[0-9a-f-]{36}\/(partial|final)-[a-f0-9]{64}\.txt$/),
  bytes: z.number().int().nonnegative().max(RUN_ARTIFACT_MAX_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.string().datetime(),
}).strict()

export const partialRunOutputArtifactRefSchema = runOutputArtifactRefSchema.extend({
  kind: z.literal('partial'),
})
export const finalRunOutputArtifactRefSchema = runOutputArtifactRefSchema.extend({
  kind: z.literal('final'),
})

export type RunOutputArtifactRef = z.infer<typeof runOutputArtifactRefSchema>
export type PartialRunOutputArtifactRef = z.infer<typeof partialRunOutputArtifactRefSchema>
export type FinalRunOutputArtifactRef = z.infer<typeof finalRunOutputArtifactRefSchema>
function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex')
}

export class RunArtifactStore {
  private readonly runsDir: string
  private readonly artifactsDir: string

  constructor(runsDir: string) {
    this.runsDir = path.resolve(runsDir)
    this.artifactsDir = safePath(this.runsDir, 'artifacts')
  }

  write(runId: string, kind: 'partial', content: string): Promise<PartialRunOutputArtifactRef>
  write(runId: string, kind: 'final', content: string): Promise<FinalRunOutputArtifactRef>
  async write(
    runId: string,
    kind: RunOutputArtifactKind,
    content: string,
  ): Promise<RunOutputArtifactRef> {
    const parsedRunId = z.string().uuid().safeParse(runId)
    if (!parsedRunId.success) throw new Error('Invalid run artifact id')

    const body = Buffer.from(content, 'utf8')
    if (body.length > RUN_ARTIFACT_MAX_BYTES) {
      throw new Error(`Run artifact exceeds ${RUN_ARTIFACT_MAX_BYTES} bytes`)
    }

    const directory = safePath(this.artifactsDir, parsedRunId.data)
    await fs.mkdir(directory, { recursive: true })
    if ((await fs.lstat(directory)).isSymbolicLink()) {
      throw new Error('Run artifact directory must not be a symbolic link')
    }

    const digest = sha256(body)
    const fileName = `${kind}-${digest}.txt`
    const filePath = safePath(directory, fileName)
    const tempPath = validatePathInBase(
      path.join(directory, `.${kind}.${crypto.randomUUID()}.tmp`),
      directory,
    )

    try {
      await fs.writeFile(tempPath, body, { flush: kind === 'final' })
      await fs.rename(tempPath, filePath)
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {})
      throw error
    }

    return {
      kind,
      relativePath: `artifacts/${parsedRunId.data}/${fileName}`,
      bytes: body.length,
      sha256: digest,
      updatedAt: new Date().toISOString(),
    }
  }

  async read(input: RunOutputArtifactRef): Promise<string> {
    const parsed = runOutputArtifactRefSchema.safeParse(input)
    if (!parsed.success) throw new Error('Invalid run artifact reference')

    const segments = parsed.data.relativePath.split('/')
    const expectedFile = `${parsed.data.kind}-${parsed.data.sha256}.txt`
    if (segments.length !== 3 || segments[0] !== 'artifacts' || segments[2] !== expectedFile) {
      throw new Error('Invalid run artifact reference')
    }

    const directory = safePath(this.artifactsDir, segments[1])
    if ((await fs.lstat(directory)).isSymbolicLink()) {
      throw new Error('Run artifact directory must not be a symbolic link')
    }
    const filePath = safePath(directory, expectedFile)
    const body = await fs.readFile(filePath)
    if (body.length !== parsed.data.bytes || sha256(body) !== parsed.data.sha256) {
      throw new Error('Run artifact integrity check failed')
    }
    return body.toString('utf8')
  }
}