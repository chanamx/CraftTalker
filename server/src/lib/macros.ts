export interface MacroEnv {
  user: string
  char: string
}

const MACRO_REGEX = /\{\{([^}]+)\}\}/g

type MacroHandler = (env: MacroEnv) => string

const MACROS: Record<string, MacroHandler> = {
  user: (env) => env.user,
  char: (env) => env.char,
  time: () => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  },
  date: () => new Date().toLocaleDateString(),
  weekday: () => new Date().toLocaleDateString(undefined, { weekday: 'long' }),
  isotime: () => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  },
  isodate: () => new Date().toISOString().slice(0, 10),
  // ST compatibility aliases
  'char_name': (env) => env.char,
  'user_name': (env) => env.user,
}

export function resolveMacros(text: string, env: MacroEnv): string {
  if (!text || !text.includes('{{')) return text
  return text.replace(MACRO_REGEX, (match, key: string) => {
    const handler = MACROS[key.trim().toLowerCase()]
    return handler ? handler(env) : match
  })
}
