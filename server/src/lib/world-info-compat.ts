import type { WorldBookEntry } from '../services/world.service.js'

export const WORLD_INFO_POSITION = {
  before: 0,
  after: 1,
  ANTop: 2,
  ANBottom: 3,
  atDepth: 4,
  EMTop: 5,
  EMBottom: 6,
  outlet: 7,
} as const

export const WORLD_INFO_LOGIC = {
  AND_ANY: 0,
  NOT_ALL: 1,
  NOT_ANY: 2,
  AND_ALL: 3,
} as const

export const WORLD_INFO_INSERTION_STRATEGY = {
  evenly: 0,
  character_first: 1,
  global_first: 2,
} as const

const DEFAULT_DEPTH = 4
const DEFAULT_WEIGHT = 100
const DEFAULT_CONTEXT_SIZE = 4096
const MAX_SCAN_DEPTH = 1000
const KNOWN_DECORATORS = ['@@activate', '@@dont_activate']

type SourceType = 'chat' | 'persona' | 'character' | 'global'
type ScanState = 'initial' | 'recursion' | 'min_activations'

export interface MatchedEntry {
  content: string
  position: number
  depth: number
  insertion_order: number
  role?: number
  world?: string
  uid?: number
  outletName?: string
}

export interface WorldInfoSource {
  name: string
  type: SourceType
  entries: Record<string, WorldBookEntry>
  scanDepth?: number
  recursive?: boolean
  recursiveDepth?: number
  tokenBudget?: number
}

export interface WorldInfoScanSettings {
  depth?: number
  minActivations?: number
  minActivationsDepthMax?: number
  budgetPercent?: number
  budgetCap?: number
  budgetTokens?: number
  caseSensitive?: boolean
  matchWholeWords?: boolean
  recursive?: boolean
  maxRecursionSteps?: number
  useGroupScoring?: boolean
  characterStrategy?: number
  trigger?: string
  characterName?: string
  characterTags?: string[]
  globalScanData?: WorldInfoGlobalScanData
}

export interface WorldInfoGlobalScanData {
  personaDescription?: string
  characterDescription?: string
  characterPersonality?: string
  characterDepthPrompt?: string
  scenario?: string
  creatorNotes?: string
}

export interface WorldInfoPromptResult {
  matchedEntries: MatchedEntry[]
  worldInfoBefore: string
  worldInfoAfter: string
  worldInfoExamples: Array<{ position: 'before' | 'after'; content: string }>
  worldInfoDepth: Array<{ depth: number; role: number; entries: string[] }>
  anBefore: string[]
  anAfter: string[]
  outletEntries: Record<string, string[]>
  allActivatedEntries: WorldInfoCompatEntry[]
  overflowed: boolean
}

export interface WorldInfoCompatEntry {
  sourceType: SourceType
  world: string
  uid: number
  key: string[]
  keysecondary: string[]
  comment: string
  content: string
  constant: boolean
  selective: boolean
  selectiveLogic: number
  order: number
  insertion_order: number
  enabled: boolean
  disable: boolean
  position: number
  depth: number
  role: number
  probability: number
  useProbability: boolean
  group: string
  groupOverride: boolean
  groupWeight: number
  ignoreBudget: boolean
  excludeRecursion: boolean
  preventRecursion: boolean
  delayUntilRecursion: number
  scanDepth: number | null
  caseSensitive: boolean | null
  matchWholeWords: boolean | null
  useGroupScoring: boolean | null
  useRegexp: boolean
  outletName: string
  matchPersonaDescription: boolean
  matchCharacterDescription: boolean
  matchCharacterPersonality: boolean
  matchCharacterDepthPrompt: boolean
  matchScenario: boolean
  matchCreatorNotes: boolean
  triggers: string[]
  characterFilter: WorldInfoCharacterFilter | null
  decorators: string[]
  raw: WorldBookEntry
}

interface WorldInfoCharacterFilter {
  names: string[]
  tags: string[]
  isExclude: boolean
}

interface CheckWorldInfoInput {
  sources: WorldInfoSource[]
  chat: string[]
  maxContext?: number
  settings?: WorldInfoScanSettings
}

