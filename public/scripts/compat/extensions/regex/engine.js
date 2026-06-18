export const regex_placement = {
  USER_INPUT: 1,
  AI_OUTPUT: 2,
  SLASH_COMMAND: 3,
  WORLD_INFO: 4,
}

export function getRegexedString(value) {
  return String(value ?? '')
}

export default {
  regex_placement,
  getRegexedString,
}
