export type GenerationOperation = 'generate' | 'regenerate' | 'continue'

export interface GenerationLockInfo {
  characterName: string
  chatId: string
  operation: GenerationOperation
  startedAt: number
}

export interface GenerationLock extends GenerationLockInfo {
  signal: AbortSignal
  release: () => void
}

export interface GenerationSchedulerLimits {
  concurrency: number
  queueCapacity: number
  perOwnerProviderConcurrency: number
}

export interface GenerationSchedulerStatus {
  accepting: boolean
  limits: GenerationSchedulerLimits & { queueWaitTimeoutMs: number }
  activeCount: number
  queuedCount: number
  oldestQueuedAgeMs: number | null
}

export type GenerationAdmissionResult =
  | { status: 'acquired'; lock: GenerationLock; queued: boolean }
  | {
      status: 'rejected'
      reason: 'not_accepting' | 'duplicate' | 'queue_full' | 'queue_timeout' | 'client_aborted'
      existing?: GenerationLockInfo
      retryAfterSeconds?: number
    }

interface SchedulingGenerationInfo extends GenerationLockInfo {
  ownerId: string
  providerKey: string
  resourceKey: string
}

interface ActiveGeneration extends SchedulingGenerationInfo {
  controller: AbortController
}

interface QueuedGeneration extends SchedulingGenerationInfo {
  key: string
  signal?: AbortSignal
  resolve: (result: GenerationAdmissionResult) => void
  onAbort?: () => void
  timeout?: ReturnType<typeof setTimeout>
}

const activeLocks = new Map<string, ActiveGeneration>()
const queuedAdmissions: QueuedGeneration[] = []
const queuedByKey = new Map<string, QueuedGeneration>()
const drainWaiters = new Set<() => void>()
let acceptingGenerations = true

const DEFAULT_GENERATION_CONCURRENCY = 4
const DEFAULT_GENERATION_QUEUE_CAPACITY = 100
const PER_OWNER_PROVIDER_CONCURRENCY = 2
const GENERATION_QUEUE_WAIT_TIMEOUT_MS = 30_000

function lockKey(characterName: string, chatId: string): string {
  return `${characterName}\u0000${chatId}`
}

export function tryAcquireGenerationLock(
  characterName: string,
  chatId: string,
  operation: GenerationOperation,
): GenerationLock | null {
  if (!acceptingGenerations) return null

  const key = lockKey(characterName, chatId)
  if (activeLocks.has(key) || queuedByKey.has(key)) return null
  const limits = resolveGenerationSchedulerLimits()
  const info = schedulingInfo({ characterName, chatId, operation })
  if (activeLocks.size >= limits.concurrency || !hasResourceCapacity(info.resourceKey, limits)) return null

  return createActiveGenerationLock(key, info)
}

export async function acquireGenerationLock(input: {
  characterName: string
  chatId: string
  operation: GenerationOperation
  signal?: AbortSignal
  ownerId?: string
  providerKey?: string
}): Promise<GenerationAdmissionResult> {
  if (input.signal?.aborted) return { status: 'rejected', reason: 'client_aborted' }
  if (!acceptingGenerations) return { status: 'rejected', reason: 'not_accepting' }

  const key = lockKey(input.characterName, input.chatId)
  const existing = activeLocks.get(key) ?? queuedByKey.get(key)
  if (existing) {
    return {
      status: 'rejected',
      reason: 'duplicate',
      existing: generationInfo(existing),
    }
  }

  const limits = resolveGenerationSchedulerLimits()
  const info = schedulingInfo(input)
  if (activeLocks.size < limits.concurrency && hasResourceCapacity(info.resourceKey, limits)) {
    return {
      status: 'acquired',
      lock: createActiveGenerationLock(key, info),
      queued: false,
    }
  }
  if (queuedAdmissions.length >= limits.queueCapacity) {
    return {
      status: 'rejected',
      reason: 'queue_full',
      retryAfterSeconds: 1,
    }
  }

  return new Promise(resolve => {
    const queued: QueuedGeneration = {
      ...info,
      key,
      signal: input.signal,
      resolve,
    }
    if (input.signal) {
      queued.onAbort = () => removeQueuedAdmission(queued, 'client_aborted')
      input.signal.addEventListener('abort', queued.onAbort, { once: true })
    }
    queued.timeout = setTimeout(
      () => removeQueuedAdmission(queued, 'queue_timeout'),
      GENERATION_QUEUE_WAIT_TIMEOUT_MS,
    )
    queued.timeout.unref?.()
    queuedAdmissions.push(queued)
    queuedByKey.set(key, queued)
  })
}

