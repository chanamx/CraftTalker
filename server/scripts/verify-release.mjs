import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyReleaseManifest } from './release-manifest.mjs'

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = await verifyReleaseManifest(path.join(serverDir, 'dist'))
console.log(`Verified ${manifest.artifact} ${manifest.packageVersion} (${manifest.fingerprint}).`)
