import { optionalHost } from '../../host.js'

export const regex_placement = {
  USER_INPUT: 1,
  AI_OUTPUT: 2,
  SLASH_COMMAND: 3,
  WORLD_INFO: 4,
  REASONING: 6,
}

export function getRegexedString(value, placement = regex_placement.AI_OUTPUT, options = {}) {
  let output = String(value ?? '')
  const host = optionalHost()
  const scripts = getRegexScripts(host)
  if (!scripts.length) return output

  for (const script of scripts.sort(compareRegexOrder)) {
    if (!shouldRunRegex(script, placement, options)) continue
    const regex = parseFindRegex(script.findRegex)
    if (!regex) continue
    const replacement = String(script.replaceString ?? '')
    output = output.replace(regex, script.substituteRegex ? host?.replaceVariableMacros?.(replacement) ?? replacement : replacement)
  }

  host?.recordCompatDiagnostic?.(
    'getRegexedString',
    'partial',
    'Applied basic ST regex scripts from extension/character settings; advanced trim, preset, and executable replacement behavior is not mirrored.',
  )
  return output
}

function getRegexScripts(host) {
  const settings = host?.extension_settings ?? globalThis.extension_settings ?? {}
  const scripts = [...asArray(settings.regex)]
  const context = typeof host?.getContext === 'function' ? host.getContext() : {}
  const character = host?.characters?.[Number(context?.this_chid ?? context?.characterId ?? -1)]
  const characterScripts = character?.data?.extensions?.regex_scripts
  if (Array.isArray(characterScripts) && isCharacterRegexAllowed(settings, character)) {
    scripts.push(...characterScripts)
  }
  return scripts.filter(script => script && typeof script === 'object')
}

function isCharacterRegexAllowed(settings, character) {
  const allowed = settings?.character_allowed_regex
  if (!Array.isArray(allowed) || allowed.length === 0) return true
  return allowed.includes(character?.avatar) || allowed.includes(character?.name)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function compareRegexOrder(a, b) {
  return Number(a?.order ?? a?.sortOrder ?? 100) - Number(b?.order ?? b?.sortOrder ?? 100)
}

function shouldRunRegex(script, placement, options) {
  if (script.disabled) return false
  const placements = asArray(script.placement).map(Number)
  if (placements.length > 0 && !placements.includes(Number(placement))) return false

  const depth = Number(options?.depth)
  const minDepth = Number(script.minDepth)
  const maxDepth = Number(script.maxDepth)
  if (Number.isFinite(depth) && Number.isFinite(minDepth) && depth < minDepth) return false
  if (Number.isFinite(depth) && Number.isFinite(maxDepth) && depth > maxDepth) return false

  if (options?.isMarkdown && script.promptOnly && !script.markdownOnly) return false
  if (options?.isPrompt && script.markdownOnly && !script.promptOnly) return false
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
    return new RegExp(text, 'gi')
  } catch (error) {
    optionalHost()?.recordCompatDiagnostic?.('getRegexedString', 'stub', `Skipped invalid regex script "${text}".`)
    console.warn('[ST Compat] Invalid regex script', text, error)
    return null
  }
}

function normalizeFlags(value) {
  const flags = [...new Set(String(value || 'gi').split(''))]
    .filter(flag => 'dgimsuvy'.includes(flag))
    .join('')
  return flags.includes('g') ? flags : `${flags}g`
}

export default {
  regex_placement,
  getRegexedString,
}
