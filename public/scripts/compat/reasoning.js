export const ReasoningType = {
  NONE: 'none',
  HIDDEN: 'hidden',
  VISIBLE: 'visible',
  SEPARATED: 'separated',
}

export function updateReasoningUI() {}
export function parseReasoningFromString(value) {
  return {
    content: String(value ?? ''),
    reasoning: '',
    type: ReasoningType.NONE,
  }
}
export function getReasoningString(value) {
  return String(value?.reasoning ?? '')
}

export default {
  ReasoningType,
  updateReasoningUI,
  parseReasoningFromString,
  getReasoningString,
}
