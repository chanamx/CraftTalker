export const power_user = {}
export const persona_description_positions = {
  NONE: 0,
  IN_PROMPT: 1,
  TOP_AN: 2,
  BOTTOM_AN: 3,
}

export function registerDebugFunction(name, fn) {
  globalThis.CraftTalker = globalThis.CraftTalker ?? {}
  globalThis.CraftTalker.debugFunctions = globalThis.CraftTalker.debugFunctions ?? {}
  globalThis.CraftTalker.debugFunctions[name] = fn
}

export function flushEphemeralStoppingStrings() {
  return []
}

export default {
  power_user,
  persona_description_positions,
  flushEphemeralStoppingStrings,
  registerDebugFunction,
}
