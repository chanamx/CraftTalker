import { encoding_for_model, get_encoding, type Tiktoken } from 'tiktoken'
import type { TokenCounter } from './world-info-compat.js'

const DEFAULT_ENCODING = 'cl100k_base'
const encoderCache = new Map<string, Tiktoken>()

export function createTokenCounter(model?: string): TokenCounter {
  const encoder = getEncoder(model)
  if (!encoder) return estimateTokenCount

  return (text: string) => encoder.encode(text).length
}

function getEncoder(model?: string): Tiktoken | null {
  const cacheKey = model?.trim() || DEFAULT_ENCODING
  const cached = encoderCache.get(cacheKey)
  if (cached) return cached

  try {
    const encoder = model?.trim()
      ? encoding_for_model(model.trim() as Parameters<typeof encoding_for_model>[0])
      : get_encoding(DEFAULT_ENCODING)
    encoderCache.set(cacheKey, encoder)
    return encoder
  } catch {
    try {
      const fallback = encoderCache.get(DEFAULT_ENCODING) ?? get_encoding(DEFAULT_ENCODING)
      encoderCache.set(DEFAULT_ENCODING, fallback)
      return fallback
    } catch {
      return null
    }
  }
}

function estimateTokenCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return Math.max(1, Math.ceil(trimmed.length / 4))
}
