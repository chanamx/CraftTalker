#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const rootDir = path.resolve(path.dirname(scriptPath), '..')
const pluginRoot = path.join(rootDir, 'server', 'data', 'extensions', 'third-party')
const targetPlugins = ['JS-Slash-Runner', 'LittleWhiteBox', 'ST-Prompt-Template']
const sourceExtensions = new Set(['.js', '.mjs', '.ts', '.tsx', '.vue', '.html'])
const skippedDirectories = new Set([
  '.git',
  'coverage',
  'dist',
  'docs',
  'node_modules',
  'references',
  'test',
  'tests',
])
const maxFileBytes = 2 * 1024 * 1024

export const endpointCapabilityRules = [
  rule('extension-management', 'blocked', /^\/api\/extensions\/(?:install|update|delete|move|branches|switch)(?:\/|$)/,
    'Extension mutation remains blocked pending source validation, consent, sandboxing, and an operation journal.'),
  rule('resource-loading', 'read-only', /^(?:\/version|\/api\/extensions\/(?:discover|version))(?:\/|$)/,
    'Local manifest discovery and version snapshots do not perform git or network mutation.'),
  rule('character-api', 'constrained-write', /^\/api\/characters\/(?:create|edit|import|export)(?:\/|$)/,
    'Character routes validate typed fields, safe files, and local target paths.'),
  rule('chat-history-api', 'blocked', /^\/api\/chats\/group\/get(?:\/|$)/,
    'Group chat access is blocked until CraftTalker has a native group-chat model.'),
  rule('chat-history-api', 'constrained-write', /^\/api\/chats\/(?:get|import)(?:\/|$)/,
    'History reads are scoped and imports use strict JSONL parsing without overwrite.'),
  rule('persona-avatar-api', 'constrained-write', /^\/api\/avatars\/(?:get|upload|delete)(?:\/|$)/,
    'Persona images are restricted to validated local image files and safe names.'),
  rule('generation-api', 'governed-provider', /^\/api\/backends\/chat-completions\/(?:status|generate|models)(?:\/|$)/,
    'Provider calls use CraftTalker routing and key-session boundaries.'),
  rule('generation-api', 'read-only', /^\/api\/openai\/models(?:\/|$)/,
    'Fallback model metadata does not expose provider keys.'),
  rule('generation-api', 'read-only', /^\/api\/tokenizers\/(?:claude\/encode|openai\/count)(?:\/|$)/,
    'Tokenizer compatibility performs local counting only.'),
  rule('worldbook-api', 'constrained-write', /^\/api\/(?:worldinfo\/(?:get|check|edit|save)|settings\/get)(?:\/|$)/,
    'Worldbook access is scoped to typed native bridges and preserved source data.'),
  rule('user-file-storage', 'constrained-write', /^(?:\/api\/files\/(?:upload|delete)|\/user\/files\/\*)(?:\/|$)/,
    'Extension-owned storage is restricted by filename, type, size, and safe local paths.'),
  rule('image-and-cors-proxy', 'opt-in', /^\/api\/sd\/(?:ping|comfy\/ping)(?:\/|$)/,
    'Only exact allowlisted image-backend health probes can be enabled.'),
  rule('image-and-cors-proxy', 'blocked', /^\/api\/sd(?:\/|$)/,
    'Image generation, model listing, and arbitrary SD/Comfy forwarding remain blocked.'),
  rule('image-and-cors-proxy', 'opt-in', /^\/cors(?:\/|$)/,
    'HTTPS GET/HEAD proxying requires an explicit host allowlist and SSRF checks.'),
  rule('character-api', 'read-only', /^(?:\/characters\/\*|\/thumbnail(?:\*|$))(?:\/|$)/,
    'Legacy character and thumbnail reads resolve only validated local assets.'),
  rule('persona-avatar-api', 'read-only', /^\/User Avatars\/\*(?:\/|$)/,
    'Legacy persona avatar reads resolve only validated local image files.'),
]

export const riskPolicies = {
  'browser-worker': {
    capabilityId: 'trusted-browser-extension-runtime',
    policy: 'browser-trusted',
    note: 'Workers execute only inside the already trusted browser extension runtime.',
  },
  'direct-external-network': {
    capabilityId: 'trusted-browser-extension-runtime',
    policy: 'browser-trusted',
    note: 'Direct browser egress is visible as a trust capability and is not proxied through native secrets.',
  },
  'dynamic-code': {
    capabilityId: 'trusted-browser-extension-runtime',
    policy: 'browser-trusted',
    note: 'Dynamic JavaScript remains confined to user-trusted compatibility mode and never becomes a native system API.',
  },
  'iframe-code': {
    capabilityId: 'trusted-browser-extension-runtime',
    policy: 'browser-trusted',
    note: 'Plugin iframe/srcdoc execution remains part of the trusted browser runtime.',
  },
  'taskjs-system': {
    capabilityId: 'unsafe-script-runtime',
    policy: 'blocked',
    note: 'TaskJS and system-level execution are not exposed by CraftTalker.',
  },
}