interface ScanBuffer {
  chat: string[]
  recurse: string[]
  inject: string[]
  depth: number
  startDepth: number
}

export function getSortedWorldInfoEntries(
  sources: WorldInfoSource[],
  settings: WorldInfoScanSettings = {},
): WorldInfoCompatEntry[] {
  const byType: Record<SourceType, WorldInfoCompatEntry[]> = {
    chat: [],
    persona: [],
    character: [],
    global: [],
  }

  for (const source of sources) {
    for (const [entryKey, entry] of Object.entries(source.entries)) {
      byType[source.type].push(toCompatEntry(entry, source, entryKey))
    }
  }

  const chatLore = sortByOrder(byType.chat)
  const personaLore = sortByOrder(byType.persona)
  const characterLore = sortByOrder(byType.character)
  const globalLore = sortByOrder(byType.global)
  const characterStrategy = settings.characterStrategy ?? WORLD_INFO_INSERTION_STRATEGY.character_first
  let regularLore: WorldInfoCompatEntry[]

  switch (characterStrategy) {
    case WORLD_INFO_INSERTION_STRATEGY.character_first:
      regularLore = [...characterLore, ...globalLore]
      break
    case WORLD_INFO_INSERTION_STRATEGY.global_first:
      regularLore = [...globalLore, ...characterLore]
      break
    case WORLD_INFO_INSERTION_STRATEGY.evenly:
      regularLore = sortByOrder([...globalLore, ...characterLore])
      break
    default:
      regularLore = sortByOrder([...globalLore, ...characterLore])
      break
  }

  return [...chatLore, ...personaLore, ...regularLore]
}

export function checkWorldInfo(input: CheckWorldInfoInput): WorldInfoPromptResult {
  const settings = input.settings ?? {}
  const sortedEntries = getSortedWorldInfoEntries(input.sources, settings)
  const buffer: ScanBuffer = {
    chat: input.chat.map(message => message.trim()),
    recurse: [],
    inject: [],
    depth: clampDepth(settings.depth ?? inferDepth(sortedEntries)),
    startDepth: 0,
  }
  const maxContext = input.maxContext ?? DEFAULT_CONTEXT_SIZE
  let remainingBudget = getBudget(maxContext, settings)
  let overflowed = false
  let scanState: ScanState | null = 'initial'
  let loopCount = 0
  let currentRecursionDelayLevel = getNextRecursionDelayLevel(sortedEntries, 0)
  const activated = new Map<string, WorldInfoCompatEntry>()
  const failedProbability = new Set<string>()

  while (scanState) {
    loopCount += 1
    if (settings.maxRecursionSteps && loopCount > settings.maxRecursionSteps) break

    const possibleEntries: WorldInfoCompatEntry[] = []

    for (const entry of sortedEntries) {
      const key = entryId(entry)
      if (activated.has(key) || failedProbability.has(key)) continue
      if (!entry.enabled || !entry.content) continue
      if (!isEntryAllowedForScan(entry, settings)) continue
      if (scanState === 'recursion' && entry.excludeRecursion) continue
      if (scanState !== 'recursion' && entry.delayUntilRecursion > 0) continue
      if (scanState === 'recursion' && entry.delayUntilRecursion > currentRecursionDelayLevel) continue

      if (entry.decorators.includes('@@dont_activate')) continue
      if (entry.decorators.includes('@@activate')) {
        possibleEntries.push(entry)
        continue
      }

      const score = getActivationScore(entry, buffer, scanState, settings)
      if (entry.constant || score > 0) {
        possibleEntries.push(entry)
      }
    }

    let newEntries = possibleEntries
      .sort((a, b) => sortedEntries.indexOf(a) - sortedEntries.indexOf(b))

    newEntries = newEntries.filter(entry => {
      if (!entry.useProbability || entry.probability >= 100) return true
      const passed = Math.random() * 100 <= entry.probability
      if (!passed) failedProbability.add(entryId(entry))
      return passed
    })

    newEntries = filterByInclusionGroups(newEntries, activated, buffer, scanState, settings)

    const successfulEntries: WorldInfoCompatEntry[] = []
    for (const entry of newEntries) {
      const contentTokens = estimateTokenCount(entry.content)
      if (!entry.ignoreBudget && remainingBudget - contentTokens < 0) {
        overflowed = true
        continue
      }
      if (!entry.ignoreBudget) remainingBudget -= contentTokens
      activated.set(entryId(entry), entry)
      successfulEntries.push(entry)
    }

    const successfulForRecursion = successfulEntries.filter(entry => !entry.preventRecursion)
    let nextScanState: ScanState | null = null
    if (settings.recursive && !overflowed && successfulForRecursion.length > 0) {
      buffer.recurse.unshift(successfulForRecursion.map(entry => entry.content).join('\n'))
      nextScanState = 'recursion'
    }

    const minActivations = settings.minActivations ?? 0
    const minActivationsDepthMax = settings.minActivationsDepthMax ?? 0
    if (!nextScanState && !overflowed && minActivations > 0 && activated.size < minActivations) {
      const nextDepth = buffer.depth + 1
      const overDepth = (minActivationsDepthMax > 0 && nextDepth > minActivationsDepthMax) || nextDepth > buffer.chat.length
      if (!overDepth) {
        buffer.depth = clampDepth(nextDepth)
        nextScanState = 'min_activations'
      }
    }

    if (!nextScanState && settings.recursive) {
      const nextDelayLevel = getNextRecursionDelayLevel(sortedEntries, currentRecursionDelayLevel)
      if (nextDelayLevel > currentRecursionDelayLevel) {
        currentRecursionDelayLevel = nextDelayLevel
        nextScanState = 'recursion'
      }
    }

    scanState = nextScanState
  }

  return buildPromptResult([...activated.values()], overflowed)
}

