export const favsToHotswap = []

export function isMobile() {
  return globalThis.matchMedia?.('(max-width: 768px)').matches ?? false
}

export function shouldSendOnEnter() {
  return true
}

export function getMessageTimeStamp() {
  return new Date().toISOString()
}

export function dragElement() {}
export function initRossMods() {}

export default {
  favsToHotswap,
  isMobile,
  shouldSendOnEnter,
  getMessageTimeStamp,
}
