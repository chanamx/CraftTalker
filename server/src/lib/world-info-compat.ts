import type { WorldBookEntry } from '../services/world.service.js'
import { throwIfAborted } from './abort.js'

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
const SCAN_SEGMENT_MARKER = '\x01'
const SCAN_SEGMENT_JOINER = `\n${SCAN_SEGMENT_MARKER}`

type SourceType = 'chat' | 'persona' | 'character' | 'global'
export type WorldInfoScanState = 'initial' | 'recursion' | 'min_activations'
type ScanState = WorldInfoScanState
export type WorldInfoTimedEffectType = 'sticky' | 'cooldown' | 'delay'
type TimedEffectType = Exclude<WorldInfoTimedEffectType, 'delay'>
export type TokenCounter = (text: string, signal?: AbortSignal) => number | Promise<number>
export type WorldInfoMacroResolver = (text: string) => string
export type WorldInfoVectorActivator = (input: WorldInfoVectorActivationInput) => WorldInfoVectorActivation[] | Promise<WorldInfoVectorActivation[]>
export type WorldInfoPromptContentTransformer = (
  entries: WorldInfoPromptContentTransformEntry[],
  signal?: AbortSignal,
) => Record<string, string> | Promise<Record<string, string>>

export interface MatchedEntry {
  content: string
  position: number
  depth: number
  insertion_order: number
  role?: number
  world?: string
  uid?: number
  outletName?: string
  ignoreBudget?: boolean
  group?: string
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
  characterTagNames?: string[]
  globalScanData?: WorldInfoGlobalScanData
  timedEffects?: WorldInfoTimedEffectsMetadata
  dryRun?: boolean
  signal?: AbortSignal
  tokenCounter?: TokenCounter
  entriesLoadedHooks?: WorldInfoEntriesLoadedHook[]
  scanDoneHooks?: WorldInfoScanDoneHook[]
  includeNames?: boolean
  scanInjects?: string[]
  forceActivations?: WorldInfoForceActivation[]
  vectorActivations?: WorldInfoVectorActivation[]
  vectorActivator?: WorldInfoVectorActivator
  macroResolver?: WorldInfoMacroResolver
  promptContentTransformer?: WorldInfoPromptContentTransformer
  legacyUseRegexp?: boolean
}

export interface WorldInfoPromptContentTransformEntry {
  id: string
  world: string
  uid: number
  content: string
  position: number
  depth?: number
  role: number
}

export interface WorldInfoChatMessage {
  name?: string
  content: string
}

export interface WorldInfoForceActivation {
  world: string
  uid: number
  content?: string
  position?: number
  depth?: number
  insertion_order?: number
  role?: number
  ignoreBudget?: boolean
  group?: string
}

export interface WorldInfoVectorActivation extends WorldInfoForceActivation {
  score?: number
  source?: string
}

export interface WorldInfoVectorActivationInput {
  entries: WorldInfoCompatEntry[]
  vectorizedEntries: WorldInfoCompatEntry[]
  chat: string[]
  scanText: string
  trigger: string
  isDryRun: boolean
}

export interface WorldInfoGlobalScanData {
  trigger?: string
  personaDescription?: string
  characterDescription?: string
  characterPersonality?: string
  characterDepthPrompt?: string
  scenario?: string
  creatorNotes?: string
}

export interface WorldInfoPromptResult {
  matchedEntries: MatchedEntry[]
  worldInfoString: string
  worldInfoBefore: string
  worldInfoAfter: string
  worldInfoExamples: Array<{ position: 'before' | 'after'; content: string }>
  worldInfoDepth: Array<{ depth: number; role: number; entries: string[] }>
  anBefore: string[]
  anAfter: string[]
  outletEntries: Record<string, string[]>
  allActivatedEntries: WorldInfoScanEventEntry[]
  overflowed: boolean
  timedEffects: WorldInfoTimedEffectsMetadata
  timedEffectsChanged: boolean
  scanEvents: WorldInfoScanEvent[]
  sortedEntries: WorldInfoScanEventEntry[]
  sourceEntries: WorldInfoSourceEntryGroups
  vectorizedSkipped: WorldInfoScanEvent[]
  vectorizedActivated: WorldInfoScanEvent[]
}

export interface WorldInfoScanEvent {
  type: 'vectorized_skipped' | 'vectorized_activated' | 'scan_done'
  entryId?: string
  world?: string
  uid?: number
  reason?: string
  source?: string
  score?: number
  loopCount?: number
  currentState?: ScanState
  nextState?: ScanState | null
  activatedCount?: number
  overflowed?: boolean
  budgetCurrent?: number
  recursionDelayAvailableLevels?: number[]
  recursionDelayCurrentLevel?: number
  newAllEntries?: WorldInfoScanEventEntry[]
  newSuccessfulEntries?: WorldInfoScanEventEntry[]
  activatedEntries?: WorldInfoScanEventEntry[]
  activatedText?: string
  timedEffectsMetadata?: WorldInfoTimedEffectsMetadata
  timedEffectActiveEntryIds?: WorldInfoTimedEffectActiveEntryIds
}

export type WorldInfoScanEventEntry = Omit<WorldInfoCompatEntry, 'raw'>

export interface WorldInfoTimedEffectActiveEntryIds {
  sticky: string[]
  cooldown: string[]
  delay: string[]
}

export interface WorldInfoSourceEntryGroups {
  globalLore: WorldInfoScanEventEntry[]
  characterLore: WorldInfoScanEventEntry[]
  chatLore: WorldInfoScanEventEntry[]
  personaLore: WorldInfoScanEventEntry[]
}

export interface WorldInfoEntriesLoadedHookInput extends WorldInfoCompatEntryGroups {
  trigger: string
  isDryRun: boolean
  characterStrategy: number
}

export interface WorldInfoScanHookInput {
  loopCount: number
  currentState: ScanState
  nextState: ScanState | null
  newEntries: WorldInfoCompatEntry[]
  successfulEntries: WorldInfoCompatEntry[]
  activatedEntries: WorldInfoCompatEntry[]
  budgetRemaining: number
  overflowed: boolean
  state: WorldInfoScanHookState
  trigger: string
  isDryRun: boolean
  isFinal: boolean
  new: WorldInfoScanHookNewEntries
  activated: WorldInfoScanHookActivatedEntries
  sortedEntries: WorldInfoCompatEntry[]
  recursionDelay: WorldInfoScanHookRecursionDelay
  budget: WorldInfoScanHookBudget
  timedEffects: WorldInfoTimedEffectsHookState
}

export interface WorldInfoScanHookState {
  current: ScanState
  next: ScanState | null
  loopCount: number
}

export interface WorldInfoScanHookNewEntries {
  all: WorldInfoCompatEntry[]
  successful: WorldInfoCompatEntry[]
}

export interface WorldInfoScanHookActivatedEntries {
  entries: Map<string, WorldInfoCompatEntry>
  text: string
}

export interface WorldInfoScanHookRecursionDelay {
  availableLevels: number[]
  currentLevel: number
}

export interface WorldInfoScanHookBudget {
  current: number
  overflowed: boolean
}

export interface WorldInfoTimedEffectsHookState {
  metadata: WorldInfoTimedEffectsMetadata
  changed: boolean
  sticky: Set<string>
  cooldown: Set<string>
  delay: Set<string>
  chatLength: number
  isEffectActive: (type: WorldInfoTimedEffectType, entry: WorldInfoCompatEntry) => boolean
  getEffectMetadata: (type: WorldInfoTimedEffectType, entry: WorldInfoCompatEntry) => WorldInfoTimedEffect | undefined
  setTimedEffect: (type: WorldInfoTimedEffectType, entry: WorldInfoCompatEntry, newState: boolean) => void
}

type WorldInfoScanHookPatch = Partial<Pick<WorldInfoScanHookInput, 'nextState' | 'overflowed' | 'budgetRemaining'>> & {
  state?: Partial<WorldInfoScanHookState>
  activated?: Partial<WorldInfoScanHookActivatedEntries>
  recursionDelay?: Partial<WorldInfoScanHookRecursionDelay>
  budget?: Partial<WorldInfoScanHookBudget>
}
type WorldInfoEntriesLoadedHookPatch = Partial<WorldInfoCompatEntryGroups>
export type WorldInfoEntriesLoadedHook = (input: WorldInfoEntriesLoadedHookInput) => void | WorldInfoEntriesLoadedHookPatch | Promise<void | WorldInfoEntriesLoadedHookPatch>
export type WorldInfoScanDoneHook = (input: WorldInfoScanHookInput) => void | WorldInfoScanHookPatch | Promise<void | WorldInfoScanHookPatch>

export interface WorldInfoTimedEffect {
  hash: number
  start: number
  end: number
  protected?: boolean
}