function toCompatEntry(entry: WorldBookEntry, source: WorldInfoSource, entryKey: string): WorldInfoCompatEntry {
  const uid = getEntryUid(entry, source, entryKey)
  const extensions = recordValue(entry.extensions)
  const enabled = booleanValue(entry.enabled, entry.disable !== true)
  const insertionOrder = numberFrom(entry, extensions, ['insertion_order', 'order'], 100)
  const { decorators, content } = parseDecorators(stringFrom(entry, extensions, ['content'], ''))

  return {
    sourceType: source.type,
    world: source.name,
    uid,
    key: stringArrayValue(entry.key ?? entry.keys),
    keysecondary: stringArrayValue(entry.keysecondary ?? entry.secondary_keys),
    comment: stringFrom(entry, extensions, ['comment', 'name'], ''),
    content,
    constant: booleanFrom(entry, extensions, ['constant'], false),
    selective: booleanFrom(entry, extensions, ['selective'], false),
    selectiveLogic: numberFrom(entry, extensions, ['selectiveLogic', 'selective_logic'], WORLD_INFO_LOGIC.AND_ANY),
    order: numberFrom(entry, extensions, ['order', 'insertion_order'], insertionOrder),
    insertion_order: insertionOrder,
    enabled,
    disable: !enabled,
    position: normalizePosition(valueFrom(entry, extensions, ['position']), WORLD_INFO_POSITION.before),
    depth: numberFrom(entry, extensions, ['depth'], DEFAULT_DEPTH),
    role: numberFrom(entry, extensions, ['role'], 0),
    probability: numberFrom(entry, extensions, ['probability'], 100),
    useProbability: booleanFrom(entry, extensions, ['useProbability', 'use_probability'], true),
    group: stringFrom(entry, extensions, ['group'], ''),
    groupOverride: booleanFrom(entry, extensions, ['groupOverride', 'group_override'], false),
    groupWeight: numberFrom(entry, extensions, ['groupWeight', 'group_weight'], DEFAULT_WEIGHT),
    ignoreBudget: booleanFrom(entry, extensions, ['ignoreBudget', 'ignore_budget'], false),
    excludeRecursion: booleanFrom(entry, extensions, ['excludeRecursion', 'exclude_recursion'], false),
    preventRecursion: booleanFrom(entry, extensions, ['preventRecursion', 'prevent_recursion'], false),
    delayUntilRecursion: delayValue(valueFrom(entry, extensions, ['delayUntilRecursion', 'delay_until_recursion'])),
    scanDepth: nullableNumberFrom(entry, extensions, ['scanDepth', 'scan_depth']),
    caseSensitive: nullableBooleanFrom(entry, extensions, ['caseSensitive', 'case_sensitive']),
    matchWholeWords: nullableBooleanFrom(entry, extensions, ['matchWholeWords', 'match_whole_words']),
    useGroupScoring: nullableBooleanFrom(entry, extensions, ['useGroupScoring', 'use_group_scoring']),
    useRegexp: booleanFrom(entry, extensions, ['use_regexp', 'use_regex'], false),
    outletName: stringFrom(entry, extensions, ['outletName', 'outlet_name'], ''),
    matchPersonaDescription: booleanFrom(entry, extensions, ['matchPersonaDescription', 'match_persona_description'], false),
    matchCharacterDescription: booleanFrom(entry, extensions, ['matchCharacterDescription', 'match_character_description'], false),
    matchCharacterPersonality: booleanFrom(entry, extensions, ['matchCharacterPersonality', 'match_character_personality'], false),
    matchCharacterDepthPrompt: booleanFrom(entry, extensions, ['matchCharacterDepthPrompt', 'match_character_depth_prompt'], false),
    matchScenario: booleanFrom(entry, extensions, ['matchScenario', 'match_scenario'], false),
    matchCreatorNotes: booleanFrom(entry, extensions, ['matchCreatorNotes', 'match_creator_notes'], false),
    triggers: stringArrayValue(valueFrom(entry, extensions, ['triggers'])),
    characterFilter: characterFilterValue(valueFrom(entry, extensions, ['characterFilter', 'character_filter'])),
    decorators,
    raw: entry,
  }
}

