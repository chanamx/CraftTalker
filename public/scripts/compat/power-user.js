export const persona_description_positions = {
  IN_PROMPT: 0,
  AFTER_CHAR: 1,
  TOP_AN: 2,
  BOTTOM_AN: 3,
  AT_DEPTH: 4,
  NONE: 9,
}

export const power_user = {
  personas: {},
  persona_descriptions: {},
  default_persona: null,
  persona_description: '',
  persona_description_position: persona_description_positions.IN_PROMPT,
  persona_description_depth: 2,
  persona_description_role: 0,
  persona_description_lorebook: '',
  persona_show_notifications: false,
  persona_sort_order: 'asc',
  custom_stopping_strings: '',
  custom_stopping_strings_macro: false,
  streaming_fps: 30,
}

const EPHEMERAL_STOPPING_STRINGS = []

export function registerDebugFunction(name, fn) {
  globalThis.CraftTalker = globalThis.CraftTalker ?? {}
  globalThis.CraftTalker.debugFunctions = globalThis.CraftTalker.debugFunctions ?? {}
  globalThis.CraftTalker.debugFunctions[name] = fn
}

export function flushEphemeralStoppingStrings() {
  EPHEMERAL_STOPPING_STRINGS.splice(0, EPHEMERAL_STOPPING_STRINGS.length)
  return []
}

export function getCustomStoppingStrings(limit = undefined) {
  const strings = [...getPermanentStoppingStrings(), ...EPHEMERAL_STOPPING_STRINGS]
  return Number(limit) > 0 ? strings.slice(0, Number(limit)) : strings
}

function getPermanentStoppingStrings() {
  const raw = power_user.custom_stopping_strings
  const values = Array.isArray(raw) ? raw : parseStoppingStringJson(raw)
  const host = globalThis.CraftTalker?.stHost ?? globalThis.SillyTavern
  return values
    .filter(value => typeof value === 'string' && value.length > 0)
    .map(value => power_user.custom_stopping_strings_macro
      ? host?.replaceVariableMacros?.(value) ?? value
      : value)
}

function parseStoppingStringJson(value) {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default {
  power_user,
  persona_description_positions,
  flushEphemeralStoppingStrings,
  getCustomStoppingStrings,
  registerDebugFunction,
}