export function resolveGenerationSchedulerLimits(
  environment: NodeJS.ProcessEnv = process.env,
): GenerationSchedulerLimits {
  return {
    concurrency: boundedInteger(
      environment.CRAFTTALKER_GENERATION_CONCURRENCY,
      DEFAULT_GENERATION_CONCURRENCY,
      1,
      64,
    ),
    queueCapacity: boundedInteger(
      environment.CRAFTTALKER_GENERATION_QUEUE_CAPACITY,
      DEFAULT_GENERATION_QUEUE_CAPACITY,
      0,
      1_000,
    ),
    perOwnerProviderConcurrency: PER_OWNER_PROVIDER_CONCURRENCY,
  }
}

function createActiveGenerationLock(key: string, info: SchedulingGenerationInfo): GenerationLock {
  const active: ActiveGeneration = {
    ...info,
    controller: new AbortController(),
  }
  activeLocks.set(key, active)

  let released = false
  return {
    ...generationInfo(active),
    signal: active.controller.signal,
    release: () => {
      if (released) return
      released = true
      if (activeLocks.get(key) === active) {
        activeLocks.delete(key)
        promoteQueuedAdmissions()
        notifyDrainWaitersIfIdle()
      }
    },
  }
}

export function getGenerationLockInfo(characterName: string, chatId: string): GenerationLockInfo | null {
  const key = lockKey(characterName, chatId)
  const generation = activeLocks.get(key) ?? queuedByKey.get(key)
  return generation ? generationInfo(generation) : null
}

export function getActiveGenerationCount(): number {
  return activeLocks.size
}

export function getQueuedGenerationCount(): number {
  return queuedAdmissions.length
}

export function getGenerationSchedulerStatus(now = Date.now()): GenerationSchedulerStatus {
  const limits = resolveGenerationSchedulerLimits()
  const oldest = queuedAdmissions[0]
  return {
    accepting: acceptingGenerations,
    limits: { ...limits, queueWaitTimeoutMs: GENERATION_QUEUE_WAIT_TIMEOUT_MS },
    activeCount: activeLocks.size,
    queuedCount: queuedAdmissions.length,
    oldestQueuedAgeMs: oldest ? Math.max(0, now - oldest.startedAt) : null,
  }
}

export function isAcceptingGenerations(): boolean {
  return acceptingGenerations
}

export function abortActiveGenerations(reason: unknown = 'Server shutting down'): number {
  acceptingGenerations = false
  rejectQueuedAdmissions('not_accepting')
  for (const active of activeLocks.values()) {
    if (!active.controller.signal.aborted) active.controller.abort(reason)
  }
  notifyDrainWaitersIfIdle()
  return activeLocks.size
}

export async function waitForGenerationDrain(timeoutMs: number): Promise<boolean> {
  if (activeLocks.size === 0 && queuedAdmissions.length === 0) return true

  return new Promise(resolve => {
    let settled = false
    const finish = (drained: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      drainWaiters.delete(onDrained)
      resolve(drained)
    }
    const onDrained = () => finish(true)
    const timeout = setTimeout(() => finish(false), Math.max(0, timeoutMs))
    drainWaiters.add(onDrained)
  })
}

