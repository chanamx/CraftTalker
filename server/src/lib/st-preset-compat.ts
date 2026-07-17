const ST_PRESET_API_IDS: Record<string, readonly string[]> = {
  kobold: ['kobold'],
  openai: ['openai'],
  textgen: ['textgenerationwebui', 'textgen'],
  novel: ['novel'],
}

export function getStPresetApiIds(presetType: string | undefined): string[] {
  if (!presetType) return []
  return [...(ST_PRESET_API_IDS[presetType] ?? [])]
}

export function isStPresetRegexAllowed(settings: unknown, presetType: string | undefined, presetName: string | undefined): boolean {
  if (!presetName || !settings || typeof settings !== 'object' || Array.isArray(settings)) return false
  const allowedByApi = (settings as { preset_allowed_regex?: unknown }).preset_allowed_regex
  if (!allowedByApi || typeof allowedByApi !== 'object' || Array.isArray(allowedByApi)) return false
  return getStPresetApiIds(presetType).some(apiId => {
    const allowedNames = (allowedByApi as Record<string, unknown>)[apiId]
    return Array.isArray(allowedNames) && allowedNames.includes(presetName)
  })
}
