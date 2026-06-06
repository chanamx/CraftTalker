import type { WorldBookEntry } from '../services/world.service.js'

export interface MatchedEntry {
  content: string
  position: number
  depth: number
  insertion_order: number
}

export function matchWorldEntries(
  entries: Record<string, WorldBookEntry>,
  scanText: string,
  scanDepth: number = 100,
): MatchedEntry[] {
  const matched: MatchedEntry[] = []
  const textToScan = scanText.slice(-scanDepth * 200)

  for (const entry of Object.values(entries)) {
    if (!entry.enabled || !entry.content) continue
    if (entry.probability < 100 && Math.random() * 100 > entry.probability) continue

    if (entry.constant) {
      matched.push({ content: entry.content, position: entry.position, depth: entry.depth, insertion_order: entry.insertion_order })
      continue
    }

    const primaryHit = entry.key.length === 0 || entry.key.some(k => matchKey(k, textToScan, entry.use_regexp, entry.case_sensitive, entry.match_whole_words))
    if (!primaryHit) continue

    if (entry.selective && entry.keysecondary.length > 0) {
      const secondaryHit = entry.keysecondary.some(k => matchKey(k, textToScan, entry.use_regexp, entry.case_sensitive, entry.match_whole_words))
      if (!secondaryHit) continue
    }

    matched.push({ content: entry.content, position: entry.position, depth: entry.depth, insertion_order: entry.insertion_order })
  }

  return matched.sort((a, b) => a.insertion_order - b.insertion_order)
}

function matchKey(key: string, text: string, useRegexp: boolean, caseSensitive: boolean, wholeWords: boolean): boolean {
  if (!key) return false
  try {
    if (useRegexp) {
      return new RegExp(key, caseSensitive ? '' : 'i').test(text)
    }
    const flags = caseSensitive ? '' : 'i'
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = wholeWords ? `\\b${escaped}\\b` : escaped
    return new RegExp(pattern, flags).test(text)
  } catch {
    return text.includes(key)
  }
}
