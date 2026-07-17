import { optionalHost } from '../../host.js'

export const regex_placement = {
  MD_DISPLAY: 0,
  USER_INPUT: 1,
  AI_OUTPUT: 2,
  SLASH_COMMAND: 3,
  WORLD_INFO: 5,
  REASONING: 6,
}

export const substitute_find_regex = {
  NONE: 0,
  RAW: 1,
  ESCAPED: 2,
}

export function getRegexedString(value, placement = regex_placement.AI_OUTPUT, options = {}) {
  let output = String(value ?? '')
  const host = optionalHost()
  const settings = host?.extension_settings ?? globalThis.extension_settings ?? {}
  if (asArray(settings.disabledExtensions).includes('regex')) return output
  const scripts = getRegexScripts(host)
  if (!scripts.length) return output

  for (const script of scripts) {
    if (!shouldRunRegex(script, placement, options)) continue
    output = runRegexScriptWithHost(script, output, host, options?.characterOverride)
  }

  host?.recordCompatDiagnostic?.(
    'getRegexedString',
    'partial',
    'Applied ST regex placement, find-macro substitution, capture trimming, and replacement macros; preset identity and executable replacement behavior remain partial.',
  )
  return output
}

export function runRegexScript(script, value, { characterOverride } = {}) {
  return runRegexScriptWithHost(script, value, optionalHost(), characterOverride)
}

function runRegexScriptWithHost(script, value, host, characterOverride) {
  const rawString = String(value ?? '')
  if (!script || script.disabled || !script.findRegex || !rawString) return rawString
  const regex = parseFindRegex(resolveFindRegex(script.findRegex, script.substituteRegex, host))
  if (!regex) return rawString

  return rawString.replace(regex, (...args) => {
    const groups = args.length > 0 && args[args.length - 1] && typeof args[args.length - 1] === 'object'
      ? args[args.length - 1]
      : undefined
    const replacement = String(script.replaceString ?? '').replace(/{{match}}/gi, '$0')
    const withGroups = replacement.replace(/\$(\d+)|\$<([^>]+)>/g, (_, number, groupName) => {
      const captured = number ? args[Number(number)] : groups?.[groupName]
      if (!captured) return ''
      return filterString(String(captured), script.trimStrings, host, characterOverride)
    })
    return host?.replaceVariableMacros?.(withGroups) ?? withGroups
  })
}

function getRegexScripts(host) {
  const settings = host?.extension_settings ?? globalThis.extension_settings ?? {}
  const scripts = [...asArray(settings.regex)]
  const context = typeof host?.getContext === 'function' ? host.getContext() : {}
  const character = host?.characters?.[Number(context?.this_chid ?? context?.characterId ?? -1)]
  const characterScripts = character?.data?.extensions?.regex_scripts
  if (Array.isArray(characterScripts)) {
    if (isCharacterRegexAllowed(settings, character)) scripts.push(...characterScripts)
    else host?.recordCompatDiagnostic?.('getRegexedString', 'partial', 'Skipped character regex scripts because character_allowed_regex does not explicitly allow this character.')
  }
  return scripts.filter(script => script && typeof script === 'object')
}

function isCharacterRegexAllowed(settings, character) {
  const allowed = settings?.character_allowed_regex
  return Array.isArray(allowed) && allowed.includes(character?.avatar)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function shouldRunRegex(script, placement, options) {
  if (script.disabled) return false
  const placements = Array.isArray(script.placement)
    ? script.placement.map(Number)
    : Number.isFinite(Number(script.placement)) ? [Number(script.placement)] : []
  if (placements.length > 0 && !placements.includes(Number(placement))) return false

  const isMarkdown = options?.isMarkdown === true
  const isPrompt = options?.isPrompt === true
  const appliesToContext = (script.markdownOnly === true && isMarkdown)
    || (script.promptOnly === true && isPrompt)
    || (script.markdownOnly !== true && script.promptOnly !== true && !isMarkdown && !isPrompt)
  if (!appliesToContext) return false

  const depth = Number(options?.depth)
  const minDepth = Number(script.minDepth)
  const maxDepth = Number(script.maxDepth)
  const hasMinDepth = script.minDepth !== null && script.minDepth !== undefined && Number.isFinite(minDepth) && minDepth >= -1
  const hasMaxDepth = script.maxDepth !== null && script.maxDepth !== undefined && Number.isFinite(maxDepth) && maxDepth >= 0
  if (Number.isFinite(depth) && hasMinDepth && depth < minDepth) return false
  if (Number.isFinite(depth) && hasMaxDepth && depth > maxDepth) return false

  return true
}

function parseFindRegex(value) {
  const text = String(value ?? '')
  if (!text) return null
  try {
    if (text.startsWith('/')) {
      const lastSlash = text.lastIndexOf('/')
      if (lastSlash > 0) {
        const source = text.slice(1, lastSlash)
        const flags = normalizeFlags(text.slice(lastSlash + 1))
        return new RegExp(source, flags)
      }
    }
    return new RegExp(text)
  } catch (error) {
    optionalHost()?.recordCompatDiagnostic?.('getRegexedString', 'stub', `Skipped invalid regex script "${text}".`)
    console.warn('[ST Compat] Invalid regex script', text, error)
    return null
  }
}

function resolveFindRegex(value, substituteRegex, host) {
  const text = String(value ?? '')
  const mode = Number(substituteRegex)
  if (mode !== substitute_find_regex.RAW && mode !== substitute_find_regex.ESCAPED) return text
  return text.replace(/\{\{([^}]+)\}\}/g, (match) => {
    const resolved = host?.replaceVariableMacros?.(match) ?? match
    if (resolved === match) return match
    return mode === substitute_find_regex.ESCAPED ? escapeRegexMacro(resolved) : resolved
  })
}

function escapeRegexMacro(value) {
  return String(value ?? '').replace(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/gs, character => {
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

function filterString(value, trimStrings, host, characterOverride) {
  let output = String(value ?? '')
  for (const trimString of asArray(trimStrings)) {
    const resolved = host?.replaceVariableMacros?.(String(trimString ?? ''), { name2Override: characterOverride }) ?? String(trimString ?? '')
    output = output.replaceAll(resolved, '')
  }
  return output
}

function normalizeFlags(value) {
  return [...new Set(String(value || '').split(''))]
    .filter(flag => 'dgimsuvy'.includes(flag))
    .join('')
}

export default {
  regex_placement,
  substitute_find_regex,
  getRegexedString,
  runRegexScript,
}
