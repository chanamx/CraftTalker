export const world_names = []
export const selected_world_info = []
export const world_info = { globalSelect: selected_world_info, charLore: [], entries: {} }
export const world_info_include_names = true
export const world_info_case_sensitive = false
export const world_info_match_whole_words = false
export const world_info_use_group_scoring = false
export const world_info_max_recursion_steps = 10
export const METADATA_KEY = 'world_info'
export const DEFAULT_DEPTH = 4
export const DEFAULT_WEIGHT = 100
export const world_info_logic = {
  AND_ANY: 0,
  NOT_ALL: 1,
  NOT_ANY: 2,
  AND_ALL: 3,
}
export const world_info_position = {
  before: 0,
  after: 1,
  atDepth: 2,
  ANTop: 3,
  ANBottom: 4,
  EMTop: 5,
  EMBottom: 6,
}
export const wi_anchor_position = {
  before: 0,
  after: 1,
}
export const newWorldInfoEntryTemplate = {
  uid: 0,
  key: [],
  keysecondary: [],
  comment: '',
  content: '',
  constant: false,
  selective: false,
  enabled: true,
  position: 0,
  depth: DEFAULT_DEPTH,
  order: DEFAULT_WEIGHT,
}

export function loadWorldInfo() {
  return Promise.resolve([])
}

export function saveWorldInfo() {
  return Promise.resolve()
}

export function updateWorldInfoList() {
  return Promise.resolve()
}

export function getWorldInfoPrompt() {
  return ''
}

export function getWorldInfoSettings() {
  return world_info
}

export function parseRegexFromString(value) {
  const text = String(value ?? '')
  const match = text.match(/^\/(.+)\/([a-z]*)$/i)
  if (!match) return null
  try {
    return new RegExp(match[1], match[2])
  } catch {
    return null
  }
}

export function createNewWorldInfo(name = '') {
  if (name && !world_names.includes(name)) world_names.push(name)
  return { name, entries: {} }
}

export function createWorldInfoEntry(name = '', entry = {}) {
  const uid = Number(entry.uid ?? Date.now())
  world_info.entries[uid] = { ...newWorldInfoEntryTemplate, ...entry, uid }
  if (name && !world_names.includes(name)) world_names.push(name)
  return world_info.entries[uid]
}

export function deleteWorldInfoEntry(_name = '', uid) {
  delete world_info.entries[uid]
  return Promise.resolve(true)
}

export function deleteWorldInfo(name) {
  const index = world_names.indexOf(name)
  if (index >= 0) world_names.splice(index, 1)
  return Promise.resolve(true)
}

export const originalWIDataKeyMap = new Map()

export function setWIOriginalDataValue(entry, key, value) {
  if (entry && typeof entry === 'object') entry[key] = value
  return entry
}

export function onWorldInfoChange(callback) {
  if (typeof callback !== 'function') return () => {}
  return () => {}
}

export function setWorldInfoButtonClass() {}
export function reloadEditor() {}
export function convertCharacterBook(book) {
  return book
}

export default {
  world_names,
  loadWorldInfo,
  saveWorldInfo,
  updateWorldInfoList,
  getWorldInfoPrompt,
  getWorldInfoSettings,
  reloadEditor,
  convertCharacterBook,
}
