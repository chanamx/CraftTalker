import { getHost } from './host.js'

export function getContext() {
  return getHost().getContext()
}

export default getContext
