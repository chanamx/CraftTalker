export function getEventSourceStream() {
  return new EventSourceStream()
}

export default class EventSourceStream extends TransformStream {
  constructor() {
    const decoder = new TextDecoder()
    let buffer = ''

    super({
      transform(chunk, controller) {
        buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop() ?? ''
        for (const event of events) {
          enqueueEvent(controller, event)
        }
      },
      flush(controller) {
        if (buffer.trim()) enqueueEvent(controller, buffer)
      },
    })
  }
}

function enqueueEvent(controller, rawEvent) {
  const data = rawEvent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')

  if (data) controller.enqueue({ data })
}
