import { getHost } from '../host.js'

class AccountStorage {
  constructor() {
    this.storage = getHost().getContext().accountStorage
  }

  init() {}

  getItem(key) {
    return this.storage.getItem(String(key))
  }

  setItem(key, value) {
    this.storage.setItem(String(key), String(value))
  }

  removeItem(key) {
    this.storage.removeItem(String(key))
  }

  getState() {
    const state = {}
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index)
      if (key) state[key] = this.storage.getItem(key)
    }
    return state
  }
}

export const accountStorage = new AccountStorage()
export { AccountStorage }
export default accountStorage
