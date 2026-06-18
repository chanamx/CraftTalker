export function getEventSourceStream() {
  return new TransformStream()
}

export default class EventSourceStream extends TransformStream {
  constructor() {
    super()
  }
}
