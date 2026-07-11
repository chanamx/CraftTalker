#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const jsonOutput = args.has('--json')

const files = collectFiles(rootDir)
const categories = [
  {
    name: 'Dependencies',
    note: 'Local installs; not part of release output.',
    match: (rel) => rel.split('/').includes('node_modules'),
  },
  {
    name: 'Runtime data',
    note: 'User data, audit fixtures, extension checkouts; move with LUKER_DATA_DIR when needed.',
    match: (rel) => rel === 'server/data/.gitkeep' ? false : rel.startsWith('server/data/'),
  },
  {
    name: 'Build output',
    note: 'Rebuildable artifacts.',
    match: (rel) => rel.startsWith('dist/') || rel.startsWith('dist-ssr/') || rel.startsWith('server/dist/'),
  },
  {
    name: 'Logs and screenshots',
    note: 'Debug output; safe to rotate after inspection.',
    match: (rel) => rel.startsWith('logs/') || rel.endsWith('.log') || rel.startsWith('.browser-') && rel.endsWith('.png'),
  },
  {
    name: 'Root git history',
    note: 'Repository history.',
    match: (rel) => rel.startsWith('.git/'),
  },
  {
    name: 'Source and docs',
    note: 'Approximate core project footprint after excluding generated/runtime assets.',
    match: () => true,
  },
]

const categoryRows = summarizeCategories(files)
const topLevelRows = summarizeByPrefix(files, '', 12)
const dataRows = summarizeByPrefix(files, 'server/data/', 12)
const thirdPartyRows = summarizeByPrefix(files, 'server/data/extensions/third-party/', 12)
const largestNonDependencyFiles = files
  .filter((file) => !file.rel.split('/').includes('node_modules') && !file.rel.startsWith('.git/'))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 15)
  .map((file) => ({ path: file.rel, size: formatBytes(file.bytes), bytes: file.bytes }))
const nestedGitRows = summarizeNestedGit(files)
const cleanupCandidates = summarizeCleanupCandidates(files, categoryRows, nestedGitRows)

const report = {
  root: rootDir,
  total: summarizeFileSet(files),
  categories: categoryRows,
  topLevel: topLevelRows,
  data: dataRows,
  thirdPartyExtensions: thirdPartyRows,
  nestedGit: nestedGitRows,
  cleanupCandidates,
  largestNonDependencyFiles,
  recommendations: buildRecommendations(categoryRows, thirdPartyRows, nestedGitRows),
}

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printReport(report)
}

function collectFiles(dir) {
  const results = []
  walk(dir, results)
  return results
}

function walk(dir, results) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    let stat
    try {
      stat = fs.lstatSync(fullPath)
    } catch {
      continue
    }

    if (entry.isSymbolicLink()) {
      results.push(makeRecord(fullPath, stat.size))
      continue
    }

    if (entry.isDirectory()) {
      walk(fullPath, results)
      continue
    }

    if (entry.isFile()) {
      results.push(makeRecord(fullPath, stat.size))
    }
  }
}

function makeRecord(fullPath, bytes) {
  return {
    rel: toPosix(path.relative(rootDir, fullPath)),
    bytes,
  }
}

function summarizeCategories(fileSet) {
  const rows = categories.map(({ name, note }) => ({ name, note, files: 0, bytes: 0, size: '0 B' }))

  for (const file of fileSet) {
    const index = categories.findIndex((category) => category.match(file.rel))
    rows[index].files += 1
    rows[index].bytes += file.bytes
  }

  return rows.map((row) => ({ ...row, size: formatBytes(row.bytes) }))
}

function summarizeByPrefix(fileSet, prefix, limit) {
  const groups = new Map()
  for (const file of fileSet) {
    if (prefix && !file.rel.startsWith(prefix)) continue
    const rest = prefix ? file.rel.slice(prefix.length) : file.rel
    const [name] = rest.split('/')
    if (!name) continue
    const current = groups.get(name) ?? { name, files: 0, bytes: 0, size: '0 B' }
    current.files += 1
    current.bytes += file.bytes
    groups.set(name, current)
  }

  return [...groups.values()]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit)
    .map((row) => ({ ...row, size: formatBytes(row.bytes) }))
}

function summarizeNestedGit(fileSet) {
  const groups = new Map()
  for (const file of fileSet) {
    const marker = '/.git/'
    const index = file.rel.indexOf(marker)
    if (index <= 0) continue
    const name = file.rel.slice(0, index + marker.length - 1)
    const current = groups.get(name) ?? { path: name, files: 0, bytes: 0, size: '0 B' }
    current.files += 1
    current.bytes += file.bytes
    groups.set(name, current)
  }

  return [...groups.values()]
    .sort((a, b) => b.bytes - a.bytes)
    .map((row) => ({ ...row, size: formatBytes(row.bytes) }))
}