function isEntryAllowedForScan(entry: WorldInfoCompatEntry, settings: WorldInfoScanSettings): boolean {
  const trigger = settings.trigger ?? 'normal'
  if (entry.triggers.length > 0 && !entry.triggers.includes(trigger)) return false
  if (!entry.characterFilter) return true

  const filter = entry.characterFilter
  const characterName = settings.characterName
  const tags = settings.characterTags ?? []
  const nameIncluded = !!characterName && filter.names.includes(characterName)
  const tagIncluded = filter.tags.some(tag => tags.includes(tag))
  const matched = nameIncluded || tagIncluded
  return filter.isExclude ? !matched : matched
}

function getActivationScore(
  entry: WorldInfoCompatEntry,
  buffer: ScanBuffer,
  scanState: ScanState,
  settings: WorldInfoScanSettings,
): number {
  if (entry.constant) return 1
  if (entry.key.length === 0) return 0

  const textToScan = getTextToScan(entry, buffer, scanState, settings)
  const primaryMatches = entry.key.filter(key => matchKey(key, textToScan, entry, settings)).length
  if (primaryMatches === 0) return 0
  if (!entry.selective || entry.keysecondary.length === 0) return primaryMatches

  const secondaryMatches = entry.keysecondary.filter(key => matchKey(key, textToScan, entry, settings)).length
  const hasAnySecondary = secondaryMatches > 0
  const hasAllSecondary = secondaryMatches === entry.keysecondary.length

  switch (entry.selectiveLogic) {
    case WORLD_INFO_LOGIC.AND_ANY:
      return hasAnySecondary ? primaryMatches + secondaryMatches : 0
    case WORLD_INFO_LOGIC.NOT_ALL:
      return !hasAllSecondary ? primaryMatches : 0
    case WORLD_INFO_LOGIC.NOT_ANY:
      return !hasAnySecondary ? primaryMatches : 0
    case WORLD_INFO_LOGIC.AND_ALL:
      return hasAllSecondary ? primaryMatches + secondaryMatches : 0
    default:
      return hasAnySecondary ? primaryMatches + secondaryMatches : 0
  }
}

function getTextToScan(
  entry: WorldInfoCompatEntry,
  buffer: ScanBuffer,
  scanState: ScanState,
  settings: WorldInfoScanSettings,
): string {
  const depth = clampDepth(entry.scanDepth ?? buffer.depth)
  const parts = buffer.chat.slice(buffer.startDepth, depth)
  const globalParts = getGlobalScanParts(entry, settings)
  if (globalParts.length > 0) parts.push(...globalParts)
  if (buffer.inject.length > 0) parts.push(...buffer.inject)
  if (scanState !== 'min_activations' && buffer.recurse.length > 0) parts.push(...buffer.recurse)
  return parts.join('\n')
}

