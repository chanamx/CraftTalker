import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const DEFAULT_MAIN_GZIP_BYTES = 60 * 1024
const DEFAULT_ST_HOST_GZIP_BYTES = 200 * 1024
const DEFAULT_RELEASE_BYTES = 5 * 1024 * 1024

export function readSizeBudgets(environment = process.env) {
  return {
    mainGzipBytes: positiveInteger(environment.CRAFTTALKER_MAX_MAIN_GZIP_BYTES, DEFAULT_MAIN_GZIP_BYTES, 'CRAFTTALKER_MAX_MAIN_GZIP_BYTES'),
    stHostGzipBytes: positiveInteger(environment.CRAFTTALKER_MAX_ST_HOST_GZIP_BYTES, DEFAULT_ST_HOST_GZIP_BYTES, 'CRAFTTALKER_MAX_ST_HOST_GZIP_BYTES'),
    releaseBytes: positiveInteger(environment.CRAFTTALKER_MAX_RELEASE_BYTES, DEFAULT_RELEASE_BYTES, 'CRAFTTALKER_MAX_RELEASE_BYTES'),
  }
}

export function evaluateBuildSizeBudget(distDir, budgets = readSizeBudgets()) {
  if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
    return {
      ok: false,
      budgets,
      measurements: null,
      errors: ['Build output is missing: dist'],
    }
  }

  const files = collectFiles(distDir)
  const mainFiles = files.filter(file => /^assets\/main-[^/]+\.js$/.test(file.relativePath))
  const stHostFiles = files.filter(file => /^assets\/st-extension-host-[^/]+\.js$/.test(file.relativePath))
  const errors = []

  if (mainFiles.length === 0) errors.push('Main bundle is missing: dist/assets/main-*.js')
  if (stHostFiles.length === 0) errors.push('ST extension host bundle is missing: dist/assets/st-extension-host-*.js')

  const measurements = {
    mainGzipBytes: gzipFiles(mainFiles),
    stHostGzipBytes: gzipFiles(stHostFiles),
    releaseBytes: files.reduce((total, file) => total + file.bytes, 0),
    mainFiles: mainFiles.map(file => file.relativePath),
    stHostFiles: stHostFiles.map(file => file.relativePath),
  }

  addExceededError(errors, 'main gzip', measurements.mainGzipBytes, budgets.mainGzipBytes)
  addExceededError(errors, 'ST host gzip', measurements.stHostGzipBytes, budgets.stHostGzipBytes)
  addExceededError(errors, 'release build', measurements.releaseBytes, budgets.releaseBytes)

  return { ok: errors.length === 0, budgets, measurements, errors }
}

function collectFiles(rootDir) {
  const results = []
  const pending = [rootDir]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        pending.push(fullPath)
      } else if (entry.isFile()) {
        results.push({
          fullPath,
          relativePath: path.relative(rootDir, fullPath).split(path.sep).join('/'),
          bytes: fs.statSync(fullPath).size,
        })
      }
    }
  }
  return results
}

function gzipFiles(files) {
  return files.reduce((total, file) => total + gzipSync(fs.readFileSync(file.fullPath)).byteLength, 0)
}

function addExceededError(errors, label, actual, maximum) {
  if (actual > maximum) {
    errors.push(`${label} exceeds budget: ${actual} > ${maximum} bytes`)
  }
}

function positiveInteger(rawValue, fallback, name) {
  if (rawValue === undefined || rawValue === '') return fallback
  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer byte count`)
  }
  return value
}
