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
export function getGroupMembers() {
  return []
}
export function getGroupNames(groupId = selected_group) {
  const host = globalThis.CraftTalker?.stHost ?? globalThis.SillyTavern
  let context = {}
  try {
    context = typeof host?.getContext === 'function' ? host.getContext() : {}
  } catch {
    context = {}
  }

  const selectedGroup = groupId ?? context.selected_group ?? context.groupId
  if (!selectedGroup) return []

  const sourceGroups = groups.length
    ? groups
    : Array.isArray(host?.groups)
      ? host.groups
      : Array.isArray(context.groups)
        ? context.groups
        : []
  const sourceCharacters = Array.isArray(host?.characters)
    ? host.characters
    : Array.isArray(context.characters)
      ? context.characters
      : []
  const group = sourceGroups.find(item => item?.id == selectedGroup)
  const members = Array.isArray(group?.members) ? group.members : []

  return members
    .map(member => {
      if (member && typeof member === 'object') return member.name
      return sourceCharacters.find(character => character?.avatar === member)?.name ?? member
    })
    .filter(name => typeof name === 'string' && name.trim())
}

export default {
  groups,
  selected_group,
  getGroups,
  getGroupMembers,
  getGroupNames,
}