function getGlobalScanParts(entry: WorldInfoCompatEntry, settings: WorldInfoScanSettings): string[] {
  const data = settings.globalScanData ?? {}
  const parts: string[] = []
  if (entry.matchPersonaDescription && data.personaDescription) parts.push(data.personaDescription)
  if (entry.matchCharacterDescription && data.characterDescription) parts.push(data.characterDescription)
  if (entry.matchCharacterPersonality && data.characterPersonality) parts.push(data.characterPersonality)
  if (entry.matchCharacterDepthPrompt && data.characterDepthPrompt) parts.push(data.characterDepthPrompt)
  if (entry.matchScenario && data.scenario) parts.push(data.scenario)
  if (entry.matchCreatorNotes && data.creatorNotes) parts.push(data.creatorNotes)
  return parts
}

function matchKey(
  key: string,
  text: string,
  entry: WorldInfoCompatEntry,
  settings: WorldInfoScanSettings,
): boolean {
  if (!key) return false

  const parsedRegex = parseSlashRegex(key)
  if (parsedRegex) return parsedRegex.test(text)

  const caseSensitive = entry.caseSensitive ?? settings.caseSensitive ?? false
  const wholeWords = entry.matchWholeWords ?? settings.matchWholeWords ?? false

  if (entry.useRegexp) {
    try {
      return new RegExp(key, caseSensitive ? '' : 'i').test(text)
    } catch {
      return false
    }
  }

  const haystack = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? key : key.toLowerCase()

  if (!wholeWords) return haystack.includes(needle)

  if (needle.trim().split(/\s+/).length > 1) {
    return haystack.includes(needle)
  }

  return new RegExp(`(?:^|\\W)${escapeRegex(needle)}(?:$|\\W)`).test(haystack)
}

function filterByInclusionGroups(
  entries: WorldInfoCompatEntry[],
  allActivatedEntries: Map<string, WorldInfoCompatEntry>,
  buffer: ScanBuffer,
  scanState: ScanState,
  settings: WorldInfoScanSettings,
): WorldInfoCompatEntry[] {
  const keep = new Set(entries)
  const groups = new Map<string, WorldInfoCompatEntry[]>()

  for (const entry of entries) {
    for (const group of splitGroups(entry.group)) {
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push(entry)
    }
  }

  for (const [groupName, groupEntries] of groups) {
    const liveEntries = groupEntries.filter(entry => keep.has(entry))
    if (liveEntries.length <= 1) continue
    if ([...allActivatedEntries.values()].some(entry => splitGroups(entry.group).includes(groupName))) {
      for (const entry of liveEntries) keep.delete(entry)
      continue
    }

    const overrideWinner = sortByOrder(liveEntries.filter(entry => entry.groupOverride))[0]
    const winner = overrideWinner ?? getScoredGroupWinner(liveEntries, buffer, scanState, settings) ?? getWeightedGroupWinner(liveEntries)
    for (const entry of liveEntries) {
      if (entry !== winner) keep.delete(entry)
    }
  }

  return entries.filter(entry => keep.has(entry))
}

function getScoredGroupWinner(
  entries: WorldInfoCompatEntry[],
  buffer: ScanBuffer,
  scanState: ScanState,
  settings: WorldInfoScanSettings,
): WorldInfoCompatEntry | null {
  if (!settings.useGroupScoring && !entries.some(entry => entry.useGroupScoring)) return null
  let winner: WorldInfoCompatEntry | null = null
  let maxScore = -1
  for (const entry of entries) {
    const score = getActivationScore(entry, buffer, scanState, settings)
    if (score > maxScore || (score === maxScore && winner && entry.order > winner.order)) {
      winner = entry
      maxScore = score
    }
  }
  return winner
}

function getWeightedGroupWinner(entries: WorldInfoCompatEntry[]): WorldInfoCompatEntry {
  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(1, entry.groupWeight), 0)
  const rollValue = Math.random() * totalWeight
  let currentWeight = 0
  for (const entry of entries) {
    currentWeight += Math.max(1, entry.groupWeight)
    if (rollValue <= currentWeight) return entry
  }
  return entries[0]
}

