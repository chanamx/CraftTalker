export const debounce_timeout = {
  quick: 250,
  relaxed: 1000,
}

export const DEFAULT_SAVE_EDIT_TIMEOUT = 1000
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
  extension_prompt_types,
  extension_prompt_roles,
  IGNORE_SYMBOL,
}
