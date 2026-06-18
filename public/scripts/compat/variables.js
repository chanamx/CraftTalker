import { getHost } from './host.js'

export function getLocalVariable(name) {
  return getHost().getLocalVariable(name)
}

export function setLocalVariable(name, value) {
  return getHost().setLocalVariable(name, value)
}

export function getGlobalVariable(name) {
  return getHost().getGlobalVariable(name)
}

export function setGlobalVariable(name, value) {
  return getHost().setGlobalVariable(name, value)
}

export function resolveVariable(name) {
  return getLocalVariable(name) ?? getGlobalVariable(name)
}

export function replaceVariableMacros(value) {
  return getHost().replaceVariableMacros(value)
}

export default {
  getLocalVariable,
  setLocalVariable,
  getGlobalVariable,
  setGlobalVariable,
  resolveVariable,
  replaceVariableMacros,
}
