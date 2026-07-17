import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReleaseManifest } from './release-manifest.mjs'

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.resolve(serverDir, 'dist')
const expectedDistDir = path.join(serverDir, 'dist')

if (distDir !== expectedDistDir || path.dirname(distDir) !== serverDir) {
  throw new Error(`Refusing to clean unexpected build directory: ${distDir}`)
}

fs.rmSync(distDir, { recursive: true, force: true })

const tscPath = path.join(serverDir, 'node_modules', 'typescript', 'bin', 'tsc')
const result = spawnSync(process.execPath, [tscPath, '-p', 'tsconfig.build.json'], {
  cwd: serverDir,
  stdio: 'inherit',
})

if (result.error) throw result.error
if (result.status !== 0) {
  process.exitCode = result.status ?? 1
} else {
  const packageJson = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf8'))
  const manifest = await createReleaseManifest({
    distDir,
    packageVersion: packageJson.version,
    revision: process.env.CRAFTTALKER_BUILD_REVISION?.trim() || undefined,
  })
  console.log(`Built ${manifest.artifact} ${manifest.packageVersion} (${manifest.fingerprint}).`)
}
