import { getHost } from './host.js'

export class MacrosParser {
  static registerMacro(name, handler) {
    getHost().registerMacro(name, handler)
  }

  static unregisterMacro(name) {
    getHost().unregisterMacro(name)
  }

  static parse(value, context = {}) {
    return getHost().replaceVariableMacros(value, context)
  }
}

export const macros = {
  register: (name, entry) => getHost().registerMacro(name, entry),
  unregister: name => getHost().unregisterMacro(name),
  registry: {
    unregisterMacro: name => getHost().unregisterMacro(name),
  },
}

export function registerMacroLike(regex, replace) {
  return getHost().registerMacroLike(regex, replace)
}

export function unregisterMacroLike(regex) {
  return getHost().unregisterMacroLike(regex)
}

export function substituteParams(value, context = {}) {
  return getHost().replaceVariableMacros(value, context)
}

export function getLastMessageId() {
  return Math.max(0, (getHost().chat?.length ?? 1) - 1)
}

export default MacrosParser
