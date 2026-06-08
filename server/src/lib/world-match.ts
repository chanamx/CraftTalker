import type { WorldBookEntry } from '../services/world.service.js'
import { checkWorldInfo, type MatchedEntry } from './world-info-compat.js'

export type { MatchedEntry } from './world-info-compat.js'

export function matchWorldEntries(
  entries: Record<string, WorldBookEntry>,
  scanText: string,
  scanDepth: number = 100,
): MatchedEntry[] {
  const result = checkWorldInfo({
    sources: [{ name: 'legacy', type: 'character', entries }],
    chat: [scanText.slice(-scanDepth * 200)],
    settings: { depth: 1, budgetTokens: Number.MAX_SAFE_INTEGER },
  })
  return result.matchedEntries
}
