function parseScalar(value) {
  const text = String(value ?? '').trim()
  if (text === '') return ''
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null') return null
  if (!Number.isNaN(Number(text)) && text !== '') return Number(text)
  return text.replace(/^['"]|['"]$/g, '')
}

function parseYamlLike(value) {
  const text = String(value ?? '').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    const result = {}
    for (const line of text.split(/\r?\n/)) {
      const match = /^([^:#]+):\s*(.*)$/.exec(line)
      if (match) result[match[1].trim()] = parseScalar(match[2])
    }
    return result
  }
}

function stringifyYamlLike(value, indent = 0) {
  if (value == null || typeof value !== 'object') return String(value ?? '')
  if (Array.isArray(value)) {
    return value.map(item => `${' '.repeat(indent)}- ${stringifyYamlLike(item, indent + 2)}`).join('\n')
  }
  return Object.entries(value)
    .map(([key, entry]) => {
      if (entry && typeof entry === 'object') {
        return `${' '.repeat(indent)}${key}:\n${stringifyYamlLike(entry, indent + 2)}`
      }
      return `${' '.repeat(indent)}${key}: ${String(entry ?? '')}`
    })
    .join('\n')
}

function getIn(target, path) {
  return path.reduce((current, key) => current?.[key], target)
}

function setIn(target, path, value) {
  let current = target
  for (const key of path.slice(0, -1)) {
    current[key] = current[key] && typeof current[key] === 'object' ? current[key] : {}
    current = current[key]
  }
  if (path.length) current[path[path.length - 1]] = value
}

export const yaml = {
  parse: parseYamlLike,
  stringify: stringifyYamlLike,
  parseDocument(value) {
    const data = parseYamlLike(value)
    return {
      data,
      getIn(path) {
        return getIn(data, path)
      },
      setIn(path, nextValue) {
        setIn(data, path, nextValue)
      },
      toString() {
        return stringifyYamlLike(data)
      },
    }
  },
}

export default {
  yaml,
}
