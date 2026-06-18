export const NOTE_MODULE_NAME = '2_floating_prompt'
export const metadata_keys = {
  prompt: 'note_prompt',
  interval: 'note_interval',
  position: 'note_position',
  depth: 'note_depth',
  role: 'note_role',
}

export function shouldWIAddPrompt() {
  return false
}

export default {
  NOTE_MODULE_NAME,
  metadata_keys,
  shouldWIAddPrompt,
}
