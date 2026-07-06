#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginRoot = path.join(rootDir, 'server', 'data', 'extensions', 'third-party')
const compatRoot = path.join(rootDir, 'public', 'scripts', 'compat')
const targetPlugins = ['JS-Slash-Runner', 'LittleWhiteBox', 'ST-Prompt-Template']
const sourceExtensions = new Set(['.js', '.mjs', '.ts', '.tsx'])
const skipDirs = new Set(['.git', 'node_modules', 'coverage'])
const maxFileBytes = 2 * 1024 * 1024
const rootPublicScripts = new Set(['script.js', 'lib.js', 'char-data.js', 'reasoning.js', 'tags.js'])

const exportCache = new Map()
const findings = []
let scannedFiles = 0
let skippedLargeFiles = 0
let checkedImports = 0
let namespaceOrDefaultImports = 0

for (const pluginName of targetPlugins) {
  const pluginDir = path.join(pluginRoot, pluginName)
  if (!fs.existsSync(pluginDir)) {
    findings.push({ pluginName, file: pluginDir, line: 0, specifier: '', missing: ['plugin directory missing'] })
    continue
  }

  for (const file of walkSourceFiles(pluginDir)) {
    const stat = fs.statSync(file)
    if (stat.size > maxFileBytes) {
      skippedLargeFiles += 1
      continue
    }

    scannedFiles += 1
    const content = fs.readFileSync(file, 'utf8')
    const rel = toPosix(path.relative(pluginDir, file))
    const browserPath = `/scripts/extensions/third-party/${pluginName}/${rel}`
    auditNamedImports(pluginName, file, browserPath, content)
    auditModulePresence(pluginName, file, browserPath, content)
  }
}

if (findings.length) {
  console.error('ST public-shim audit found compatibility gaps:\n')
  for (const finding of findings) {
    const location = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file
    const target = finding.specifier ? ` from ${finding.specifier}` : ''
    console.error(`- ${location}${target}`)
    console.error(`  missing: ${finding.missing.join(', ')}`)
  }
  console.error('')
  printSummary()
  process.exit(1)
}

printSummary()

function walkSourceFiles(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) files.push(...walkSourceFiles(fullPath))
      continue
    }
    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath)
    }
  }
  return files
}

function auditNamedImports(pluginName, file, browserPath, content) {
  const patterns = [
    /\bimport\s+(?!type\b)(?:[^'";{}]+,\s*)?\{([^{}]*?)\}\s*from\s*['"]([^'"]+)['"]/g,
    /\bexport\s+\{([^{}]*?)\}\s*from\s*['"]([^'"]+)['"]/g,
    /\b(?:const|let|var)\s+\{([^{}\r\n]*?)\}\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[2]
      const target = resolveCompatTarget(specifier, browserPath)
      if (!target) continue

      const line = lineNumber(content, match.index ?? 0)
      if (!target.exists) {
        findings.push({ pluginName, file, line, specifier, missing: [`module ${target.compatPath}`] })
        continue
      }

      const imported = parseNamedList(match[1])
      if (!imported.length) continue
      checkedImports += imported.length

      const exported = getCompatExports(target.compatPath)
      const missing = imported.filter(name => name !== 'default' && !exported.has(name))
      if (missing.length) {
        findings.push({ pluginName, file, line, specifier, missing })
      }
    }
  }
}

function auditModulePresence(pluginName, file, browserPath, content) {
  const pattern = /\bimport\s+(?!type\b)(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g
  for (const match of content.matchAll(pattern)) {
    const specifier = match[1]
    const target = resolveCompatTarget(specifier, browserPath)
    if (!target) continue
    if (!target.exists) {
      findings.push({
        pluginName,
        file,
        line: lineNumber(content, match.index ?? 0),
        specifier,
        missing: [`module ${target.compatPath}`],
      })
    } else if (!match[0].includes('{')) {
      namespaceOrDefaultImports += 1
    }
  }
}

function resolveCompatTarget(specifier, browserPath) {
  if (!specifier || /^[a-z][a-z\d+.-]*:/i.test(specifier)) return null
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null

  let pathname
  try {
    pathname = new URL(specifier, `https://crafttalker.local${browserPath}`).pathname
  } catch {
    return null
  }

  if (pathname.startsWith('/scripts/extensions/third-party/')) return null

  let compatPath = null
  if (pathname.startsWith('/scripts/')) {
    compatPath = pathname.slice('/scripts/'.length)
  } else {
    const rootName = pathname.replace(/^\//, '')
    if (rootPublicScripts.has(rootName)) compatPath = rootName
  }

  if (!compatPath) return null
  compatPath = toPosix(compatPath)
  return { compatPath, exists: fs.existsSync(path.join(compatRoot, compatPath)) }
}

function getCompatExports(compatPath) {
  if (exportCache.has(compatPath)) return exportCache.get(compatPath)

  const filePath = path.join(compatRoot, compatPath)
  const content = fs.readFileSync(filePath, 'utf8')
  const exports = new Set()

  for (const pattern of [
    /\bexport\s+(?:async\s+)?function\s+([\w$]+)/g,
    /\bexport\s+class\s+([\w$]+)/g,
    /\bexport\s+(?:const|let|var)\s+([\w$]+)/g,
  ]) {
    for (const match of content.matchAll(pattern)) exports.add(match[1])
  }

  for (const match of content.matchAll(/\bexport\s+\{([\s\S]*?)\}(?:\s*from\s*['"][^'"]+['"])?/g)) {
    for (const name of parseExportList(match[1])) exports.add(name)
  }

  exportCache.set(compatPath, exports)
  return exports
}

function parseNamedList(text) {
  return cleanList(text)
    .map(item => item.replace(/^type\s+/, '').split(/\s+as\s+/i)[0]?.trim())
    .filter(Boolean)
}

function parseExportList(text) {
  return cleanList(text)
    .map((item) => {
      const parts = item.replace(/^type\s+/, '').split(/\s+as\s+/i).map(part => part.trim()).filter(Boolean)
      return parts[1] ?? parts[0]
    })
    .filter(Boolean)
}

function cleanList(text) {
  return String(text ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .split(',')
    .map(item => item.trim())
    .filter(item => item && !item.startsWith('type '))
}

function lineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length
}

function toPosix(value) {
  return value.replaceAll(path.sep, '/')
}

function printSummary() {
  console.log(`ST public-shim audit passed: ${scannedFiles} files, ${checkedImports} named imports checked, ${namespaceOrDefaultImports} namespace/default imports checked.`)
  if (skippedLargeFiles) {
    console.log(`Skipped ${skippedLargeFiles} large generated/vendor files over ${Math.round(maxFileBytes / 1024 / 1024)} MiB.`)
  }
}
