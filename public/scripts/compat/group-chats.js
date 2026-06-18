export const groups = []
export let selected_group = null
export let is_group_generating = false
export let group_generation_id = null

export function getGroups() {
  return Promise.resolve(groups)
}
export function saveGroupChat() {
  return Promise.resolve()
}
export function generateGroupWrapper() {
  return Promise.resolve()
}
export function resetSelectedGroup() {
  selected_group = null
}
export function select_group_chats() {}
export function regenerateGroup() {
  return Promise.resolve()
}
export function getGroupChat() {
  return Promise.resolve([])
}
export function renameGroupMember() {
  return Promise.resolve()
}
export function createNewGroupChat() {
  return Promise.resolve(null)
}
export function getGroupAvatar() {
  return ''
}
export function deleteGroupChat() {
  return Promise.resolve(false)
}
export function renameGroupChat() {
  return Promise.resolve(false)
}
export function importGroupChat() {
  return Promise.resolve(false)
}
export function getGroupBlock() {
  return ''
}
export function getGroupCharacterCardsLazy() {
  return Promise.resolve([])
}
export function getGroupDepthPrompts() {
  return []
}

export default {
  groups,
  selected_group,
  getGroups,
}