const pluginCapabilityAllowlist = {
  'JS-Slash-Runner': new Set([
    'character-api:constrained-write',
    'character-api:read-only',
    'chat-history-api:blocked',
    'chat-history-api:constrained-write',
    'extension-management:blocked',
    'generation-api:governed-provider',
    'persona-avatar-api:constrained-write',
    'persona-avatar-api:read-only',
    'resource-loading:read-only',
    'worldbook-api:constrained-write',
  ]),
  LittleWhiteBox: new Set([
    'character-api:read-only',
    'extension-management:blocked',
    'generation-api:governed-provider',
    'generation-api:read-only',
    'image-and-cors-proxy:blocked',
    'image-and-cors-proxy:opt-in',
    'resource-loading:read-only',
    'user-file-storage:constrained-write',
    'worldbook-api:constrained-write',
  ]),
  'ST-Prompt-Template': new Set([]),
}

const pluginRiskAllowlist = {
  'JS-Slash-Runner': new Set(['browser-worker', 'direct-external-network', 'dynamic-code', 'iframe-code']),
  LittleWhiteBox: new Set(['browser-worker', 'direct-external-network', 'dynamic-code', 'iframe-code']),
  'ST-Prompt-Template': new Set(['browser-worker', 'dynamic-code', 'iframe-code']),
}

