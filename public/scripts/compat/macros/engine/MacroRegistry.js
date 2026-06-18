import { getHost } from '../../host.js'

export class MacroRegistry {
  static registerMacro(name, handler) {
    getHost().registerMacro(name, handler)
  }

  static unregisterMacro(name) {
    getHost().unregisterMacro(name)
  }
}

export default MacroRegistry
