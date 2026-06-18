export function getHost() {
  const host = globalThis.CraftTalker?.stHost ?? globalThis.SillyTavern
  if (!host) {
    throw new Error('CraftTalker SillyTavern compatibility host is not ready')
  }
  return host
}

export function optionalHost() {
  return globalThis.CraftTalker?.stHost ?? globalThis.SillyTavern ?? null
}

export default getHost
