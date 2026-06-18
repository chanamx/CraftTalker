export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, Number(ms) || 0))
}

export function debounce(fn, wait = 0) {
  let timer = null
  const wrapped = (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), Number(wait) || 0)
  }
  wrapped.cancel = () => clearTimeout(timer)
  return wrapped
}

export function cancelDebounce(fn) {
  fn?.cancel?.()
}

export function escapeHtml(value) {
  const element = document.createElement('span')
  element.textContent = String(value ?? '')
  return element.innerHTML
}

export function sanitizeSelector(value) {
  return String(value ?? '').replace(/[^a-z0-9_-]/gi, '-')
}

export function equalsIgnoreCaseAndAccents(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' }) === 0
}

export function isSubsetOf(target, required) {
  return Array.isArray(required) && required.every(item => Array.isArray(target) && target.includes(item))
}

export function versionCompare() {
  return true
}

export function uuidv4() {
  return crypto.randomUUID()
}

export function getStringHash(value) {
  let hash = 0
  const text = String(value ?? '')
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index)
    hash |= 0
  }
  return hash
}

export function getCharaFilename(name) {
  return getSanitizedFilename(name)
}

export function getSanitizedFilename(value) {
  return String(value ?? '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'untitled'
}

export function isDataURL(value) {
  return /^data:/i.test(String(value ?? ''))
}

export function getBase64Async(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function getImageSizeFromDataURL(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve({ width: 0, height: 0 })
    image.src = String(dataUrl ?? '')
  })
}

export function ensureImageFormatSupported(dataUrl) {
  return Promise.resolve(dataUrl)
}

export class Stopwatch {
  constructor() {
    this.started = performance.now()
  }

  get elapsed() {
    return performance.now() - this.started
  }

  restart() {
    this.started = performance.now()
  }
}

export function download(content, fileName = 'download.txt', type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([String(content ?? '')], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function copyText(value) {
  const text = String(value ?? '')
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }

  const element = document.createElement('textarea')
  element.value = text
  element.style.position = 'fixed'
  element.style.opacity = '0'
  document.body.appendChild(element)
  element.select()
  const copied = document.execCommand?.('copy') ?? false
  element.remove()
  return copied
}

export function showFontAwesomePicker() {
  return Promise.resolve(null)
}

export async function saveBase64AsFile(base64, _characterName = '', fileName = 'image', extension = 'png') {
  if (!base64) return ''
  return String(base64).startsWith('data:')
    ? String(base64)
    : `data:image/${extension};base64,${base64}`
}

export function findChar({ name, avatar } = {}) {
  const host = globalThis.CraftTalker?.stHost ?? globalThis.SillyTavern
  return host?.characters?.find(character =>
    (name && character.name === name) || (avatar && character.avatar === avatar),
  ) ?? null
}

export function getFileText(file) {
  if (!file) return Promise.resolve('')
  if (typeof file.text === 'function') return file.text()
  return Promise.resolve(String(file))
}

export function getSortableDelay() {
  return 0
}

export function timestampToMoment(value) {
  const date = value ? new Date(value) : new Date()
  return {
    toDate: () => date,
    format: () => date.toISOString(),
    valueOf: () => date.valueOf(),
  }
}

export function setValueByPath(target, path, value) {
  const parts = String(path ?? '').split('.').filter(Boolean)
  let current = target
  for (const part of parts.slice(0, -1)) {
    current[part] = current[part] && typeof current[part] === 'object' ? current[part] : {}
    current = current[part]
  }
  if (parts.length) current[parts[parts.length - 1]] = value
  return target
}

export function deleteValueByPath(target, path) {
  const parts = String(path ?? '').split('.').filter(Boolean)
  let current = target
  for (const part of parts.slice(0, -1)) {
    current = current?.[part]
  }
  if (current && parts.length) delete current[parts[parts.length - 1]]
  return target
}

export default {
  delay,
  debounce,
  cancelDebounce,
  escapeHtml,
  sanitizeSelector,
  equalsIgnoreCaseAndAccents,
  isSubsetOf,
  versionCompare,
  uuidv4,
  getStringHash,
  getCharaFilename,
  getSanitizedFilename,
  isDataURL,
  getBase64Async,
  getImageSizeFromDataURL,
  ensureImageFormatSupported,
  Stopwatch,
  download,
  copyText,
  showFontAwesomePicker,
  saveBase64AsFile,
  findChar,
  getFileText,
  getSortableDelay,
  timestampToMoment,
  setValueByPath,
  deleteValueByPath,
}
