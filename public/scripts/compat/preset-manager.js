const managers = new Map()

class PresetManager {
  constructor(type = 'generation') {
    this.type = type
    this.presets = []
  }

  getAllPresets() {
    return this.presets
  }

  getCompletionPresetByName(name) {
    return this.presets.find(preset => preset?.name === name) ?? null
  }
}

export function getPresetManager(type = 'generation') {
  if (!managers.has(type)) managers.set(type, new PresetManager(type))
  return managers.get(type)
}

export default {
  getPresetManager,
}
