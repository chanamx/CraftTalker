import { describe, expect, it } from 'vitest'
import { getStPresetApiIds, isStPresetRegexAllowed } from '../lib/st-preset-compat.js'

describe('ST preset API compatibility', () => {
  it('maps CraftTalker textgen to the ST textgenerationwebui API id', () => {
    expect(getStPresetApiIds('textgen')).toEqual(['textgenerationwebui', 'textgen'])
  })

  it('keeps known native ids stable and rejects unknown types', () => {
    expect(getStPresetApiIds('openai')).toEqual(['openai'])
    expect(getStPresetApiIds('unknown')).toEqual([])
  })

  it('accepts the ST API key while preserving an explicit native alias', () => {
    const settings = {
      preset_allowed_regex: {
        textgenerationwebui: ['Story Preset'],
      },
    }

    expect(isStPresetRegexAllowed(settings, 'textgen', 'Story Preset')).toBe(true)
    expect(isStPresetRegexAllowed({ preset_allowed_regex: { textgen: ['Story Preset'] } }, 'textgen', 'Story Preset')).toBe(true)
    expect(isStPresetRegexAllowed(settings, 'unknown', 'Story Preset')).toBe(false)
  })
})
