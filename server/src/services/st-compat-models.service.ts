const FALLBACK_ST_COMPAT_MODEL_IDS = [
  'gpt-4o-mini',
  'gpt-4o',
  'claude-3-5-sonnet-latest',
  'gemini-2.0-flash',
  'openai/gpt-4o-mini',
]

export function getStCompatModelListResponse() {
  return {
    data: FALLBACK_ST_COMPAT_MODEL_IDS.map(id => ({ id, name: id })),
  }
}
