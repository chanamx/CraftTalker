export function t(strings, ...values) {
  if (Array.isArray(strings?.raw)) return String.raw(strings, ...values)
  return String(strings ?? '')
}

export function translate(value) {
  return Promise.resolve(String(value ?? ''))
}

export function getCurrentLocale() {
  return navigator.language || 'en'
}

export function addLocaleData() {}

export default {
  t,
  translate,
  getCurrentLocale,
  addLocaleData,
}
