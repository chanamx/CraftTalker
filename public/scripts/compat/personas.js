export let user_avatar = 'user.png'
export const userAvatars = []

export function getUserAvatars() {
  return Promise.resolve(userAvatars)
}

export function setUserAvatar(value) {
  user_avatar = String(value ?? user_avatar)
}

export function getUserAvatar() {
  return user_avatar
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