function buildPromptResult(entries: WorldInfoCompatEntry[], overflowed: boolean): WorldInfoPromptResult {
  const beforeEntries: string[] = []
  const afterEntries: string[] = []
  const anBefore: string[] = []
  const anAfter: string[] = []
  const worldInfoExamples: Array<{ position: 'before' | 'after'; content: string }> = []
  const worldInfoDepth: Array<{ depth: number; role: number; entries: string[] }> = []
  const outletEntries: Record<string, string[]> = {}
  const matchedEntries: MatchedEntry[] = []

  for (const entry of sortByOrder(entries)) {
    const content = entry.content
    const matchedEntry: MatchedEntry = {
      content,
      position: entry.position,
      depth: entry.depth,
      insertion_order: entry.insertion_order,
      role: entry.role,
      world: entry.world,
      uid: entry.uid,
      outletName: entry.outletName,
    }
    matchedEntries.unshift(matchedEntry)

    switch (entry.position) {
      case WORLD_INFO_POSITION.before:
        beforeEntries.unshift(content)
        break
      case WORLD_INFO_POSITION.after:
        afterEntries.unshift(content)
        break
      case WORLD_INFO_POSITION.ANTop:
        anBefore.unshift(content)
        break
      case WORLD_INFO_POSITION.ANBottom:
        anAfter.unshift(content)
        break
      case WORLD_INFO_POSITION.EMTop:
        worldInfoExamples.unshift({ position: 'before', content })
        break
      case WORLD_INFO_POSITION.EMBottom:
        worldInfoExamples.unshift({ position: 'after', content })
        break
      case WORLD_INFO_POSITION.atDepth: {
        const existing = worldInfoDepth.find(item => item.depth === entry.depth && item.role === entry.role)
        if (existing) existing.entries.unshift(content)
        else worldInfoDepth.push({ depth: entry.depth, role: entry.role, entries: [content] })
        break
      }
      case WORLD_INFO_POSITION.outlet:
        if (entry.outletName) {
          outletEntries[entry.outletName] = [...(outletEntries[entry.outletName] ?? []), content]
        }
        break
    }
  }

  matchedEntries.sort((a, b) => a.insertion_order - b.insertion_order)

  return {
    matchedEntries,
    worldInfoBefore: beforeEntries.join('\n'),
    worldInfoAfter: afterEntries.join('\n'),
    worldInfoExamples,
    worldInfoDepth,
    anBefore,
    anAfter,
    outletEntries,
    allActivatedEntries: entries,
    overflowed,
  }
}

function sortByOrder<T extends { order: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.order - a.order)
}

function getBudget(maxContext: number, settings: WorldInfoScanSettings): number {
  if (typeof settings.budgetTokens === 'number' && Number.isFinite(settings.budgetTokens) && settings.budgetTokens > 0) {
    return Math.floor(settings.budgetTokens)
  }
  const budgetPercent = settings.budgetPercent ?? 100
  let budget = Math.round((budgetPercent * maxContext) / 100) || 1
  if (settings.budgetCap && settings.budgetCap > 0 && budget > settings.budgetCap) budget = settings.budgetCap
  return budget
}

function inferDepth(entries: WorldInfoCompatEntry[]): number {
  const depths = entries.map(entry => entry.scanDepth ?? 0).filter(depth => depth > 0)
  return depths.length ? Math.max(...depths) : DEFAULT_DEPTH
}

function getNextRecursionDelayLevel(entries: WorldInfoCompatEntry[], current: number): number {
  const levels = entries
    .map(entry => entry.delayUntilRecursion)
    .filter(level => level > current)
    .sort((a, b) => a - b)
  return levels[0] ?? current
}

function clampDepth(depth: number): number {
  if (!Number.isFinite(depth) || depth < 0) return 0
  return Math.min(Math.floor(depth), MAX_SCAN_DEPTH)
}

function entryId(entry: WorldInfoCompatEntry): string {
  return `${entry.world}.${entry.uid}`
}

