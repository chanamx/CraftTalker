import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const RELEASE_MANIFEST_FILE = 'release-manifest.json'

export async function createReleaseManifest({ distDir, packageVersion, revision }) {
  const files = await hashArtifactFiles(distDir)
  const manifest = {
    schemaVersion: 1,
    artifact: 'crafttalker-server',
    packageVersion,
    entrypoint: 'index.js',
    ...(revision ? { revision } : {}),
    fingerprint: aggregateFingerprint(files),
    files,
  }
  await fs.writeFile(
    path.join(distDir, RELEASE_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  return manifest
}

export async function verifyReleaseManifest(distDir) {
  const manifestPath = path.join(distDir, RELEASE_MANIFEST_FILE)
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  validateManifest(manifest)

  const files = await hashArtifactFiles(distDir)
  const expectedPaths = manifest.files.map(file => file.path)
  const actualPaths = files.map(file => file.path)
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error('Release artifact file set mismatch.')
  }

  for (let index = 0; index < files.length; index += 1) {
    const actual = files[index]
    const expected = manifest.files[index]
    if (actual.bytes !== expected.bytes) {
      throw new Error(`Release artifact size mismatch: ${actual.path}`)
    }
    if (actual.sha256 !== expected.sha256) {
      throw new Error(`Release artifact hash mismatch: ${actual.path}`)
    }
  }

  const fingerprint = aggregateFingerprint(files)
  if (fingerprint !== manifest.fingerprint) {
    throw new Error('Release artifact aggregate fingerprint mismatch.')
  }
  return manifest
}

async function hashArtifactFiles(distDir) {
  const paths = await walkFiles(distDir)
  return Promise.all(paths.map(async relativePath => {
    const content = await fs.readFile(path.join(distDir, ...relativePath.split('/')))
    return {
      path: relativePath,
      bytes: content.byteLength,
      sha256: `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`,
    }
  }))
}

async function walkFiles(rootDir, relativeDir = '') {
  const currentDir = path.join(rootDir, relativeDir)
  const entries = await fs.readdir(currentDir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name
    if (entry.isDirectory()) {
      files.push(...await walkFiles(rootDir, relativePath))
    } else if (entry.isFile() && relativePath !== RELEASE_MANIFEST_FILE) {
      files.push(relativePath.split(path.sep).join('/'))
    }
  }
  return files.sort((a, b) => a.localeCompare(b, 'en'))
}

function aggregateFingerprint(files) {
  const stableContent = files
    .map(file => `${file.path}\0${file.bytes}\0${file.sha256}\n`)
    .join('')
  return `sha256:${crypto.createHash('sha256').update(stableContent).digest('hex')}`
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Invalid release manifest.')
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported release manifest schema.')
  if (manifest.artifact !== 'crafttalker-server') throw new Error('Unexpected release artifact name.')
  if (manifest.entrypoint !== 'index.js') throw new Error('Unexpected release entrypoint.')
  if (!Array.isArray(manifest.files)) throw new Error('Invalid release manifest files.')
  if (typeof manifest.fingerprint !== 'string') throw new Error('Invalid release fingerprint.')
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string' || !Number.isSafeInteger(file.bytes) || typeof file.sha256 !== 'string') {
      throw new Error('Invalid release manifest file entry.')
    }
  }
}
