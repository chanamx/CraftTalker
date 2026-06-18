export const isAdmin = true
export const users = []

export function getCurrentUser() {
  return { name: 'local', admin: true }
}

export default {
  isAdmin,
  users,
  getCurrentUser,
}