export function clearGenerationLocksForTest(): void {
  if (process.env.NODE_ENV === 'test') {
    rejectQueuedAdmissions('not_accepting')
    activeLocks.clear()
    acceptingGenerations = true
    for (const resolve of drainWaiters) resolve()
    drainWaiters.clear()
  }
}

function promoteQueuedAdmissions(): void {
  if (!acceptingGenerations) {
    rejectQueuedAdmissions('not_accepting')
    return
  }
  const limits = resolveGenerationSchedulerLimits()
  while (activeLocks.size < limits.concurrency && queuedAdmissions.length > 0) {
    const eligibleIndex = queuedAdmissions.findIndex(item => hasResourceCapacity(item.resourceKey, limits))
    if (eligibleIndex < 0) break
    const [queued] = queuedAdmissions.splice(eligibleIndex, 1)
    if (queuedByKey.get(queued.key) !== queued) continue
    queuedByKey.delete(queued.key)
    cleanupQueuedAbortListener(queued)
    if (queued.signal?.aborted) {
      queued.resolve({ status: 'rejected', reason: 'client_aborted' })
      continue
    }
    queued.resolve({
      status: 'acquired',
      lock: createActiveGenerationLock(queued.key, queued),
      queued: true,
    })
  }
}

function removeQueuedAdmission(
  queued: QueuedGeneration,
  reason: 'client_aborted' | 'not_accepting' | 'queue_timeout',
): void {
  if (queuedByKey.get(queued.key) !== queued) return
  queuedByKey.delete(queued.key)
  const index = queuedAdmissions.indexOf(queued)
  if (index >= 0) queuedAdmissions.splice(index, 1)
  cleanupQueuedAbortListener(queued)
  queued.resolve({
    status: 'rejected',
    reason,
    ...(reason === 'queue_timeout' ? { retryAfterSeconds: 1 } : {}),
  })
  notifyDrainWaitersIfIdle()
}

function rejectQueuedAdmissions(reason: 'not_accepting'): void {
  const queued = queuedAdmissions.splice(0)
  queuedByKey.clear()
  for (const admission of queued) {
    cleanupQueuedAbortListener(admission)
    admission.resolve({ status: 'rejected', reason })
  }
}

function cleanupQueuedAbortListener(queued: QueuedGeneration): void {
  if (queued.timeout) clearTimeout(queued.timeout)
  if (queued.signal && queued.onAbort) {
    queued.signal.removeEventListener('abort', queued.onAbort)
  }
}

function notifyDrainWaitersIfIdle(): void {
  if (activeLocks.size !== 0 || queuedAdmissions.length !== 0) return
  for (const resolve of drainWaiters) resolve()
  drainWaiters.clear()
}

function generationInfo(generation: GenerationLockInfo): GenerationLockInfo {
  return {
    characterName: generation.characterName,
    chatId: generation.chatId,
    operation: generation.operation,
    startedAt: generation.startedAt,
  }
}

function schedulingInfo(input: {
  characterName: string
  chatId: string
  operation: GenerationOperation
  ownerId?: string
  providerKey?: string
}): SchedulingGenerationInfo {
  const ownerId = schedulingLabel(input.ownerId, 'local')
  const providerKey = schedulingLabel(input.providerKey, 'default')
  return {
    characterName: input.characterName,
    chatId: input.chatId,
    operation: input.operation,
    startedAt: Date.now(),
    ownerId,
    providerKey,
    resourceKey: JSON.stringify([ownerId, providerKey]),
  }
}

function hasResourceCapacity(resourceKey: string, limits: GenerationSchedulerLimits): boolean {
  let active = 0
  for (const generation of activeLocks.values()) {
    if (generation.resourceKey === resourceKey) active += 1
  }
  return active < limits.perOwnerProviderConcurrency
}

function schedulingLabel(value: string | undefined, fallback: string): string {
  const normalized = value?.trim()
  return normalized ? normalized.slice(0, 128) : fallback
}

function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw?.trim()) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}