export interface WorldInfoTimedEffectsMetadata {
  sticky: Record<string, WorldInfoTimedEffect>
  cooldown: Record<string, WorldInfoTimedEffect>
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
  vectorized: boolean
  scanDepth: number | null
  caseSensitive: boolean | null
  matchWholeWords: boolean | null
  useGroupScoring: boolean | null
  useRegexp: boolean
  outletName: string
  automationId: string
  sticky: number
  cooldown: number
  delay: number
  hash: number
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

interface WorldInfoCompatEntryGroups {
  globalLore: WorldInfoCompatEntry[]
  characterLore: WorldInfoCompatEntry[]
  chatLore: WorldInfoCompatEntry[]
  personaLore: WorldInfoCompatEntry[]
}

interface WorldInfoCharacterFilter {
  names: string[]
  tags: string[]
  isExclude: boolean
}

interface CheckWorldInfoInput {
  sources: WorldInfoSource[]
  chat: string[]
  chatMessages?: WorldInfoChatMessage[]
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

interface TimedEffectRuntime {
  metadata: WorldInfoTimedEffectsMetadata
  changed: boolean
  dryRun: boolean
  sticky: Set<string>
  cooldown: Set<string>
  delay: Set<string>
  chatLength: number
}

interface CheckWorldInfoRuntime {
  sortedEntries: WorldInfoCompatEntry[]
  buffer: ScanBuffer
  maxContext: number
  budget: number
  overflowed: boolean
  scanState: ScanState | null
  loopCount: number
  currentRecursionDelayLevel: number
  availableRecursionDelayLevels: number[]
  activated: Map<string, WorldInfoCompatEntry>
  failedProbability: Set<string>
  activatedVectorized: Set<string>
  forceActivations: Map<string, Partial<WorldInfoCompatEntry>>
  timedEffects: TimedEffectRuntime
  scanEvents: WorldInfoScanEvent[]
  activatedText: string
  tokenCounter: TokenCounter
}

type CheckWorldInfoExecutionEffect =
  | { type: 'get-sorted-entries'; sources: WorldInfoSource[]; settings: WorldInfoScanSettings }
  | { type: 'apply-vector-activations'; runtime: CheckWorldInfoRuntime; settings: WorldInfoScanSettings }
  | { type: 'count-tokens'; tokenCounter: TokenCounter; text: string }
  | { type: 'emit-scan-done-hooks'; settings: WorldInfoScanSettings; input: WorldInfoScanHookInput }
  | { type: 'transform-prompt-content'; transformer: WorldInfoPromptContentTransformer; entries: WorldInfoPromptContentTransformEntry[] }

type CheckWorldInfoExecutionResult = void | number | WorldInfoCompatEntry[] | WorldInfoScanHookPatch | Record<string, string>

export function getSortedWorldInfoEntries(
  sources: WorldInfoSource[],
  settings: WorldInfoScanSettings = {},
): WorldInfoCompatEntry[] {
  const groups = getCompatSourceEntryGroups(sources)
  emitEntriesLoadedHooksSync(settings, groups)
  return sortCompatSourceEntryGroups(groups, settings)
}

function getCompatSourceEntryGroups(sources: WorldInfoSource[]): WorldInfoCompatEntryGroups {
  const groups: WorldInfoCompatEntryGroups = {
    globalLore: [],
    characterLore: [],
    chatLore: [],
    personaLore: [],
  }

  for (const source of sources) {
    const group = getCompatSourceEntryGroup(groups, source.type)
    for (const [entryKey, entry] of Object.entries(source.entries)) {
      group.push(toCompatEntry(entry, source, entryKey))
    }
  }

  return groups
}

function sortCompatSourceEntryGroups(
  groups: WorldInfoCompatEntryGroups,
  settings: WorldInfoScanSettings,
): WorldInfoCompatEntry[] {
  const chatLore = sortByOrder(asSourceType(groups.chatLore, 'chat'))
  const personaLore = sortByOrder(asSourceType(groups.personaLore, 'persona'))
  const characterLore = sortByOrder(asSourceType(groups.characterLore, 'character'))
  const globalLore = sortByOrder(asSourceType(groups.globalLore, 'global'))
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

function getCompatSourceEntryGroup(
  groups: WorldInfoCompatEntryGroups,
  sourceType: SourceType,
): WorldInfoCompatEntry[] {
  switch (sourceType) {
    case 'global':
      return groups.globalLore
    case 'character':
      return groups.characterLore
    case 'chat':
      return groups.chatLore
    case 'persona':
      return groups.personaLore
  }
}

function asSourceType(entries: WorldInfoCompatEntry[], sourceType: SourceType): WorldInfoCompatEntry[] {
  return entries.map(entry => entry.sourceType === sourceType ? entry : { ...entry, sourceType })
}

async function getSortedWorldInfoEntriesAsync(
  sources: WorldInfoSource[],
  settings: WorldInfoScanSettings,
): Promise<WorldInfoCompatEntry[]> {
  const groups = getCompatSourceEntryGroups(sources)
  await emitEntriesLoadedHooks(settings, groups)
  return sortCompatSourceEntryGroups(groups, settings)
}

async function emitEntriesLoadedHooks(
  settings: WorldInfoScanSettings,
  groups: WorldInfoCompatEntryGroups,
): Promise<void> {
  for (const hook of settings.entriesLoadedHooks ?? []) {
    const input = buildEntriesLoadedHookInput(settings, groups)
    const result = await hook(input)
    applyEntriesLoadedHookPatch(groups, input)
    if (result && typeof result === 'object') applyEntriesLoadedHookPatch(groups, result)
  }
}

function emitEntriesLoadedHooksSync(
  settings: WorldInfoScanSettings,
  groups: WorldInfoCompatEntryGroups,
): void {
  for (const hook of settings.entriesLoadedHooks ?? []) {
    const input = buildEntriesLoadedHookInput(settings, groups)
    const result = hook(input)
    if (isPromiseLike(result)) {
      throw new Error('getSortedWorldInfoEntries and checkWorldInfoSync require synchronous entriesLoadedHooks')
    }
    applyEntriesLoadedHookPatch(groups, input)
    if (result && typeof result === 'object') applyEntriesLoadedHookPatch(groups, result)
  }
}

function buildEntriesLoadedHookInput(
  settings: WorldInfoScanSettings,
  groups: WorldInfoCompatEntryGroups,
): WorldInfoEntriesLoadedHookInput {
  return {
    globalLore: groups.globalLore,
    characterLore: groups.characterLore,
    chatLore: groups.chatLore,
    personaLore: groups.personaLore,
    trigger: settings.trigger ?? 'normal',
    isDryRun: settings.dryRun === true,
    characterStrategy: settings.characterStrategy ?? WORLD_INFO_INSERTION_STRATEGY.character_first,
  }
}

function applyEntriesLoadedHookPatch(
  groups: WorldInfoCompatEntryGroups,
  patch: Partial<WorldInfoCompatEntryGroups>,
): void {
  replaceEntriesLoadedGroup(groups, patch, 'globalLore')
  replaceEntriesLoadedGroup(groups, patch, 'characterLore')
  replaceEntriesLoadedGroup(groups, patch, 'chatLore')
  replaceEntriesLoadedGroup(groups, patch, 'personaLore')
}

function replaceEntriesLoadedGroup(
  groups: WorldInfoCompatEntryGroups,
  patch: Partial<WorldInfoCompatEntryGroups>,
  key: keyof WorldInfoCompatEntryGroups,
): void {
  if (!Object.hasOwn(patch, key)) return
  const value = patch[key]
  if (!Array.isArray(value)) return
  groups[key] = value.filter(isCompatEntryLike)
}

function isCompatEntryLike(value: unknown): value is WorldInfoCompatEntry {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.world === 'string'
    && Number.isFinite(numberValue(record.uid, Number.NaN))
    && Array.isArray(record.key)
    && typeof record.content === 'string'
}

export function checkWorldInfo(input: CheckWorldInfoInput): Promise<WorldInfoPromptResult> {
  return runCheckWorldInfo(input)
}

export function checkWorldInfoSync(input: CheckWorldInfoInput): WorldInfoPromptResult {
  return runCheckWorldInfoSync(input)
}

async function runCheckWorldInfo(input: CheckWorldInfoInput): Promise<WorldInfoPromptResult> {
  const signal = input.settings?.signal
  throwIfAborted(signal, 'World-info scan aborted')
  const execution = executeCheckWorldInfo(input)
  let step = execution.next()
  while (!step.done) {
    throwIfAborted(signal, 'World-info scan aborted')
    const effectResult = await runCheckWorldInfoEffect(step.value, signal)
    throwIfAborted(signal, 'World-info scan aborted')
    step = execution.next(effectResult)
  }
  return step.value
}

function runCheckWorldInfoSync(input: CheckWorldInfoInput): WorldInfoPromptResult {
  const signal = input.settings?.signal
  throwIfAborted(signal, 'World-info scan aborted')
  const execution = executeCheckWorldInfo(input)
  let step = execution.next()
  while (!step.done) {
    throwIfAborted(signal, 'World-info scan aborted')
    const effectResult = runCheckWorldInfoEffectSync(step.value, signal)
    throwIfAborted(signal, 'World-info scan aborted')
    step = execution.next(effectResult)
  }
  return step.value
}

function* executeCheckWorldInfo(
  input: CheckWorldInfoInput,
): Generator<CheckWorldInfoExecutionEffect, WorldInfoPromptResult, CheckWorldInfoExecutionResult> {
  const settings = normalizeScanSettings(input.settings)
  const sortedEntries = (yield { type: 'get-sorted-entries', sources: input.sources, settings }) as WorldInfoCompatEntry[]
  const runtime = createRuntime(input, settings, sortedEntries)
  yield { type: 'apply-vector-activations', runtime, settings }

  while (runtime.scanState) {
    runtime.loopCount += 1
    if (settings.maxRecursionSteps && runtime.loopCount > settings.maxRecursionSteps) break

    const possibleEntries: WorldInfoCompatEntry[] = []

    for (const entry of runtime.sortedEntries) {
      const key = entryId(entry)
      if (runtime.activated.has(key) || runtime.failedProbability.has(key)) continue
      if (!entry.enabled) continue
      if (!isEntryAllowedForScan(entry, settings)) continue
      const isSticky = isTimedEffectActive(runtime.timedEffects, 'sticky', entry)
      if (isTimedEffectActive(runtime.timedEffects, 'delay', entry)) continue
      if (isTimedEffectActive(runtime.timedEffects, 'cooldown', entry) && !isSticky) continue
      if (runtime.scanState === 'recursion' && entry.excludeRecursion && !isSticky) continue
      if (runtime.scanState !== 'recursion' && entry.delayUntilRecursion > 0 && !isSticky) continue
      if (runtime.scanState === 'recursion' && entry.delayUntilRecursion > runtime.currentRecursionDelayLevel && !isSticky) continue

      if (entry.decorators.includes('@@activate')) {
        possibleEntries.push(entry)
        continue
      }
      if (entry.decorators.includes('@@dont_activate')) continue

      const forcedEntry = getForcedActivation(runtime, entry)
      if (forcedEntry) {
        possibleEntries.push(forcedEntry)
        continue
      }

      if (isSticky) {
        possibleEntries.push(entry)
        continue
      }

      const score = getActivationScore(entry, runtime.buffer, runtime.scanState, settings)
      if (entry.constant || score > 0) {
        possibleEntries.push(entry)
      }
    }

    const newEntries = filterByInclusionGroups(
      sortScanCandidates(possibleEntries, runtime),
      runtime.activated,
      runtime.buffer,
      runtime.scanState,
      settings,
      runtime.timedEffects,
    )

    const successfulEntries: WorldInfoCompatEntry[] = []
    let newContent = ''
    const activatedTokens = (yield {
      type: 'count-tokens',
      tokenCounter: runtime.tokenCounter,
      text: runtime.activatedText,
    }) as number
    let remainingIgnoresBudget = newEntries.filter(entry => entry.ignoreBudget).length

    for (const entry of newEntries) {
      if (entry.ignoreBudget) remainingIgnoresBudget -= 1
      if (runtime.overflowed && !entry.ignoreBudget) {
        if (remainingIgnoresBudget > 0) continue
        break
      }

      if (!passesProbabilityCheck(runtime, entry)) continue

      const activatedEntry = resolveEntryForActivation(entry, settings)
      successfulEntries.push(activatedEntry)
      newContent += `${activatedEntry.content}\n`
      const prospectiveTokens = activatedTokens + ((yield {
        type: 'count-tokens',
        tokenCounter: runtime.tokenCounter,
        text: newContent,
      }) as number)
      if (!entry.ignoreBudget && prospectiveTokens >= runtime.budget) {
        runtime.overflowed = true
        continue
      }

      runtime.activated.set(entryId(entry), activatedEntry)
    }

    const successfulForRecursion = successfulEntries.filter(entry => !entry.preventRecursion)
    const baseNextScanState = getNextScanState(runtime, settings, successfulForRecursion)
    updateRecursionBuffer(runtime, baseNextScanState, successfulForRecursion)
    const usedTokens = (yield {
      type: 'count-tokens',
      tokenCounter: runtime.tokenCounter,
      text: getActivatedText(runtime.activated),
    }) as number
    const budgetRemaining = Math.max(0, runtime.budget - usedTokens)
    const hookInput = buildScanHookInput(runtime, settings, newEntries, successfulEntries, baseNextScanState, budgetRemaining)
    const hookPatch = (yield {
      type: 'emit-scan-done-hooks',
      settings,
      input: hookInput,
    }) as WorldInfoScanHookPatch
    const patchResult = applyScanHookPatch(runtime, hookInput, hookPatch, usedTokens)

    runtime.scanEvents.push({
      type: 'scan_done',
      loopCount: runtime.loopCount,
      currentState: runtime.scanState,
      nextState: patchResult.nextState,
      activatedCount: runtime.activated.size,
      overflowed: patchResult.overflowed,
      budgetCurrent: runtime.budget,
      recursionDelayAvailableLevels: [...runtime.availableRecursionDelayLevels],
      recursionDelayCurrentLevel: runtime.currentRecursionDelayLevel,
      newAllEntries: newEntries.map(toScanEventEntry),
      newSuccessfulEntries: successfulEntries.map(toScanEventEntry),
      activatedEntries: [...runtime.activated.values()].map(toScanEventEntry),
      activatedText: runtime.activatedText,
      timedEffectsMetadata: cloneTimedEffectsMetadata(runtime.timedEffects.metadata),
      timedEffectActiveEntryIds: getTimedEffectActiveEntryIds(runtime.timedEffects),
    })

    runtime.overflowed = patchResult.overflowed
    runtime.scanState = patchResult.nextState
  }

  throwIfAborted(settings.signal, 'World-info scan aborted')
  setTimedEffects(runtime.timedEffects, [...runtime.activated.values()], settings.dryRun === true)
  const activatedEntries = [...runtime.activated.values()]
  const transformedContent = settings.promptContentTransformer
    ? (yield {
        type: 'transform-prompt-content',
        transformer: settings.promptContentTransformer,
        entries: activatedEntries.map(toPromptContentTransformEntry),
      }) as Record<string, string>
    : undefined
  return buildPromptResult(activatedEntries, runtime.overflowed, runtime.timedEffects, runtime.scanEvents, runtime.sortedEntries, transformedContent)
}

async function runCheckWorldInfoEffect(effect: CheckWorldInfoExecutionEffect, signal?: AbortSignal): Promise<CheckWorldInfoExecutionResult> {
  switch (effect.type) {
    case 'get-sorted-entries':
      return getSortedWorldInfoEntriesAsync(effect.sources, effect.settings)
    case 'apply-vector-activations':
      return applyVectorActivations(effect.runtime, effect.settings)
    case 'count-tokens':
      return countTokens(effect.tokenCounter, effect.text, signal)
    case 'emit-scan-done-hooks':
      return emitScanDoneHooks(effect.settings, effect.input)
    case 'transform-prompt-content':
      return normalizeTransformedPromptContent(await effect.transformer(effect.entries, signal), effect.entries)
  }
}

function runCheckWorldInfoEffectSync(effect: CheckWorldInfoExecutionEffect, signal?: AbortSignal): CheckWorldInfoExecutionResult {
  switch (effect.type) {
    case 'get-sorted-entries':
      return getSortedWorldInfoEntries(effect.sources, effect.settings)
    case 'apply-vector-activations':
      return applyVectorActivationsSync(effect.runtime, effect.settings)
    case 'count-tokens':
      return countTokensSync(effect.tokenCounter, effect.text, signal)
    case 'emit-scan-done-hooks':
      return emitScanDoneHooksSync(effect.settings, effect.input)
    case 'transform-prompt-content': {
      const result = effect.transformer(effect.entries, signal)
      if (isPromiseLike(result)) {
        throw new Error('checkWorldInfoSync requires a synchronous promptContentTransformer')
      }
      return normalizeTransformedPromptContent(result, effect.entries)
    }
  }
}

function normalizeScanSettings(settings: WorldInfoScanSettings | undefined): WorldInfoScanSettings {
  const normalized = { ...(settings ?? {}) }
  const minActivations = normalized.minActivations ?? 0
  const maxRecursionSteps = normalized.maxRecursionSteps ?? 0
  if (maxRecursionSteps > 0 && minActivations > 0) {
    normalized.minActivations = 0
    normalized.minActivationsDepthMax = 0
  }
  return normalized
}

function createRuntime(
  input: CheckWorldInfoInput,
  settings: WorldInfoScanSettings,
  sortedEntries: WorldInfoCompatEntry[],
): CheckWorldInfoRuntime {
  const chat = normalizeScanChat(input, settings)
  const availableRecursionDelayLevels = getRecursionDelayLevels(sortedEntries)
  const currentRecursionDelayLevel = availableRecursionDelayLevels.shift() ?? 0
  const buffer: ScanBuffer = {
    chat,
    recurse: [],
    inject: normalizeScanInjects(settings.scanInjects),
    depth: clampDepth(settings.depth ?? DEFAULT_DEPTH),
    startDepth: 0,
  }
  const maxContext = input.maxContext ?? DEFAULT_CONTEXT_SIZE
  return {
    sortedEntries,
    buffer,
    maxContext,
    budget: getBudget(maxContext, settings),
    overflowed: false,
    scanState: 'initial',
    loopCount: 0,
    currentRecursionDelayLevel,
    availableRecursionDelayLevels,
    activated: new Map(),
    failedProbability: new Set(),
    activatedVectorized: new Set(),
    forceActivations: normalizeForceActivations(settings.forceActivations),
    timedEffects: prepareTimedEffects(settings.timedEffects, sortedEntries, chat.length, settings.dryRun === true),
    scanEvents: [],
    activatedText: '',
    tokenCounter: settings.tokenCounter ?? estimateTokenCount,
  }
}

function normalizeScanChat(input: CheckWorldInfoInput, settings: WorldInfoScanSettings): string[] {
  if (!input.chatMessages) return input.chat.map(message => message.trim())
  return input.chatMessages.map((message) => {
    const content = message.content.trim()
    const name = message.name?.trim()
    return settings.includeNames !== false && name ? `${name}: ${content}` : content
  })
}

function normalizeScanInjects(scanInjects: string[] | undefined): string[] {
  return Array.isArray(scanInjects)
    ? scanInjects.filter(item => item.trim().length > 0)
    : []
}

function normalizeForceActivations(forceActivations: WorldInfoForceActivation[] | undefined): Map<string, Partial<WorldInfoCompatEntry>> {
  const result = new Map<string, Partial<WorldInfoCompatEntry>>()
  if (!Array.isArray(forceActivations)) return result

  for (const activation of forceActivations) {
    const key = activationKey(activation)
    if (!key) continue
    result.set(key, activationPatch(activation))
  }

  return result
}

async function applyVectorActivations(
  runtime: CheckWorldInfoRuntime,
  settings: WorldInfoScanSettings,
): Promise<void> {
  const activations = [...normalizeVectorActivations(settings.vectorActivations)]
  if (settings.vectorActivator) {
    const dynamicActivations = await settings.vectorActivator(buildVectorActivationInput(runtime, settings))
    activations.push(...normalizeVectorActivations(dynamicActivations))
  }
  applyVectorActivationList(runtime, activations)
}

function applyVectorActivationsSync(
  runtime: CheckWorldInfoRuntime,
  settings: WorldInfoScanSettings,
): void {
  const activations = [...normalizeVectorActivations(settings.vectorActivations)]
  if (settings.vectorActivator) {
    const dynamicActivations = settings.vectorActivator(buildVectorActivationInput(runtime, settings))
    if (isPromiseLike(dynamicActivations)) {
      throw new Error('checkWorldInfoSync requires a synchronous vectorActivator')
    }
    activations.push(...normalizeVectorActivations(dynamicActivations))
  }
  applyVectorActivationList(runtime, activations)
}

function normalizeVectorActivations(activations: WorldInfoVectorActivation[] | undefined): WorldInfoVectorActivation[] {
  if (!Array.isArray(activations)) return []
  return activations.filter((activation): activation is WorldInfoVectorActivation => {
    return !!activation && typeof activation === 'object' && activationKey(activation) !== null
  })
}

function buildVectorActivationInput(
  runtime: CheckWorldInfoRuntime,
  settings: WorldInfoScanSettings,
): WorldInfoVectorActivationInput {
  const chat = [...runtime.buffer.chat]
  return {
    entries: runtime.sortedEntries,
    vectorizedEntries: runtime.sortedEntries.filter(entry => entry.vectorized),
    chat,
    scanText: [...chat, ...runtime.buffer.inject].join('\n'),
    trigger: settings.trigger ?? 'normal',
    isDryRun: settings.dryRun === true,
  }
}

function applyVectorActivationList(
  runtime: CheckWorldInfoRuntime,
  activations: WorldInfoVectorActivation[],
): void {
  if (activations.length === 0) return

  const vectorizedEntries = new Map(
    runtime.sortedEntries
      .filter(entry => entry.vectorized)
      .map(entry => [entryId(entry), entry]),
  )

  for (const activation of activations) {
    const key = activationKey(activation)
    if (!key) continue

    const entry = vectorizedEntries.get(key)
    if (!entry) continue

    const existingPatch = runtime.forceActivations.get(key) ?? {}
    runtime.forceActivations.set(key, { ...existingPatch, ...activationPatch(activation) })
    pushVectorizedActivatedEvent(runtime, entry, activation)
  }
}

function activationKey(activation: WorldInfoForceActivation): string | null {
  if (!activation || typeof activation !== 'object') return null
  const world = typeof activation.world === 'string' ? activation.world.trim() : ''
  const uid = Math.floor(numberValue(activation.uid, Number.NaN))
  if (!world || uid < 0) return null
  return `${world}.${uid}`
}

function activationPatch(activation: WorldInfoForceActivation): Partial<WorldInfoCompatEntry> {
  const patch: Partial<WorldInfoCompatEntry> = {}
  if (typeof activation.content === 'string') patch.content = activation.content
  if (typeof activation.ignoreBudget === 'boolean') patch.ignoreBudget = activation.ignoreBudget
  if (typeof activation.group === 'string') patch.group = activation.group
  patchNumber(patch, 'position', activation.position)
  patchNumber(patch, 'depth', activation.depth)
  patchNumber(patch, 'insertion_order', activation.insertion_order)
  patchNumber(patch, 'role', activation.role)
  return patch
}

function patchNumber<T extends 'position' | 'depth' | 'insertion_order' | 'role'>(
  patch: Partial<WorldInfoCompatEntry>,
  key: T,
  value: unknown,
): void {
  const parsed = numberValue(value, Number.NaN)
  if (Number.isFinite(parsed)) patch[key] = Math.floor(parsed)
}

function toCompatEntry(entry: WorldBookEntry, source: WorldInfoSource, entryKey: string): WorldInfoCompatEntry {
  const uid = getEntryUid(entry, source, entryKey)
  const extensions = recordValue(entry.extensions)
  const enabled = booleanValue(entry.enabled, entry.disable !== true)
  const insertionOrder = numberFrom(entry, extensions, ['insertion_order', 'order'], 100)
  const { decorators, content } = parseDecorators(stringFrom(entry, extensions, ['content'], ''))
  const compatForHash = {
    sourceType: source.type,
    world: source.name,
    uid,
    key: stringArrayValue(entry.key ?? entry.keys),
    keysecondary: stringArrayValue(entry.keysecondary ?? entry.secondary_keys),
    content,
    insertion_order: insertionOrder,
    order: numberFrom(entry, extensions, ['order', 'insertion_order'], insertionOrder),
  }

  return {
    sourceType: compatForHash.sourceType,
    world: compatForHash.world,
    uid,
    key: compatForHash.key,
    keysecondary: compatForHash.keysecondary,
    comment: stringFrom(entry, extensions, ['comment', 'name'], ''),
    content: compatForHash.content,
    constant: booleanFrom(entry, extensions, ['constant'], false),
    selective: booleanFrom(entry, extensions, ['selective'], false),
    selectiveLogic: numberFrom(entry, extensions, ['selectiveLogic', 'selective_logic'], WORLD_INFO_LOGIC.AND_ANY),
    order: compatForHash.order,
    insertion_order: compatForHash.insertion_order,
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
    vectorized: booleanFrom(entry, extensions, ['vectorized'], false),
    scanDepth: scanDepthValue(entry, extensions),
    caseSensitive: nullableBooleanFrom(entry, extensions, ['caseSensitive', 'case_sensitive']),
    matchWholeWords: nullableBooleanFrom(entry, extensions, ['matchWholeWords', 'match_whole_words']),
    useGroupScoring: nullableBooleanFrom(entry, extensions, ['useGroupScoring', 'use_group_scoring']),
    useRegexp: booleanFrom(entry, extensions, ['use_regexp', 'use_regex'], false),
    outletName: stringFrom(entry, extensions, ['outletName', 'outlet_name'], ''),
    automationId: stringFrom(entry, extensions, ['automationId', 'automation_id'], ''),
    sticky: numberFrom(entry, extensions, ['sticky'], 0),
    cooldown: numberFrom(entry, extensions, ['cooldown'], 0),
    delay: numberFrom(entry, extensions, ['delay'], 0),
    hash: hashString(JSON.stringify(compatForHash)),
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
  if (filter.names.length > 0) {
    const characterName = settings.characterName
    const nameIncluded = !!characterName && filter.names.includes(characterName)
    if (filter.isExclude ? nameIncluded : !nameIncluded) return false
  }

  const characterTags = characterFilterTagCandidates(settings)
  if (filter.tags.length > 0 && characterTags) {
    const tagIncluded = characterTags.some(tag => filter.tags.includes(tag))
    if (filter.isExclude ? tagIncluded : !tagIncluded) return false
  }

  return true
}

function characterFilterTagCandidates(settings: WorldInfoScanSettings): string[] | null {
  if (!Array.isArray(settings.characterTags) && !Array.isArray(settings.characterTagNames)) return null

  const tags = [
    ...(settings.characterTags ?? []),
    ...(settings.characterTagNames ?? []),
  ].map(tag => String(tag).trim()).filter(Boolean)

  return [...new Set(tags)]
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
  return joinScanSegments(parts)
}

function joinScanSegments(parts: string[]): string {
  return parts.length > 0 ? `${SCAN_SEGMENT_MARKER}${parts.join(SCAN_SEGMENT_JOINER)}` : ''
}

function getActivatedText(activated: Map<string, WorldInfoCompatEntry>): string {
  return [...activated.values()]
    .map(entry => entry.content)
    .filter(Boolean)
    .join('\n')
}

function resolveEntryForActivation(entry: WorldInfoCompatEntry, settings: WorldInfoScanSettings): WorldInfoCompatEntry {
  const content = resolveScanMacros(entry.content, settings)
  return content === entry.content ? entry : { ...entry, content }
}

function toScanEventEntry(entry: WorldInfoCompatEntry): WorldInfoScanEventEntry {
  const result: Partial<WorldInfoCompatEntry> = { ...entry }
  delete result.raw
  return result as WorldInfoScanEventEntry
}

function getSourceEntryGroups(entries: WorldInfoCompatEntry[]): WorldInfoSourceEntryGroups {
  const groups: WorldInfoSourceEntryGroups = {
    globalLore: [],
    characterLore: [],
    chatLore: [],
    personaLore: [],
  }

  for (const entry of entries) {
    const eventEntry = toScanEventEntry(entry)
    switch (entry.sourceType) {
      case 'global':
        groups.globalLore.push(eventEntry)
        break
      case 'character':
        groups.characterLore.push(eventEntry)
        break
      case 'chat':
        groups.chatLore.push(eventEntry)
        break
      case 'persona':
        groups.personaLore.push(eventEntry)
        break
    }
  }

  return groups
}

async function countTokens(tokenCounter: TokenCounter, text: string, signal?: AbortSignal): Promise<number> {
  const count = await tokenCounter(text, signal)
  return normalizeTokenCount(count)
}

function countTokensSync(tokenCounter: TokenCounter, text: string, signal?: AbortSignal): number {
  const count = tokenCounter(text, signal)
  if (isPromiseLike(count)) {
    throw new Error('checkWorldInfoSync requires a synchronous tokenCounter')
  }
  return normalizeTokenCount(count)
}

function normalizeTokenCount(count: unknown): number {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return 0
  return Math.floor(count)
}

function sortScanCandidates(entries: WorldInfoCompatEntry[], runtime: CheckWorldInfoRuntime): WorldInfoCompatEntry[] {
  return [...entries].sort((a, b) => {
    const aSticky = isTimedEffectActive(runtime.timedEffects, 'sticky', a) ? 1 : 0
    const bSticky = isTimedEffectActive(runtime.timedEffects, 'sticky', b) ? 1 : 0
    return bSticky - aSticky || sortedEntryIndex(runtime, a) - sortedEntryIndex(runtime, b)
  })
}

function sortedEntryIndex(runtime: CheckWorldInfoRuntime, entry: WorldInfoCompatEntry): number {
  const index = runtime.sortedEntries.findIndex(item => entryId(item) === entryId(entry))
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function getForcedActivation(runtime: CheckWorldInfoRuntime, entry: WorldInfoCompatEntry): WorldInfoCompatEntry | null {
  const patch = runtime.forceActivations.get(entryId(entry))
  if (!patch) return null
  if (Object.keys(patch).length === 0) return entry
  return { ...entry, ...patch, world: entry.world, uid: entry.uid, raw: entry.raw }
}

function passesProbabilityCheck(runtime: CheckWorldInfoRuntime, entry: WorldInfoCompatEntry): boolean {
  if (isTimedEffectActive(runtime.timedEffects, 'sticky', entry)) return true
  if (!entry.useProbability || entry.probability >= 100) return true
  const passed = Math.random() * 100 <= entry.probability
  if (!passed) runtime.failedProbability.add(entryId(entry))
  return passed
}

function getNextScanState(
  runtime: CheckWorldInfoRuntime,
  settings: WorldInfoScanSettings,
  successfulForRecursion: WorldInfoCompatEntry[],
): ScanState | null {
  if (settings.recursive && !runtime.overflowed && successfulForRecursion.length > 0) {
    return 'recursion'
  }

  if (settings.recursive && !runtime.overflowed && runtime.scanState === 'min_activations' && runtime.buffer.recurse.length > 0) {
    return 'recursion'
  }

  const minActivations = settings.minActivations ?? 0
  const minActivationsDepthMax = settings.minActivationsDepthMax ?? 0
  if (!runtime.overflowed && minActivations > 0 && runtime.activated.size < minActivations) {
    const currentDepth = runtime.buffer.depth
    const overDepth = (minActivationsDepthMax > 0 && currentDepth > minActivationsDepthMax) || currentDepth > runtime.buffer.chat.length
    if (!overDepth) {
      runtime.buffer.depth = clampDepth(currentDepth + 1)
      return 'min_activations'
    }
  }

  if (settings.recursive) {
    const nextDelayLevel = runtime.availableRecursionDelayLevels.shift()
    if (nextDelayLevel !== undefined) {
      runtime.currentRecursionDelayLevel = nextDelayLevel
      return 'recursion'
    }
  }

  return null
}

function updateRecursionBuffer(
  runtime: CheckWorldInfoRuntime,
  nextScanState: ScanState | null,
  successfulForRecursion: WorldInfoCompatEntry[],
): void {
  if (!nextScanState) return
  const text = successfulForRecursion.map(entry => entry.content).filter(Boolean).join('\n')
  if (!text) return
  runtime.buffer.recurse.push(text)
  runtime.activatedText = `${text}\n${runtime.activatedText}`
}

function buildScanHookInput(
  runtime: CheckWorldInfoRuntime,
  settings: WorldInfoScanSettings,
  newEntries: WorldInfoCompatEntry[],
  successfulEntries: WorldInfoCompatEntry[],
  nextState: ScanState | null,
  budgetRemaining: number,
): WorldInfoScanHookInput {
  const activatedEntries = [...runtime.activated.values()]
  return {
    loopCount: runtime.loopCount,
    currentState: runtime.scanState!,
    nextState,
    newEntries,
    successfulEntries,
    activatedEntries,
    budgetRemaining,
    overflowed: runtime.overflowed,
    state: {
      current: runtime.scanState!,
      next: nextState,
      loopCount: runtime.loopCount,
    },
    trigger: settings.trigger ?? 'normal',
    isDryRun: settings.dryRun === true,
    isFinal: nextState === null,
    new: {
      all: newEntries,
      successful: successfulEntries,
    },
    activated: {
      entries: runtime.activated,
      text: runtime.activatedText,
    },
    sortedEntries: runtime.sortedEntries,
    recursionDelay: {
      availableLevels: [...runtime.availableRecursionDelayLevels],
      currentLevel: runtime.currentRecursionDelayLevel,
    },
    budget: {
      current: runtime.budget,
      overflowed: runtime.overflowed,
    },
    timedEffects: createTimedEffectsHookState(runtime.timedEffects),
  }
}

function createTimedEffectsHookState(runtime: TimedEffectRuntime): WorldInfoTimedEffectsHookState {
  return {
    metadata: runtime.metadata,
    get changed() {
      return runtime.changed
    },
    sticky: runtime.sticky,
    cooldown: runtime.cooldown,
    delay: runtime.delay,
    chatLength: runtime.chatLength,
    isEffectActive: (type, entry) => isTimedEffectActive(runtime, type, entry),
    getEffectMetadata: (type, entry) => getTimedEffectMetadata(runtime, type, entry),
    setTimedEffect: (type, entry, newState) => setTimedEffect(runtime, type, entry, newState),
  }
}

function cloneTimedEffectsMetadata(metadata: WorldInfoTimedEffectsMetadata): WorldInfoTimedEffectsMetadata {
  const cloneRecord = (record: Record<string, WorldInfoTimedEffect>) => Object.fromEntries(
    Object.entries(record).map(([key, effect]) => [key, { ...effect }]),
  )
  return {
    sticky: cloneRecord(metadata.sticky),
    cooldown: cloneRecord(metadata.cooldown),
  }
}
function getTimedEffectActiveEntryIds(runtime: TimedEffectRuntime): WorldInfoTimedEffectActiveEntryIds {
  return {
    sticky: [...runtime.sticky].sort(),
    cooldown: [...runtime.cooldown].sort(),
    delay: [...runtime.delay].sort(),
  }
}

function applyScanHookPatch(
  runtime: CheckWorldInfoRuntime,
  hookInput: WorldInfoScanHookInput,
  hookPatch: WorldInfoScanHookPatch,
  usedTokens: number,
): { nextState: ScanState | null; overflowed: boolean } {
  const nextState = normalizeScanState(
    pickDefined(hookPatch.nextState, hookPatch.state?.next, hookInput.nextState, hookInput.state.next),
    hookInput.state.next,
  )
  const overflowed = booleanOrFallback(
    pickDefined(hookPatch.overflowed, hookPatch.budget?.overflowed, hookInput.overflowed, hookInput.budget.overflowed),
    hookInput.budget.overflowed,
  )
  const budget = numberOrFallback(
    pickDefined(hookPatch.budget?.current, hookInput.budget.current),
    hookInput.budget.current,
  )
  const budgetRemaining = Object.hasOwn(hookPatch, 'budgetRemaining')
    ? numberOrFallback(hookPatch.budgetRemaining, Number.NaN)
    : Number.NaN
  const currentDelayLevel = numberOrFallback(
    pickDefined(hookPatch.recursionDelay?.currentLevel, hookInput.recursionDelay.currentLevel),
    hookInput.recursionDelay.currentLevel,
  )
  const availableDelayLevels = numberArrayOrFallback(
    pickDefined(hookPatch.recursionDelay?.availableLevels, hookInput.recursionDelay.availableLevels),
    hookInput.recursionDelay.availableLevels,
  )
  const activatedText = stringOrFallback(
    pickDefined(hookPatch.activated?.text, hookInput.activated.text),
    hookInput.activated.text,
  )
  const activatedEntries = mapOrFallback(
    pickDefined(hookPatch.activated?.entries, hookInput.activated.entries),
    hookInput.activated.entries,
  )

  runtime.activated = activatedEntries
  runtime.currentRecursionDelayLevel = Math.max(0, Math.floor(currentDelayLevel))
  runtime.availableRecursionDelayLevels = availableDelayLevels
    .map(level => Math.max(0, Math.floor(level)))
    .filter(level => level > runtime.currentRecursionDelayLevel)
    .sort((a, b) => a - b)
  runtime.activatedText = activatedText

  if (Number.isFinite(budgetRemaining)) {
    runtime.budget = usedTokens + Math.max(0, Math.floor(budgetRemaining))
  } else {
    runtime.budget = Math.max(1, Math.floor(budget))
  }

  return { nextState, overflowed }
}

function normalizeScanState(value: unknown, fallback: ScanState | null): ScanState | null {
  if (value === undefined) return fallback
  if (value === null || value === 'none' || value === 0) return null
  if (value === 'initial' || value === 'recursion' || value === 'min_activations') return value
  return fallback
}

function pickDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find(value => value !== undefined)
}

function booleanOrFallback(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function numberOrFallback(value: unknown, fallback: number): number {
  const parsed = numberValue(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : fallback
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function numberArrayOrFallback(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback
  return value
    .map(item => numberValue(item, Number.NaN))
    .filter(Number.isFinite)
}

function sameNumberArray(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function mapOrFallback<K, V>(value: unknown, fallback: Map<K, V>): Map<K, V> {
  return value instanceof Map ? value as Map<K, V> : fallback
}

function pushVectorizedActivatedEvent(
  runtime: CheckWorldInfoRuntime,
  entry: WorldInfoCompatEntry,
  activation: WorldInfoVectorActivation,
): void {
  const id = entryId(entry)
  const source = typeof activation.source === 'string' ? activation.source : undefined
  const score = typeof activation.score === 'number' && Number.isFinite(activation.score) ? activation.score : undefined
  if (runtime.activatedVectorized.has(id)) {
    const existing = runtime.scanEvents.find(event => event.type === 'vectorized_activated' && event.entryId === id)
    if (existing) {
      existing.source = source
      existing.score = score
    }
    return
  }
  runtime.activatedVectorized.add(id)
  runtime.scanEvents.push({
    type: 'vectorized_activated',
    entryId: id,
    world: entry.world,
    uid: entry.uid,
    source,
    score,
  })
}

async function emitScanDoneHooks(
  settings: WorldInfoScanSettings,
  input: WorldInfoScanHookInput,
): Promise<WorldInfoScanHookPatch> {
  let patch: WorldInfoScanHookPatch = {}
  const mutableInput = cloneScanHookInput(input)
  for (const hook of settings.scanDoneHooks ?? []) {
    applyPatchToScanHookInput(mutableInput, patch)
    const hookInput = cloneScanHookInput(mutableInput)
    const beforeHookInput = cloneScanHookInput(mutableInput)
    const result = await hook(hookInput)
    patch = mergeScanHookPatch(patch, extractScanHookMutationPatch(beforeHookInput, hookInput))
    if (result && typeof result === 'object') {
      patch = mergeScanHookPatch(patch, result)
    }
    applyPatchToScanHookInput(mutableInput, patch)
  }
  return patch
}

function emitScanDoneHooksSync(
  settings: WorldInfoScanSettings,
  input: WorldInfoScanHookInput,
): WorldInfoScanHookPatch {
  let patch: WorldInfoScanHookPatch = {}
  const mutableInput = cloneScanHookInput(input)
  for (const hook of settings.scanDoneHooks ?? []) {
    applyPatchToScanHookInput(mutableInput, patch)
    const hookInput = cloneScanHookInput(mutableInput)
    const beforeHookInput = cloneScanHookInput(mutableInput)
    const result = hook(hookInput)
    if (isPromiseLike(result)) {
      throw new Error('checkWorldInfoSync requires synchronous scanDoneHooks')
    }
    patch = mergeScanHookPatch(patch, extractScanHookMutationPatch(beforeHookInput, hookInput))
    if (result && typeof result === 'object') {
      patch = mergeScanHookPatch(patch, result)
    }
    applyPatchToScanHookInput(mutableInput, patch)
  }
  return patch
}

function cloneScanHookInput(input: WorldInfoScanHookInput): WorldInfoScanHookInput {
  return {
    ...input,
    state: { ...input.state },
    new: {
      all: input.new.all,
      successful: input.new.successful,
    },
    activated: {
      entries: input.activated.entries,
      text: input.activated.text,
    },
    recursionDelay: {
      availableLevels: [...input.recursionDelay.availableLevels],
      currentLevel: input.recursionDelay.currentLevel,
    },
    budget: { ...input.budget },
  }
}

function extractScanHookMutationPatch(
  before: WorldInfoScanHookInput,
  after: WorldInfoScanHookInput,
): WorldInfoScanHookPatch {
  let patch: WorldInfoScanHookPatch = {}

  if (after.nextState !== before.nextState) patch = mergeScanHookPatch(patch, { nextState: after.nextState })
  if (after.state.next !== before.state.next) patch = mergeScanHookPatch(patch, { state: { next: after.state.next } })
  if (after.overflowed !== before.overflowed) patch = mergeScanHookPatch(patch, { overflowed: after.overflowed })
  if (after.budget.overflowed !== before.budget.overflowed) patch = mergeScanHookPatch(patch, { budget: { overflowed: after.budget.overflowed } })
  if (after.budgetRemaining !== before.budgetRemaining) patch = mergeScanHookPatch(patch, { budgetRemaining: after.budgetRemaining })
  if (after.budget.current !== before.budget.current) patch = mergeScanHookPatch(patch, { budget: { current: after.budget.current } })
  if (after.activated.text !== before.activated.text) patch = mergeScanHookPatch(patch, { activated: { text: after.activated.text } })
  if (after.activated.entries !== before.activated.entries) patch = mergeScanHookPatch(patch, { activated: { entries: after.activated.entries } })
  if (after.recursionDelay.currentLevel !== before.recursionDelay.currentLevel) {
    patch = mergeScanHookPatch(patch, { recursionDelay: { currentLevel: after.recursionDelay.currentLevel } })
  }
  if (!sameNumberArray(after.recursionDelay.availableLevels, before.recursionDelay.availableLevels)) {
    patch = mergeScanHookPatch(patch, { recursionDelay: { availableLevels: after.recursionDelay.availableLevels } })
  }

  return patch
}

function mergeScanHookPatch(base: WorldInfoScanHookPatch, next: WorldInfoScanHookPatch): WorldInfoScanHookPatch {
  const merged: WorldInfoScanHookPatch = {
    ...base,
    ...next,
    state: next.state ? { ...base.state, ...next.state } : base.state,
    activated: next.activated ? { ...base.activated, ...next.activated } : base.activated,
    recursionDelay: next.recursionDelay ? { ...base.recursionDelay, ...next.recursionDelay } : base.recursionDelay,
    budget: next.budget ? { ...base.budget, ...next.budget } : base.budget,
  }

  if (next.state && Object.hasOwn(next.state, 'next') && !Object.hasOwn(next, 'nextState')) {
    merged.nextState = next.state.next
  }
  if (next.budget && Object.hasOwn(next.budget, 'overflowed') && !Object.hasOwn(next, 'overflowed')) {
    merged.overflowed = next.budget.overflowed
  }
  if (next.budget && Object.hasOwn(next.budget, 'current') && !Object.hasOwn(next, 'budgetRemaining')) {
    delete merged.budgetRemaining
  }

  return merged
}

function applyPatchToScanHookInput(input: WorldInfoScanHookInput, patch: WorldInfoScanHookPatch): void {
  const nextState = normalizeScanState(pickDefined(patch.nextState, patch.state?.next), input.state.next)
  input.nextState = nextState
  input.state.next = nextState
  input.isFinal = nextState === null

  const overflowed = booleanOrFallback(pickDefined(patch.overflowed, patch.budget?.overflowed), input.budget.overflowed)
  input.overflowed = overflowed
  input.budget.overflowed = overflowed

  const budget = numberOrFallback(patch.budget?.current, input.budget.current)
  input.budget.current = Math.max(1, Math.floor(budget))

  const budgetRemaining = numberOrFallback(patch.budgetRemaining, input.budgetRemaining)
  input.budgetRemaining = Math.max(0, Math.floor(budgetRemaining))

  input.activated.text = stringOrFallback(patch.activated?.text, input.activated.text)
  input.activated.entries = mapOrFallback(patch.activated?.entries, input.activated.entries)
  input.recursionDelay.currentLevel = Math.max(
    0,
    Math.floor(numberOrFallback(patch.recursionDelay?.currentLevel, input.recursionDelay.currentLevel)),
  )
  input.recursionDelay.availableLevels = numberArrayOrFallback(
    patch.recursionDelay?.availableLevels,
    input.recursionDelay.availableLevels,
  )
  input.activatedEntries = [...input.activated.entries.values()]
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
  key = resolveScanMacros(key, settings).trim()
  if (!key) return false

  const parsedRegex = parseSlashRegex(key)
  if (parsedRegex) return parsedRegex.test(text)

  const caseSensitive = entry.caseSensitive ?? settings.caseSensitive ?? false
  const wholeWords = entry.matchWholeWords ?? settings.matchWholeWords ?? false

  if (settings.legacyUseRegexp && entry.useRegexp) {
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

function resolveScanMacros(text: string, settings: WorldInfoScanSettings): string {
  if (!settings.macroResolver || !text.includes('{{')) return text
  try {
    const resolved = settings.macroResolver(text)
    return typeof resolved === 'string' ? resolved : text
  } catch {
    return text
  }
}

function filterByInclusionGroups(
  entries: WorldInfoCompatEntry[],
  allActivatedEntries: Map<string, WorldInfoCompatEntry>,
  buffer: ScanBuffer,
  scanState: ScanState,
  settings: WorldInfoScanSettings,
  timedEffects?: TimedEffectRuntime,
): WorldInfoCompatEntry[] {
  const keep = new Set(entries)
  const groups = new Map<string, WorldInfoCompatEntry[]>()

  for (const entry of entries) {
    for (const group of splitGroups(entry.group)) {
      const groupEntries = groups.get(group) ?? []
      groupEntries.push(entry)
      groups.set(group, groupEntries)
    }
  }

  const stickyGroups = applyGroupTimedEffects(groups, keep, timedEffects)
  applyGroupScoring(groups, keep, buffer, scanState, settings, stickyGroups)

  for (const [groupName, groupEntries] of groups) {
    const liveEntries = groupEntries.filter(entry => keep.has(entry))
    if (stickyGroups.has(groupName)) continue
    if ([...allActivatedEntries.values()].some(entry => entry.group === groupName)) {
      for (const entry of liveEntries) keep.delete(entry)
      continue
    }
    if (liveEntries.length <= 1) continue

    const winner = sortByOrder(liveEntries.filter(entry => entry.groupOverride))[0]
      ?? getWeightedGroupWinner(liveEntries)
    for (const entry of liveEntries) {
      if (entry !== winner) keep.delete(entry)
    }
  }

  return entries.filter(entry => keep.has(entry))
}

function applyGroupTimedEffects(
  groups: Map<string, WorldInfoCompatEntry[]>,
  keep: Set<WorldInfoCompatEntry>,
  timedEffects: TimedEffectRuntime | undefined,
): Set<string> {
  const stickyGroups = new Set<string>()
  if (!timedEffects) return stickyGroups

  for (const [groupName, groupEntries] of groups) {
    const liveEntries = groupEntries.filter(entry => keep.has(entry))
    const stickyEntries = liveEntries.filter(entry => isTimedEffectActive(timedEffects, 'sticky', entry))
    if (stickyEntries.length > 0) {
      stickyGroups.add(groupName)
      for (const entry of liveEntries) {
        if (!stickyEntries.includes(entry)) keep.delete(entry)
      }
    }

    for (const entry of liveEntries) {
      if (isTimedEffectActive(timedEffects, 'cooldown', entry) || isTimedEffectActive(timedEffects, 'delay', entry)) {
        keep.delete(entry)
      }
    }
  }

  return stickyGroups
}

function applyGroupScoring(
  groups: Map<string, WorldInfoCompatEntry[]>,
  keep: Set<WorldInfoCompatEntry>,
  buffer: ScanBuffer,
  scanState: ScanState,
  settings: WorldInfoScanSettings,
  stickyGroups: Set<string>,
): void {
  for (const [groupName, groupEntries] of groups) {
    if (stickyGroups.has(groupName)) continue

    const liveEntries = groupEntries.filter(entry => keep.has(entry))
    if (!settings.useGroupScoring && !liveEntries.some(entry => entry.useGroupScoring === true)) continue

    const scores = liveEntries.map(entry => getGroupMatchScore(entry, buffer, scanState, settings))
    const maxScore = Math.max(...scores)
    for (let index = 0; index < liveEntries.length; index += 1) {
      const entry = liveEntries[index]
      const isScored = entry.useGroupScoring ?? (settings.useGroupScoring === true)
      if (isScored && scores[index] < maxScore) {
        keep.delete(entry)
      }
    }
  }
}

function getGroupMatchScore(
  entry: WorldInfoCompatEntry,
  buffer: ScanBuffer,
  scanState: ScanState,
  settings: WorldInfoScanSettings,
): number {
  if (entry.key.length === 0) return 0

  const textToScan = getTextToScan(entry, buffer, scanState, settings)
  const primaryScore = entry.key.filter(key => matchKey(key, textToScan, entry, settings)).length
  const secondaryScore = entry.keysecondary.filter(key => matchKey(key, textToScan, entry, settings)).length

  if (entry.keysecondary.length > 0) {
    switch (entry.selectiveLogic) {
      case WORLD_INFO_LOGIC.AND_ANY:
        return primaryScore + secondaryScore
      case WORLD_INFO_LOGIC.AND_ALL:
        return secondaryScore === entry.keysecondary.length ? primaryScore + secondaryScore : primaryScore
      default:
        return primaryScore
    }
  }

  return primaryScore
}

function getWeightedGroupWinner(entries: WorldInfoCompatEntry[]): WorldInfoCompatEntry {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.groupWeight, 0)
  const rollValue = Math.random() * totalWeight
  let currentWeight = 0
  for (const entry of entries) {
    currentWeight += entry.groupWeight
    if (rollValue <= currentWeight) return entry
  }
  return entries[0]
}

function buildPromptResult(
  entries: WorldInfoCompatEntry[],
  overflowed: boolean,
  timedEffects: TimedEffectRuntime,
  scanEvents: WorldInfoScanEvent[],
  sortedEntries: WorldInfoCompatEntry[],
  transformedContent?: Record<string, string>,
): WorldInfoPromptResult {
  const beforeEntries: string[] = []
  const afterEntries: string[] = []
  const anBefore: string[] = []
  const anAfter: string[] = []
  const worldInfoExamples: Array<{ position: 'before' | 'after'; content: string }> = []
  const worldInfoDepth: Array<{ depth: number; role: number; entries: string[] }> = []
  const outletEntries: Record<string, string[]> = {}
  const matchedEntries: MatchedEntry[] = []

  for (const entry of sortByOrder(entries)) {
    const id = entryId(entry)
    const content = Object.hasOwn(transformedContent ?? {}, id)
      ? transformedContent?.[id] ?? entry.content
      : entry.content
    if (!content) continue
    const matchedEntry: MatchedEntry = {
      content,
      position: entry.position,
      depth: entry.depth,
      insertion_order: entry.insertion_order,
      role: entry.role,
      world: entry.world,
      uid: entry.uid,
      outletName: entry.outletName,
      ignoreBudget: entry.ignoreBudget,
      group: entry.group,
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

  const worldInfoBefore = beforeEntries.join('\n')
  const worldInfoAfter = afterEntries.join('\n')

  return {
    matchedEntries,
    worldInfoString: worldInfoBefore + worldInfoAfter,
    worldInfoBefore,
    worldInfoAfter,
    worldInfoExamples,
    worldInfoDepth,
    anBefore,
    anAfter,
    outletEntries,
    allActivatedEntries: entries.map(toScanEventEntry),
    overflowed,
    timedEffects: timedEffects.metadata,
    timedEffectsChanged: timedEffects.changed,
    scanEvents,
    sortedEntries: sortedEntries.map(toScanEventEntry),
    sourceEntries: getSourceEntryGroups(sortedEntries),
    vectorizedSkipped: scanEvents.filter(event => event.type === 'vectorized_skipped'),
    vectorizedActivated: scanEvents.filter(event => event.type === 'vectorized_activated'),
  }
}

function toPromptContentTransformEntry(entry: WorldInfoCompatEntry): WorldInfoPromptContentTransformEntry {
  return {
    id: entryId(entry),
    world: entry.world,
    uid: entry.uid,
    content: entry.content,
    position: entry.position,
    depth: entry.position === WORLD_INFO_POSITION.atDepth ? entry.depth : undefined,
    role: entry.role,
  }
}

function normalizeTransformedPromptContent(
  value: Record<string, string>,
  entries: WorldInfoPromptContentTransformEntry[],
): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const entry of entries) {
    const content = value?.[entry.id]
    if (typeof content === 'string') normalized[entry.id] = content
  }
  return normalized
}

function prepareTimedEffects(
  metadata: WorldInfoTimedEffectsMetadata | undefined,
  entries: WorldInfoCompatEntry[],
  chatLength: number,
  dryRun: boolean,
): TimedEffectRuntime {
  const clonedMetadata = cloneTimedEffects(metadata, entries, chatLength)
  const runtime: TimedEffectRuntime = {
    metadata: clonedMetadata.metadata,
    changed: clonedMetadata.changed,
    dryRun,
    sticky: new Set(),
    cooldown: new Set(),
    delay: new Set(),
    chatLength,
  }

  for (const entry of entries) {
    if (entry.delay > 0 && chatLength < entry.delay) {
      runtime.delay.add(entryId(entry))
    }
  }

  if (!dryRun) {
    applyStoredTimedEffects(runtime, 'sticky', entries)
    applyStoredTimedEffects(runtime, 'cooldown', entries)
  }

  return runtime
}

function cloneTimedEffects(
  metadata: WorldInfoTimedEffectsMetadata | undefined,
  entries: WorldInfoCompatEntry[],
  chatLength: number,
): { metadata: WorldInfoTimedEffectsMetadata; changed: boolean } {
  if (!metadata) {
    return { metadata: { sticky: {}, cooldown: {} }, changed: false }
  }
  const entryLookup = createTimedEffectEntryLookup(entries)
  const metadataRecord = recordValue(metadata)
  const sticky = cloneTimedEffectRecord(metadataRecord.sticky, 'sticky', entryLookup, chatLength)
  const cooldown = cloneTimedEffectRecord(metadataRecord.cooldown, 'cooldown', entryLookup, chatLength)
  return {
    metadata: {
      sticky: sticky.record,
      cooldown: cooldown.record,
    },
    changed: sticky.changed || cooldown.changed,
  }
}

function cloneTimedEffectRecord(
  record: unknown,
  type: TimedEffectType,
  entryLookup: Map<string, WorldInfoCompatEntry>,
  chatLength: number,
): { record: Record<string, WorldInfoTimedEffect>; changed: boolean } {
  const result: Record<string, WorldInfoTimedEffect> = {}
  let changed = record === undefined
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { record: result, changed: true }
  }
  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== 'object') {
      changed = true
      continue
    }
    const valueRecord = value as Record<string, unknown>
    const hash = numberValue(valueRecord.hash, Number.NaN)
    const start = numberValue(valueRecord.start, Number.NaN)
    const end = numberValue(valueRecord.end, Number.NaN)
    if (!Number.isFinite(hash) || !Number.isFinite(start) || !Number.isFinite(end)) {
      const normalized = normalizeForeignTimedEffect(key, valueRecord, type, entryLookup, chatLength)
      if (normalized) {
        result[normalized.key] = normalized.effect
      }
      changed = true
      continue
    }
    result[key] = { hash, start, end, protected: valueRecord.protected === true }
  }
  return { record: result, changed }
}

function createTimedEffectEntryLookup(entries: WorldInfoCompatEntry[]): Map<string, WorldInfoCompatEntry> {
  const lookup = new Map<string, WorldInfoCompatEntry>()
  for (const entry of entries) {
    lookup.set(entryId(entry), entry)
    const rawUid = recordValue(entry.raw).uid
    if (typeof rawUid === 'string' || typeof rawUid === 'number') {
      lookup.set(`${entry.world}.${rawUid}`, entry)
    }
  }
  return lookup
}

function normalizeForeignTimedEffect(
  key: string,
  value: Record<string, unknown>,
  type: TimedEffectType,
  entryLookup: Map<string, WorldInfoCompatEntry>,
  chatLength: number,
): { key: string; effect: WorldInfoTimedEffect } | null {
  const entry = resolveTimedEffectEntry(key, value, entryLookup)
  if (!entry || entry[type] <= 0) return null

  const end = numberValue(value.end, Number.NaN)
  if (!Number.isFinite(end)) return null

  const explicitStart = numberValue(value.start, Number.NaN)
  const start = Number.isFinite(explicitStart)
    ? Math.floor(explicitStart)
    : inferForeignTimedEffectStart(end, entry[type], chatLength)

  return {
    key: entryId(entry),
    effect: {
      hash: entry.hash,
      start,
      end: Math.floor(end),
      protected: value.protected === true,
    },
  }
}

function resolveTimedEffectEntry(
  key: string,
  value: Record<string, unknown>,
  entryLookup: Map<string, WorldInfoCompatEntry>,
): WorldInfoCompatEntry | undefined {
  const directEntry = entryLookup.get(key)
  if (directEntry) return directEntry

  if (typeof value.world !== 'string' || !value.world) return undefined
  if (typeof value.uid !== 'string' && typeof value.uid !== 'number') return undefined

  return entryLookup.get(`${value.world}.${value.uid}`)
}

function inferForeignTimedEffectStart(end: number, duration: number, chatLength: number): number {
  const nominalStart = Math.floor(end) - Math.max(1, Math.floor(duration))
  return Math.min(nominalStart, Math.floor(chatLength) - 1)
}

function applyStoredTimedEffects(
  runtime: TimedEffectRuntime,
  type: TimedEffectType,
  entries: WorldInfoCompatEntry[],
): void {
  const effects = runtime.metadata[type]
  for (const [key, effect] of Object.entries(effects)) {
    const entry = entries.find(item => item.hash === effect.hash)

    if (runtime.chatLength <= effect.start && effect.protected !== true) {
      delete effects[key]
      runtime.changed = true
      continue
    }

    if (!entry) {
      if (runtime.chatLength >= effect.end) {
        delete effects[key]
        runtime.changed = true
      }
      continue
    }

    if (entry[type] <= 0) {
      delete effects[key]
      runtime.changed = true
      continue
    }

    if (runtime.chatLength >= effect.end) {
      delete effects[key]
      runtime.changed = true
      if (type === 'sticky' && entry.cooldown > 0) {
        const cooldown = makeTimedEffect(runtime, entry, 'cooldown', true)
        runtime.metadata.cooldown[entryId(entry)] = cooldown
        runtime.cooldown.add(entryId(entry))
      }
      continue
    }

    runtime[type].add(entryId(entry))
  }
}

function setTimedEffects(
  runtime: TimedEffectRuntime,
  activatedEntries: WorldInfoCompatEntry[],
  dryRun: boolean,
): void {
  if (dryRun) return
  for (const entry of activatedEntries) {
    setTimedEffectOfType(runtime, entry, 'sticky')
    setTimedEffectOfType(runtime, entry, 'cooldown')
  }
}

function setTimedEffectOfType(
  runtime: TimedEffectRuntime,
  entry: WorldInfoCompatEntry,
  type: TimedEffectType,
): void {
  if (entry[type] <= 0) return
  const key = entryId(entry)
  if (runtime.metadata[type][key]) return
  runtime.metadata[type][key] = makeTimedEffect(runtime, entry, type, false)
  runtime.changed = true
}

function getTimedEffectMetadata(
  runtime: TimedEffectRuntime,
  type: WorldInfoTimedEffectType,
  entry: WorldInfoCompatEntry,
): WorldInfoTimedEffect | undefined {
  if (type === 'delay') {
    if (!isTimedEffectActive(runtime, 'delay', entry)) return undefined
    return {
      hash: entry.hash,
      start: 0,
      end: entry.delay,
      protected: false,
    }
  }
  return runtime.metadata[type][entryId(entry)]
}

function setTimedEffect(
  runtime: TimedEffectRuntime,
  type: WorldInfoTimedEffectType,
  entry: WorldInfoCompatEntry,
  newState: boolean,
): void {
  const key = entryId(entry)
  if (type === 'delay') {
    runtime.delay.delete(key)
    if (newState) runtime.delay.add(key)
    return
  }

  if (runtime.dryRun) return

  delete runtime.metadata[type][key]
  runtime[type].delete(key)
  if (!newState || entry[type] <= 0) {
    runtime.changed = true
    return
  }

  runtime.metadata[type][key] = makeTimedEffect(runtime, entry, type, false)
  runtime[type].add(key)
  runtime.changed = true
}

function makeTimedEffect(
  runtime: TimedEffectRuntime,
  entry: WorldInfoCompatEntry,
  type: TimedEffectType,
  isProtected: boolean,
): WorldInfoTimedEffect {
  return {
    hash: entry.hash,
    start: runtime.chatLength,
    end: runtime.chatLength + entry[type],
    protected: isProtected,
  }
}

function isTimedEffectActive(
  runtime: TimedEffectRuntime,
  type: TimedEffectType | 'delay',
  entry: WorldInfoCompatEntry,
): boolean {
  return runtime[type].has(entryId(entry))
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

function getRecursionDelayLevels(entries: WorldInfoCompatEntry[]): number[] {
  return [...new Set(entries
    .map(entry => entry.delayUntilRecursion)
    .filter(level => level > 0))]
    .sort((a, b) => a - b)
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

function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
  return !!value && typeof value === 'object' && 'then' in value && typeof (value as { then?: unknown }).then === 'function'
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

function scanDepthValue(entry: WorldBookEntry, extensions: Record<string, unknown>): number | null {
  const extensionValue = nullableNumberValue(extensions.scanDepth ?? extensions.scan_depth)
  if (extensionValue !== null) return extensionValue

  const entryRecord = entry as Record<string, unknown>
  const topLevelValue = nullableNumberValue(entryRecord.scanDepth ?? entryRecord.scan_depth)
  if (topLevelValue === 100) return null
  return topLevelValue
}

function nullableNumberValue(value: unknown): number | null {
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
