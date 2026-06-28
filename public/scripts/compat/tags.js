import { optionalHost } from './host.js'

const tagMapOverrides = Object.create(null)
const tagListOverrides = new Map()

function getHostContext() {
  const host = optionalHost()
  const context = typeof host?.getContext === 'function' ? host.getContext() : {}
  return { host, context: context && typeof context === 'object' ? context : {} }
}

function getCharacters() {
  const { host, context } = getHostContext()
  for (const value of [host?.characters, context.characters, context.charactersData]) {
    if (Array.isArray(value)) return value
  }
  return []
}

function asStringList(value) {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item ?? '').trim()).filter(Boolean)
}

function getCharacterKey(character, index) {
  if (!character || typeof character !== 'object') return String(index)
  return String(
    character.avatar
    ?? character.file_name
    ?? character.id
    ?? character.name
    ?? index
    ?? '',
  ).trim()
}

function getNativeTagMap() {
  const { host, context } = getHostContext()
  for (const value of [host?.tag_map, host?.tagMap, context.tag_map, context.tagMap]) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
  }
  return {}
}

function buildTagMap() {
  const result = Object.create(null)
  const native = getNativeTagMap()

  for (const [key, value] of Object.entries(native)) {
    result[key] = asStringList(value)
  }

  for (const [index, character] of getCharacters().entries()) {
    if (!character || typeof character !== 'object') continue
    const key = getCharacterKey(character, index)
    if (!key) continue
    const characterTags = asStringList(character.tags ?? character.data?.tags)
    if (characterTags.length || !(key in result)) {
      result[key] = characterTags
    }
  }

  for (const [key, value] of Object.entries(tagMapOverrides)) {
    result[key] = asStringList(value)
  }

  return result
}

function buildTags() {
  const byId = new Map(tagListOverrides)

  for (const tagIds of Object.values(buildTagMap())) {
    for (const id of asStringList(tagIds)) {
      if (!byId.has(id)) byId.set(id, { id, name: id, color: '', color2: '' })
    }
  }

  return Array.from(byId.values())
}

function tagMapFacade() {
  return new Proxy(Object.create(null), {
    get(_target, property) {
      if (property === Symbol.toStringTag) return 'Object'
      if (property === 'toJSON') return () => ({ ...buildTagMap() })
      return buildTagMap()[property]
    },
    set(_target, property, value) {
      tagMapOverrides[property] = asStringList(value)
      return true
    },
    deleteProperty(_target, property) {
      delete tagMapOverrides[property]
      return true
    },
    has(_target, property) {
      return property in buildTagMap()
    },
    ownKeys() {
      return Reflect.ownKeys(buildTagMap())
    },
    getOwnPropertyDescriptor(_target, property) {
      const map = buildTagMap()
      if (!(property in map)) return undefined
      return { configurable: true, enumerable: true, value: map[property] }
    },
  })
}

function tagsFacade() {
  return new Proxy([], {
    get(target, property, receiver) {
      const list = buildTags()
      if (property === 'toJSON') return () => list
      if (property === Symbol.iterator) return list[Symbol.iterator].bind(list)
      if (property in list) {
        const value = list[property]
        return typeof value === 'function' ? value.bind(list) : value
      }
      return Reflect.get(target, property, receiver)
    },
    set(_target, property, value) {
      if (property === 'length') return true
      if (value && typeof value === 'object') {
        const id = String(value.id ?? value.name ?? property ?? '').trim()
        if (id) tagListOverrides.set(id, { id, name: String(value.name ?? id), ...value })
      }
      return true
    },
    ownKeys() {
      return Reflect.ownKeys(buildTags())
    },
    getOwnPropertyDescriptor(target, property) {
      const list = buildTags()
      if (property === 'length') {
        return {
          ...Reflect.getOwnPropertyDescriptor(target, 'length'),
          value: list.length,
        }
      }

      const descriptor = Reflect.getOwnPropertyDescriptor(list, property)
      return descriptor ? { ...descriptor, configurable: true } : undefined
    },
  })
}

export const tag_map = tagMapFacade()
export const tags = tagsFacade()
export const tag_import_setting = {
  ASK: 0,
  IMPORT: 1,
  SKIP: 2,
}
export const tag_sort_mode = {
  ALPHABETICAL: 'alphabetical',
  CREATION_ORDER: 'creation_order',
}
export const tag_filter_type = {
  AND: 'and',
  OR: 'or',
}

export function getTagKeyForEntity(entityOrKey) {
  let key = entityOrKey
  if (key && typeof key === 'object' && 'id' in key) key = key.id

  const characters = getCharacters()
  let character = characters.includes(key) ? key : null
  const numeric = Number(key)
  if (!character && Number.isInteger(numeric) && numeric >= 0) character = characters[numeric]
  if (!character) {
    const text = String(key ?? '').trim()
    character = characters.find(item =>
      String(item?.avatar ?? '') === text
      || String(item?.file_name ?? '') === text
      || String(item?.id ?? '') === text
      || String(item?.name ?? '') === text,
    )
  }

  if (character) return getCharacterKey(character, characters.indexOf(character))

  const text = String(key ?? '').trim()
  return text && text in buildTagMap() ? text : undefined
}

export function getTagKeyForEntityElement(element) {
  const target = typeof element === 'string' ? document.querySelector(element) : element?.[0] ?? element
  const id = target?.dataset?.chid ?? target?.getAttribute?.('chid') ?? target?.dataset?.grid ?? target?.getAttribute?.('grid')
  return getTagKeyForEntity(id)
}

export function getTagsList() {
  return buildTags()
}

export function compareTagsForSort(a, b) {
  return String(a?.name ?? a?.id ?? '').localeCompare(String(b?.name ?? b?.id ?? ''))
}

export function createTagMapFromList(list = []) {
  return asStringList(list)
}

export function searchCharByName(name) {
  const text = String(name ?? '').trim().toLowerCase()
  return getCharacters().find(character => String(character?.name ?? '').toLowerCase() === text) ?? null
}

export function importTags(data = {}) {
  if (Array.isArray(data.tags)) {
    for (const tag of data.tags) {
      if (!tag || typeof tag !== 'object') continue
      const id = String(tag.id ?? tag.name ?? '').trim()
      if (id) tagListOverrides.set(id, { id, name: String(tag.name ?? id), ...tag })
    }
  }
  if (data.tag_map && typeof data.tag_map === 'object') {
    for (const [key, value] of Object.entries(data.tag_map)) tagMapOverrides[key] = asStringList(value)
  }
  return true
}

export function removeTagFromMap(key, tagId) {
  const current = asStringList(tag_map[key])
  tagMapOverrides[key] = current.filter(item => item !== tagId)
}

export function createTagInput() {
  return document.createElement('input')
}

export function printTagList() {}
export function applyTagsOnCharacterSelect() {}
export function applyTagsOnGroupSelect() {}
export function printTagFilters() {}

export default {
  tags,
  tag_map,
  tag_import_setting,
  tag_sort_mode,
  tag_filter_type,
  getTagKeyForEntity,
  getTagKeyForEntityElement,
  getTagsList,
  compareTagsForSort,
  createTagMapFromList,
  searchCharByName,
  importTags,
  removeTagFromMap,
  createTagInput,
  printTagList,
  applyTagsOnCharacterSelect,
  applyTagsOnGroupSelect,
  printTagFilters,
}
