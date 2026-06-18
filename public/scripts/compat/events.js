import { getHost } from './host.js'

const host = getHost()

export const event_types = host.event_types
export const eventSource = host.eventSource

export default {
  event_types,
  eventSource,
}