function summarizeCleanupCandidates(fileSet, categoryRows, nestedGitRows) {
  const categoryByName = new Map(categoryRows.map((row) => [row.name, row]))
  const rows = [
    makeCandidate(
      'Nested third-party .git histories',
      nestedGitRows.reduce((sum, row) => sum + row.bytes, 0),
      nestedGitRows.reduce((sum, row) => sum + row.files, 0),
      'Replace checkouts with shallow snapshots or archives.',
    ),
    summarizeMatchingCandidate(
      fileSet,
      'Third-party extension sourcemaps',
      (rel) => rel.startsWith('server/data/extensions/third-party/') && rel.endsWith('.map'),
      'Keep only while actively debugging extension bundles.',
    ),
    summarizeMatchingCandidate(
      fileSet,
      'Server dependency install',
      (rel) => rel.startsWith('server/node_modules/'),
      'Can be removed and reinstalled; workspaces could avoid duplication.',
    ),
    makeCandidate(
      'Build output',
      categoryByName.get('Build output')?.bytes ?? 0,
      categoryByName.get('Build output')?.files ?? 0,
      'Rebuildable with npm scripts.',
    ),
    makeCandidate(
      'Logs and screenshots',
      categoryByName.get('Logs and screenshots')?.bytes ?? 0,
      categoryByName.get('Logs and screenshots')?.files ?? 0,
      'Rotate after inspection.',
    ),
  ]

  return rows
    .filter((row) => row.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .map((row) => ({ ...row, size: formatBytes(row.bytes) }))
}

function summarizeMatchingCandidate(fileSet, name, match, note) {
  const matched = fileSet.filter((file) => match(file.rel))
  const bytes = matched.reduce((sum, file) => sum + file.bytes, 0)
  return makeCandidate(name, bytes, matched.length, note)
}

function makeCandidate(name, bytes, files, note) {
  return { name, bytes, files, size: '0 B', note }
}

function summarizeFileSet(fileSet) {
  const bytes = fileSet.reduce((sum, file) => sum + file.bytes, 0)
  return { files: fileSet.length, bytes, size: formatBytes(bytes) }
}

function buildRecommendations(categoryRows, thirdPartyRows, nestedGitRows) {
  const byName = new Map(categoryRows.map((row) => [row.name, row]))
  const recommendations = []
  const runtimeData = byName.get('Runtime data')?.bytes ?? 0
  const dependencies = byName.get('Dependencies')?.bytes ?? 0
  const buildOutput = byName.get('Build output')?.bytes ?? 0
  const sourceAndDocs = byName.get('Source and docs')?.bytes ?? 0

  if (runtimeData > 50 * 1024 * 1024) {
    recommendations.push('Move large server/data payloads to an external LUKER_DATA_DIR or keep only small fixtures in the repo workspace.')
  }
  if (nestedGitRows.length > 0) {
    recommendations.push('Replace third-party extension git checkouts with shallow snapshots, archives, or on-demand downloads; nested .git directories are pure audit overhead.')
  }
  if (thirdPartyRows.some((row) => row.bytes > 25 * 1024 * 1024)) {
    recommendations.push('Trim extension fixture dist sourcemaps and rebuild caches when they are not needed for compatibility debugging.')
  }
  if (dependencies > 250 * 1024 * 1024) {
    recommendations.push('Consider npm workspaces or a single install root to avoid duplicate frontend/server dependency trees.')
  }
  if (buildOutput > 25 * 1024 * 1024) {
    recommendations.push('Exclude dist/server dist from packaged source archives and regenerate them during release builds.')
  }
  if (sourceAndDocs > 25 * 1024 * 1024) {
    recommendations.push('Review tracked or unignored source/docs assets; the core project footprint is above the suggested soft budget.')
  }

  return recommendations
}

function printReport(data) {
  console.log(`CraftTalker size audit: ${data.root}`)
  console.log(`Total workspace: ${data.total.size} across ${data.total.files} files`)
  console.log('')

  printTable('By category', data.categories, ['name', 'size', 'files', 'note'])
  printTable('Top-level directories/files', data.topLevel, ['name', 'size', 'files'])

  if (data.data.length > 0) {
    printTable('server/data breakdown', data.data, ['name', 'size', 'files'])
  }
  if (data.thirdPartyExtensions.length > 0) {
    printTable('Third-party extension fixtures', data.thirdPartyExtensions, ['name', 'size', 'files'])
  }
  if (data.nestedGit.length > 0) {
    printTable('Nested git histories', data.nestedGit, ['path', 'size', 'files'])
  }

  printTable('Cleanup candidates', data.cleanupCandidates, ['name', 'size', 'files', 'note'])
  printTable('Largest non-dependency files', data.largestNonDependencyFiles, ['path', 'size'])

  console.log('Recommendations')
  if (data.recommendations.length === 0) {
    console.log('- No size-budget warnings.')
  } else {
    for (const item of data.recommendations) console.log(`- ${item}`)
  }
}

function printTable(title, rows, columns) {
  console.log(title)
  if (rows.length === 0) {
    console.log('- none')
    console.log('')
    return
  }

  const widths = Object.fromEntries(columns.map((column) => [
    column,
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? '').length)),
  ]))
  console.log(columns.map((column) => String(column).padEnd(widths[column])).join('  '))
  console.log(columns.map((column) => '-'.repeat(widths[column])).join('  '))
  for (const row of rows) {
    console.log(columns.map((column) => String(row[column] ?? '').padEnd(widths[column])).join('  '))
  }
  console.log('')
}

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}