function splitGroups(group: string): string[] {
  return group.split(/,\s*/).map(item => item.trim()).filter(Boolean)
}

function estimateTokenCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return Math.max(1, Math.ceil(trimmed.length / 4))
}

function parseSlashRegex(input: string): RegExp | null {
  const match = input.match(/^\/([\w\W]+?)\/([gimsuy]*)$/)
  if (!match) return null
  const pattern = match[1]
  if (/(^|[^\\])\//.test(pattern)) return null
  try {
    return new RegExp(pattern.replace('\\/', '/'), match[2])
  } catch {
    return null
  }
}

function parseDecorators(content: string): { decorators: string[]; content: string } {
  if (!content.startsWith('@@')) return { decorators: [], content }

  const lines = content.split('\n')
  const decorators: string[] = []
  let contentStart = 0
  let fallbacked = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.startsWith('@@')) {
      contentStart = index
      break
    }

    if (line.startsWith('@@@') && !fallbacked) {
      contentStart = index
      continue
    }

    const normalized = line.startsWith('@@@') ? line.slice(1) : line
    if (KNOWN_DECORATORS.some(decorator => normalized.startsWith(decorator))) {
      decorators.push(normalized)
      fallbacked = false
      contentStart = index + 1
    } else {
      fallbacked = true
      contentStart = index
    }
  }

  return { decorators, content: lines.slice(contentStart).join('\n') }
}

function normalizePosition(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value === 'before' || value === 'before_char') return WORLD_INFO_POSITION.before
  if (value === 'after' || value === 'after_char') return WORLD_INFO_POSITION.after
  if (value === 'an_top' || value === 'author_note_top') return WORLD_INFO_POSITION.ANTop
  if (value === 'an_bottom' || value === 'author_note_bottom') return WORLD_INFO_POSITION.ANBottom
  if (value === 'at_depth') return WORLD_INFO_POSITION.atDepth
  if (value === 'example_top' || value === 'em_top') return WORLD_INFO_POSITION.EMTop
  if (value === 'example_bottom' || value === 'em_bottom') return WORLD_INFO_POSITION.EMBottom
  if (value === 'outlet') return WORLD_INFO_POSITION.outlet
  return fallback
}

function delayValue(value: unknown): number {
  if (value === true) return 1
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 1
  }
  return 0
}

function valueFrom(
  entry: WorldBookEntry,
  extensions: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (Object.hasOwn(entry, key)) return entry[key]
    if (Object.hasOwn(extensions, key)) return extensions[key]
  }
  return undefined
}

function stringFrom(entry: WorldBookEntry, extensions: Record<string, unknown>, keys: string[], fallback: string): string {
  const value = valueFrom(entry, extensions, keys)
  return typeof value === 'string' ? value : fallback
}

function numberFrom(entry: WorldBookEntry, extensions: Record<string, unknown>, keys: string[], fallback: number): number {
  return numberValue(valueFrom(entry, extensions, keys), fallback)
}

function nullableNumberFrom(entry: WorldBookEntry, extensions: Record<string, unknown>, keys: string[]): number | null {
  const value = valueFrom(entry, extensions, keys)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function booleanFrom(entry: WorldBookEntry, extensions: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
  const value = valueFrom(entry, extensions, keys)
  return booleanValue(value, fallback)
}

function nullableBooleanFrom(entry: WorldBookEntry, extensions: Record<string, unknown>, keys: string[]): boolean | null {
  const value = valueFrom(entry, extensions, keys)
  return typeof value === 'boolean' ? value : null
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function characterFilterValue(value: unknown): WorldInfoCharacterFilter | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const names = stringArrayValue(record.names)
  const tags = stringArrayValue(record.tags)
  if (names.length === 0 && tags.length === 0) return null
  return {
    names,
    tags,
    isExclude: booleanValue(record.isExclude, false),
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getEntryUid(entry: WorldBookEntry, source: WorldInfoSource, entryKey: string): number {
  const explicitUid = numberValue(entry.uid, Number.NaN)
  if (Number.isFinite(explicitUid)) return explicitUid
  const numericKey = Number(entryKey)
  if (Number.isFinite(numericKey)) return numericKey
  return hashString(`${source.type}:${source.name}:${entryKey}`)
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}
