import { getHost } from './host.js'

const host = getHost()

export const extension_settings = host.extension_settings
export const extensionNames = host.extensionNames
export const extensionTypes = host.extensionTypes
export const modules = []
export const UNSET_VALUE = Symbol.for('crafttalker.st_compat.unset_value')

export const getContext = host.getContext
export const getExtensionManifest = host.getExtensionManifest
export const ModuleWorkerWrapper = host.ModuleWorkerWrapper
export const renderExtensionTemplate = host.renderExtensionTemplate
export const renderExtensionTemplateAsync = host.renderExtensionTemplateAsync
export const saveMetadataDebounced = host.saveMetadataDebounced
export const writeExtensionField = host.writeExtensionField
export const writeExtensionFieldBulk = host.writeExtensionFieldBulk
export const TavernHelper = host.TavernHelper
export const builtin = host.builtin
export const registerMacroLike = host.registerMacroLike
export const unregisterMacroLike = host.unregisterMacroLike

export function getApiUrl() {
  return String(extension_settings.apiUrl ?? '')
}

export function getExtensionType(name) {
  const types = getHost().extensionTypes ?? {}
  return types[name] ?? types[`third-party/${name}`] ?? ''
}

export async function doExtrasFetch(endpoint, args = {}) {
  const baseUrl = getApiUrl()
  const url = baseUrl ? new URL(String(endpoint), baseUrl).toString() : String(endpoint)
  return fetch(url, args)
}

export function cancelDebouncedMetadataSave() {}
export function openThirdPartyExtensionMenu() {}
export function loadExtensionSettings(settings = {}) {
  Object.assign(extension_settings, settings.extension_settings ?? settings)
  return Promise.resolve()
}
export function initExtensions() {
  return getHost().initialize()
}
export function runGenerationInterceptors(chat, contextSize, type) {
  return getHost().runGenerationInterceptors?.(chat, contextSize, type) ?? Promise.resolve(false)
}

export default {
  extension_settings,
  extensionNames,
  extensionTypes,
  modules,
  getContext,
  getApiUrl,
  getExtensionManifest,
  ModuleWorkerWrapper,
  renderExtensionTemplate,
  renderExtensionTemplateAsync,
  saveMetadataDebounced,
  writeExtensionField,
  writeExtensionFieldBulk,
  TavernHelper,
  builtin,
  registerMacroLike,
  unregisterMacroLike,
  runGenerationInterceptors,
}
