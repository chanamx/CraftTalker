import { Worker } from 'node:worker_threads'
import { createAbortError, throwIfAborted } from './abort.js'

const WORLD_INFO_PLACEMENT = 5
const MAX_ENTRIES = 256
const MAX_SCRIPTS = 256
const MAX_CONTENT_LENGTH = 200_000
const MAX_TOTAL_CONTENT_LENGTH = 1_000_000
const MAX_PATTERN_LENGTH = 4_096
const MAX_REPLACEMENT_LENGTH = 32_768
const MAX_TRIM_STRINGS = 128
const MAX_TRIM_STRING_LENGTH = 4_096
const MACRO_TOKEN_PATTERN = /\{\{([^}]+)\}\}/g

export interface WorldInfoRegexEntryInput {
  id: string
  content: string
  depth?: number
}

export interface WorldInfoRegexScriptInput {
  findRegex?: unknown
  replaceString?: unknown
  placement?: unknown
  promptOnly?: unknown
  markdownOnly?: unknown
  disabled?: unknown
  minDepth?: unknown
  maxDepth?: unknown
  trimStrings?: unknown
  substituteRegex?: unknown
}

export interface WorldInfoRegexTransformOptions {
  timeoutMs?: number
  macroResolver?: (text: string) => string
  signal?: AbortSignal
}

export interface WorldInfoRegexTransformResult {
  contents: Record<string, string>
  timedOut: boolean
  truncated: boolean
  diagnostic?: RegexTransformDiagnostic
}

export interface RegexTransformDiagnostic {
  code:
    | 'timeout'
    | 'input-truncated'
    | 'worker-error'
    | 'invalid-result'
    | 'worker-exit'
}

interface NormalizedRegexScript {
  findRegex: string
  replaceString: string
  minDepth: number | null
  maxDepth: number | null
  trimStrings: string[]
  replacementMacros: Record<string, string>
}

interface RegexWorkerResult {
  contents: Record<string, string>
}

const REGEX_WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');

function parseRegex(value) {
  const text = String(value || '');
  if (!text) return null;
  try {
    if (text.startsWith('/')) {
      const lastSlash = text.lastIndexOf('/');
      if (lastSlash > 0) {
        const source = text.slice(1, lastSlash);
        const rawFlags = text.slice(lastSlash + 1);
        const flags = [...new Set(rawFlags.split(''))].filter(flag => 'dgimsuvy'.includes(flag)).join('');
        return new RegExp(source, flags);
      }
    }
    return new RegExp(text);
  } catch {
    return null;
  }
}

function filterString(value, trimStrings) {
  let output = String(value || '');
  for (const trimString of trimStrings) {
    output = output.replaceAll(trimString, '');
  }
  return output;
}

function substituteMacros(value, macros) {
  return value.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    return Object.hasOwn(macros, normalizedKey) ? macros[normalizedKey] : match;
  });
}

function replaceMatch(script, args) {
  const groups = args.length > 0 && args[args.length - 1] && typeof args[args.length - 1] === 'object'
    ? args[args.length - 1]
    : undefined;
  const replacement = script.replaceString.replace(/\{\{match\}\}/gi, '$0');
  const withGroups = replacement.replace(/\$(\d+)|\$<([^>]+)>/g, (_, number, groupName) => {
    const captured = number ? args[Number(number)] : groups?.[groupName];
    if (!captured) return '';
    return filterString(captured, script.trimStrings);
  });
  return substituteMacros(withGroups, script.replacementMacros);
}

