export interface JsonComplexityLimits {
  maxDepth: number
  maxNodes: number
  maxArrayLength: number
}

export type JsonComplexityResult = { ok: true } | { ok: false; reason: 'depth' | 'nodes' | 'array-length' }

export function inspectJsonComplexity(value: unknown, limits: JsonComplexityLimits): JsonComplexityResult {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  const seen = new WeakSet<object>()
  let nodes = 0
  while (stack.length > 0) {
    const current = stack.pop()!
    nodes += 1
    if (nodes > limits.maxNodes) return { ok: false, reason: 'nodes' }
    if (current.depth > limits.maxDepth) return { ok: false, reason: 'depth' }
    if (!current.value || typeof current.value !== 'object') continue
    if (seen.has(current.value)) continue
    seen.add(current.value)
    if (Array.isArray(current.value)) {
      if (current.value.length > limits.maxArrayLength) return { ok: false, reason: 'array-length' }
      for (const item of current.value) stack.push({ value: item, depth: current.depth + 1 })
    } else {
      for (const item of Object.values(current.value as Record<string, unknown>)) stack.push({ value: item, depth: current.depth + 1 })
    }
  }
  return { ok: true }
}