export function normalizeEndpointLiteral(value) {
  let endpoint = String(value ?? '').trim()
  if (!endpoint || /^[a-z][a-z\d+.-]*:/i.test(endpoint) || endpoint.startsWith('//')) return null

  endpoint = endpoint.replace(/^\.\//, '/')
  endpoint = endpoint.replace(/\$\{[^}]*\}/g, '*')
  endpoint = endpoint.split(/[?#]/, 1)[0] ?? ''
  endpoint = endpoint.replace(/\\\//g, '/')
  endpoint = endpoint.replace(/\/{2,}/g, '/')
  if (endpoint === '/api/' || endpoint === '/api/*') return null

  const accepted = [
    '/api/',
    '/cors',
    '/version',
    '/user/files/',
    '/User Avatars/',
    '/characters/',
    '/thumbnail',
  ]
  if (!accepted.some(prefix => endpoint === prefix || endpoint.startsWith(prefix))) return null

  if (endpoint.endsWith('/')) endpoint += '*'
  return endpoint
}

export function extractEndpointLiterals(source) {
  const endpoints = new Set()
  for (const literal of collectStringLiterals(String(source ?? ''))) {
    const endpoint = normalizeEndpointLiteral(literal)
    if (endpoint) endpoints.add(endpoint)
  }
  return [...endpoints].sort(compareText)
}

function collectStringLiterals(source) {
  const literals = []
  let index = 0

  while (index < source.length) {
    const quote = source[index]
    if (quote !== "'" && quote !== '"' && quote !== '`') {
      index += 1
      continue
    }

    const start = index + 1
    index = start
    let escaped = false
    while (index < source.length) {
      const character = source[index]
      if (escaped) {
        escaped = false
        index += 1
        continue
      }
      if (character === '\\') {
        escaped = true
        index += 1
        continue
      }
      if (character === quote) {
        literals.push(source.slice(start, index))
        index += 1
        break
      }
      if (quote !== '`' && (character === '\n' || character === '\r')) {
        break
      }
      index += 1
    }
  }

  return literals
}

export function classifyEndpoint(endpoint) {
  return endpointCapabilityRules.find(entry => entry.pattern.test(endpoint)) ?? null
}

export function extractRiskSignals(source) {
  const text = String(source ?? '')
  const detectors = [
    ['browser-worker', /\b(?:new\s+)?(?:Shared)?Worker\s*\(/],
    ['direct-external-network', /\b(?:fetch|open)\s*\(\s*['"`]https?:\/\//],
    ['dynamic-code', /(?:\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\()/],
    ['iframe-code', /\b(?:srcdoc|document\.write)\b/],
    ['taskjs-system', /(?:\bTaskJS\b|\bchild_process\b|\bDeno\.(?:run|Command)\b|\bBun\.spawn\b|\bprocess\.binding\s*\()/],
  ]

  return detectors
    .filter(([, pattern]) => pattern.test(text))
    .map(([kind]) => ({ kind, ...riskPolicies[kind] }))
    .sort((a, b) => compareText(a.kind, b.kind))
}

export function auditTargetPlugins(options = {}) {
  const pluginsDir = options.pluginRoot ?? pluginRoot
  const findings = []
  const plugins = []
  let scannedFiles = 0
  let skippedLargeFiles = 0

  for (const pluginName of targetPlugins) {
    const pluginDir = path.join(pluginsDir, pluginName)
    if (!fs.existsSync(pluginDir)) {
      findings.push({ plugin: pluginName, kind: 'missing-plugin', detail: pluginDir })
      continue
    }

    const endpointMap = new Map()
    const riskMap = new Map()
    for (const file of walkExecutableSourceFiles(pluginDir)) {
      const stat = fs.statSync(file)
      if (stat.size > maxFileBytes) {
        skippedLargeFiles += 1
        continue
      }
      scannedFiles += 1
      const source = fs.readFileSync(file, 'utf8')
      const relativeFile = toPosix(path.relative(pluginDir, file))

      for (const endpoint of extractEndpointLiterals(source)) {
        const classification = classifyEndpoint(endpoint)
        if (!classification) {
          findings.push({ plugin: pluginName, kind: 'unclassified-endpoint', detail: endpoint, file: relativeFile })
          continue
        }
        const grantKey = `${classification.capabilityId}:${classification.policy}`
        if (!pluginCapabilityAllowlist[pluginName]?.has(grantKey)) {
          findings.push({
            plugin: pluginName,
            kind: 'unapproved-plugin-capability',
            detail: `${grantKey}: ${endpoint}`,
            file: relativeFile,
          })
          continue
        }
        const key = grantKey
        const entry = endpointMap.get(key) ?? { ...publicRule(classification), endpoints: new Set(), files: new Set() }
        entry.endpoints.add(endpoint)
        entry.files.add(relativeFile)
        endpointMap.set(key, entry)
      }

      for (const risk of extractRiskSignals(source)) {
        if (!pluginRiskAllowlist[pluginName]?.has(risk.kind)) {
          findings.push({ plugin: pluginName, kind: 'unapproved-risk-signal', detail: risk.kind, file: relativeFile })
          continue
        }
        const entry = riskMap.get(risk.kind) ?? { ...risk, files: new Set() }
        entry.files.add(relativeFile)
        riskMap.set(risk.kind, entry)
      }
    }

    plugins.push({
      name: pluginName,
      capabilities: [...endpointMap.values()].map(serializeSetEntry).sort(sortById),
      risks: [...riskMap.values()].map(serializeSetEntry).sort(sortByKind),
    })
  }

  return { scannedFiles, skippedLargeFiles, findings, plugins }
}

function rule(capabilityId, policy, pattern, note) {
  return { capabilityId, policy, pattern, note }
}

function publicRule(entry) {
  return {
    capabilityId: entry.capabilityId,
    policy: entry.policy,
    note: entry.note,
  }
}

function walkExecutableSourceFiles(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) files.push(...walkExecutableSourceFiles(fullPath))
      continue
    }
    if (!entry.isFile()) continue
    if (!sourceExtensions.has(path.extname(entry.name))) continue
    if (/\.min\.(?:js|mjs)$/.test(entry.name)) continue
    files.push(fullPath)
  }
  return files
}

function serializeSetEntry(entry) {
  return Object.fromEntries(Object.entries(entry).map(([key, value]) => [
    key,
    value instanceof Set ? [...value].sort(compareText) : value,
  ]))
}

function sortById(a, b) {
  return compareText(`${a.capabilityId}:${a.policy}`, `${b.capabilityId}:${b.policy}`)
}

function sortByKind(a, b) {
  return compareText(a.kind, b.kind)
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

function toPosix(value) {
  return value.replaceAll(path.sep, '/')
}

function printHumanReport(report) {
  if (report.findings.length) {
    console.error('ST plugin capability audit found unledgered behavior:\n')
    for (const finding of report.findings) {
      console.error(`- ${finding.plugin}: ${finding.kind}: ${finding.detail}${finding.file ? ` (${finding.file})` : ''}`)
    }
    console.error('')
  }

  for (const plugin of report.plugins) {
    const capabilities = plugin.capabilities.map(item => `${item.capabilityId}[${item.policy}]`).join(', ') || 'none'
    const risks = plugin.risks.map(item => `${item.kind}[${item.policy}]`).join(', ') || 'none'
    console.log(`${plugin.name}: capabilities=${capabilities}; risks=${risks}`)
  }
  console.log(`Scanned ${report.scannedFiles} executable plugin source files; skipped ${report.skippedLargeFiles} oversized files.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const report = auditTargetPlugins()
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
  else printHumanReport(report)
  if (report.findings.length) process.exitCode = 1
}
