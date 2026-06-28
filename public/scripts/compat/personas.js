import { optionalHost } from './host.js'

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

export function setUserAvatar(value) {
  user_avatar = String(value ?? user_avatar)
  return Promise.resolve(user_avatar)
}

export function getUserAvatar(file = user_avatar) {
  return userAvatarUrl(file)
}

export function getOrCreatePersonaDescriptor() {
  return { avatar: user_avatar, description: '' }
}

export function setPersonaDescription() {}

export default {
  user_avatar,
  getUserAvatars,
  setUserAvatar,
  getUserAvatar,
}
