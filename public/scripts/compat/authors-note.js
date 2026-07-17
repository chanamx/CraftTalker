import { getHost } from './host.js'

const host = getHost()

export const NOTE_MODULE_NAME = '2_floating_prompt'
export const metadata_keys = {
  prompt: 'note_prompt',
  interval: 'note_interval',
  position: 'note_position',
  depth: 'note_depth',
  role: 'note_role',
}

export let shouldWIAddPrompt = false

export function refreshShouldWIAddPrompt() {
  let context = null
  try {
    context = typeof host.getContext === 'function' ? host.getContext() : null
  } catch {
    shouldWIAddPrompt = false
    return shouldWIAddPrompt
  }
  const hasActiveChat = Boolean(context?.groupId)
    || context?.characterId !== undefined
    || context?.this_chid !== undefined
  if (!hasActiveChat) {
    shouldWIAddPrompt = false
    return shouldWIAddPrompt
  }
  const metadata = context?.chat_metadata ?? context?.chatMetadata ?? host.chat_metadata ?? {}
  const interval = Math.floor(Number(metadata?.[metadata_keys.interval]))
  const chat = Array.isArray(context?.chat) ? context.chat : []
  const userMessageCount = chat.filter(message => message?.is_user === true).length

  shouldWIAddPrompt = Number.isFinite(interval)
    && interval > 0
    && (interval === 1 || (userMessageCount > 0 && userMessageCount % interval === 0))
  return shouldWIAddPrompt
}

export function setFloatingPrompt() {
  return refreshShouldWIAddPrompt()
}

refreshShouldWIAddPrompt()

export default {
  NOTE_MODULE_NAME,
  metadata_keys,
  get shouldWIAddPrompt() { return shouldWIAddPrompt },
  refreshShouldWIAddPrompt,
  setFloatingPrompt,
}
