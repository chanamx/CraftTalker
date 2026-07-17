import { optionalHost } from './host.js'
import { persona_description_positions, power_user } from './power-user.js'

export let user_avatar = 'user.png'
export const userAvatars = []

function userAvatarUrl(file = user_avatar) {
  const value = String(file ?? '').trim()
  return value ? `/User%20Avatars/${encodeURIComponent(value)}` : ''
}

export async function getUserAvatars() {
  const host = optionalHost()
  try {
    const response = await fetch('/api/avatars/get', {
      method: 'POST',
      headers: host?.getRequestHeaders?.({ omitContentType: true }) ?? {},
    })
    if (!response.ok) {
      return userAvatars
    }

    const avatars = await response.json()
    if (Array.isArray(avatars)) {
      userAvatars.splice(0, userAvatars.length, ...avatars.filter(avatar => typeof avatar === 'string'))
    }
  } catch {
    return userAvatars
  }
  return userAvatars
}

export async function setUserAvatar(value) {
  const nextAvatar = String(value ?? user_avatar).trim() || user_avatar
  if (nextAvatar === user_avatar) {
    return
  }

  user_avatar = nextAvatar
  const host = optionalHost()
  const personaName = power_user.personas[user_avatar]
  let descriptor = power_user.persona_descriptions[user_avatar]
  if (personaName && (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor))) {
    descriptor = {
      description: '',
      position: persona_description_positions.IN_PROMPT,
      depth: 2,
      role: 0,
      lorebook: '',
      connections: [],
      title: '',
    }
    power_user.persona_descriptions[user_avatar] = descriptor
  }

  if (personaName) {
    setPersonaDescription()
    host?.setUserName?.(personaName)
  }
  host?.saveSettingsDebounced?.()
  const eventName = host?.event_types?.PERSONA_CHANGED
  if (eventName && typeof host.eventSource?.emit === 'function') {
    await host.eventSource.emit(eventName, user_avatar)
  }
}

export function getUserAvatar(file = user_avatar) {
  return userAvatarUrl(file)
}

export async function initPersona(
  avatarId,
  personaName,
  personaDescription,
  personaTitle,
  {
    silent = false,
    position = persona_description_positions.IN_PROMPT,
    depth = 2,
    role = 0,
    lorebook = '',
  } = {},
) {
  const description = personaDescription || ''
  const title = personaTitle || ''
  power_user.personas[avatarId] = personaName
  power_user.persona_descriptions[avatarId] = {
    description,
    position,
    depth,
    role,
    lorebook,
    title,
  }

  const host = optionalHost()
  host?.saveSettingsDebounced?.()
  const eventName = host?.event_types?.PERSONA_CREATED
  if (!silent && eventName && typeof host.eventSource?.emit === 'function') {
    await host.eventSource.emit(eventName, {
      avatarId,
      name: personaName,
      description,
      title,
    })
  }
}

export function getOrCreatePersonaDescriptor() {
  let descriptor = power_user.persona_descriptions[user_avatar]
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    descriptor = {
      description: power_user.persona_description,
      position: power_user.persona_description_position,
      depth: power_user.persona_description_depth,
      role: power_user.persona_description_role,
      lorebook: power_user.persona_description_lorebook,
      connections: [],
      title: '',
    }
    power_user.persona_descriptions[user_avatar] = descriptor
  }
  return descriptor
}

export function setPersonaDescription() {
  const descriptor = power_user.persona_descriptions[user_avatar]
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    return
  }

  power_user.persona_description = descriptor.description ?? ''
  power_user.persona_description_position = descriptor.position ?? persona_description_positions.IN_PROMPT
  power_user.persona_description_depth = descriptor.depth ?? 2
  power_user.persona_description_role = descriptor.role ?? 0
  power_user.persona_description_lorebook = descriptor.lorebook ?? ''
}

export default {
  user_avatar,
  getUserAvatars,
  setUserAvatar,
  getUserAvatar,
  initPersona,
  getOrCreatePersonaDescriptor,
  setPersonaDescription,
}
