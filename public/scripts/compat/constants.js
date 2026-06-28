export const debounce_timeout = {
  quick: 100,
  short: 200,
  standard: 300,
  relaxed: 1000,
  extended: 5000,
}

export const DEFAULT_SAVE_EDIT_TIMEOUT = 1000
export const GENERATION_TYPE_TRIGGERS = [
  'normal',
  'continue',
  'impersonate',
  'swipe',
  'regenerate',
  'quiet',
]

export const inject_ids = {
  STORY_STRING: '__STORY_STRING__',
  QUIET_PROMPT: 'QUIET_PROMPT',
  DEPTH_PROMPT: 'DEPTH_PROMPT',
  DEPTH_PROMPT_INDEX: index => `DEPTH_PROMPT_${index}`,
  CUSTOM_WI_DEPTH: 'customDepthWI',
  CUSTOM_WI_DEPTH_ROLE: (depth, role) => `customDepthWI_${depth}_${role}`,
  CUSTOM_WI_OUTLET: key => `customWIOutlet_${key}`,
}

export const legacy_debounce_timeout = {
  quick: 250,
  relaxed: 1000,
}

export const extension_prompt_types = {
  IN_PROMPT: 0,
  IN_CHAT: 1,
  BEFORE_PROMPT: 2,
  AFTER_PROMPT: 3,
}
export const extension_prompt_roles = {
  SYSTEM: 0,
  USER: 1,
  ASSISTANT: 2,
}
export const IGNORE_SYMBOL = Symbol.for('crafttalker.st_compat.ignore')

export default {
  debounce_timeout,
  DEFAULT_SAVE_EDIT_TIMEOUT,
  GENERATION_TYPE_TRIGGERS,
  inject_ids,
  extension_prompt_types,
  extension_prompt_roles,
  IGNORE_SYMBOL,
}