const contents = {};
for (const entry of workerData.entries) {
  let output = entry.content;
  for (const script of workerData.scripts) {
    if (typeof entry.depth === 'number') {
      if (script.minDepth !== null && entry.depth < script.minDepth) continue;
      if (script.maxDepth !== null && entry.depth > script.maxDepth) continue;
    }
    const regex = parseRegex(script.findRegex);
    if (!regex) continue;
    output = output.replace(regex, (...args) => replaceMatch(script, args));
  }
  contents[entry.id] = output;
}
parentPort.postMessage({ contents });
`

export async function transformWorldInfoEntriesWithRegex(
  entries: WorldInfoRegexEntryInput[],
  scripts: WorldInfoRegexScriptInput[],
  options: WorldInfoRegexTransformOptions = {},
): Promise<WorldInfoRegexTransformResult> {
  throwIfAborted(options.signal, 'World-info Regex transform aborted')
  const originals = originalContents(entries)
  const normalizedEntries = normalizeEntries(entries)
  const normalizedScripts = normalizeScripts(scripts, options.macroResolver)
  throwIfAborted(options.signal, 'World-info Regex transform aborted')
  const truncated = normalizedEntries === null || normalizedScripts === null
  if (truncated || normalizedEntries.length === 0 || normalizedScripts.length === 0) {
    return {
      contents: originals,
      timedOut: false,
      truncated,
      ...(truncated ? { diagnostic: { code: 'input-truncated' } as const } : {}),
    }
  }

  const timeoutMs = Math.min(2_000, Math.max(10, Math.floor(options.timeoutMs ?? 500)))
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const worker = new Worker(REGEX_WORKER_SOURCE, {
      eval: true,
      workerData: { entries: normalizedEntries, scripts: normalizedScripts },
      resourceLimits: {
        maxOldGenerationSizeMb: 32,
        maxYoungGenerationSizeMb: 8,
        stackSizeMb: 2,
      },
      name: 'crafttalker-world-info-regex',
    })

    const cleanUp = async () => {
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      worker.removeAllListeners()
      await worker.terminate().catch(() => {})
    }
    const finish = (result: WorldInfoRegexTransformResult) => {
      if (settled) return
      settled = true
      void cleanUp().then(() => resolve(result))
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      void cleanUp().then(() => reject(error))
    }
    const fallback = (code: RegexTransformDiagnostic['code']) => finish({
      contents: originals,
      timedOut: false,
      truncated: false,
      diagnostic: { code },
    })
    const onAbort = () => fail(createAbortError(options.signal, 'World-info Regex transform aborted'))
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) return onAbort()

    timer = setTimeout(() => {
      finish({
        contents: originals,
        timedOut: true,
        truncated: false,
        diagnostic: { code: 'timeout' },
      })
    }, timeoutMs)

    worker.once('message', (message: RegexWorkerResult) => {
      if (!message || !isStringRecord(message.contents)) return fallback('invalid-result')
      const transformed = Object.fromEntries(
        Object.entries(message.contents).filter(([id]) => Object.hasOwn(originals, id)),
      )
      finish({ contents: { ...originals, ...transformed }, timedOut: false, truncated: false })
    })
    worker.once('error', () => fallback('worker-error'))
    worker.once('exit', (code) => {
      if (code !== 0) fallback('worker-exit')
    })
  })
}

function originalContents(entries: WorldInfoRegexEntryInput[]): Record<string, string> {
  if (!Array.isArray(entries)) return {}
  return Object.fromEntries(entries.map((entry, index) => {
    const record = entry && typeof entry === 'object' ? entry as Partial<WorldInfoRegexEntryInput> : {}
    return [String(record.id ?? index), String(record.content ?? '')]
  }))
}

function normalizeEntries(entries: WorldInfoRegexEntryInput[]): WorldInfoRegexEntryInput[] | null {
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) return null
  let totalLength = 0
  const normalized: WorldInfoRegexEntryInput[] = []
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const id = String(entry?.id ?? '')
    if (normalized.some(existing => existing.id === id)) return null
    const content = String(entry?.content ?? '')
    if (!id || content.length > MAX_CONTENT_LENGTH) return null
    totalLength += content.length
    if (totalLength > MAX_TOTAL_CONTENT_LENGTH) return null
    normalized.push({
      id,
      content,
      depth: Number.isFinite(entry.depth) ? Number(entry.depth) : undefined,
    })
  }
  return normalized
}

function normalizeScripts(
  scripts: WorldInfoRegexScriptInput[],
  macroResolver?: (text: string) => string,
): NormalizedRegexScript[] | null {
  if (!Array.isArray(scripts) || scripts.length > MAX_SCRIPTS) return null
  const normalized: NormalizedRegexScript[] = []
  for (const script of scripts) {
    if (!script || typeof script !== 'object' || script.disabled === true) continue
    const placements = Array.isArray(script.placement)
      ? script.placement.map(Number)
      : Number.isFinite(Number(script.placement)) ? [Number(script.placement)] : []
    if (!placements.includes(WORLD_INFO_PLACEMENT) || script.promptOnly !== true) continue
    const findRegex = resolveFindRegex(
      String(script.findRegex ?? ''),
      Number(script.substituteRegex),
      macroResolver,
    )
    const replaceString = String(script.replaceString ?? '')
    if (!findRegex) continue
    if (findRegex.length > MAX_PATTERN_LENGTH || replaceString.length > MAX_REPLACEMENT_LENGTH) return null
    const trimStrings = normalizeTrimStrings(script.trimStrings, macroResolver)
    const replacementMacros = collectReplacementMacros(replaceString, macroResolver)
    if (trimStrings === null || replacementMacros === null) return null
    normalized.push({
      findRegex,
      replaceString,
      minDepth: finiteBound(script.minDepth, -1),
      maxDepth: finiteBound(script.maxDepth, 0),
      trimStrings,
      replacementMacros,
    })
  }
  return normalized
}

function resolveFindRegex(
  findRegex: string,
  substituteRegex: number,
  macroResolver?: (text: string) => string,
): string {
  if (!macroResolver || (substituteRegex !== 1 && substituteRegex !== 2)) return findRegex
  return findRegex.replace(MACRO_TOKEN_PATTERN, (match) => {
    const resolved = macroResolver(match)
    if (resolved === match) return match
    return substituteRegex === 2 ? escapeRegexMacro(resolved) : resolved
  })
}

function escapeRegexMacro(value: string): string {
  return value.replace(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/gs, character => {
    switch (character) {
      case '\n': return '\\n'
      case '\r': return '\\r'
      case '\t': return '\\t'
      case '\v': return '\\v'
      case '\f': return '\\f'
      case '\0': return '\\0'
      default: return `\\${character}`
    }
  })
}

function normalizeTrimStrings(
  value: unknown,
  macroResolver?: (text: string) => string,
): string[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_TRIM_STRINGS) return null
  const normalized = value.map(item => macroResolver?.(String(item ?? '')) ?? String(item ?? ''))
  return normalized.some(item => item.length > MAX_TRIM_STRING_LENGTH) ? null : normalized
}

function collectReplacementMacros(
  replaceString: string,
  macroResolver?: (text: string) => string,
): Record<string, string> | null {
  if (!macroResolver || !replaceString.includes('{{')) return {}
  const macros: Record<string, string> = {}
  let totalLength = 0
  for (const match of replaceString.matchAll(MACRO_TOKEN_PATTERN)) {
    const token = match[0]
    if (/^\{\{match\}\}$/i.test(token)) continue
    const resolved = macroResolver(token)
    if (resolved === token) continue
    totalLength += resolved.length
    if (totalLength > MAX_REPLACEMENT_LENGTH) return null
    macros[String(match[1] ?? '').trim().toLowerCase()] = resolved
  }
  return macros
}

function finiteBound(value: unknown, minimum: number): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : null
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value).every(item => typeof item === 'string')
}
