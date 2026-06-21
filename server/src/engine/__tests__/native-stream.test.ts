import { describe, expect, it } from 'vitest'
import { consumeNDJSON, consumeSSE } from '../native-stream.js'

async function collect(stream: AsyncGenerator<string, void, unknown>): Promise<string[]> {
  const chunks: string[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  }))
}

describe('native stream consumers', () => {
  it('consumes SSE chunks across reader boundaries and stops on DONE', async () => {
    const response = responseFromChunks([
      'data: {"delta":"Hel',
      'lo"}\n\n',
      'data: {"delta":" ignored after done"}\n\n',
      'data: [DONE]\n\n',
      'data: {"delta":"late"}\n\n',
    ])

    const chunks = await collect(consumeSSE(response, (data) => {
      if (!data || typeof data !== 'object') return undefined
      return (data as { delta?: string }).delta
    }))

    expect(chunks).toEqual(['Hello', ' ignored after done'])
  })

  it('ignores malformed SSE JSON without failing the stream', async () => {
    const response = responseFromChunks([
      'event: message\n',
      'data: {"delta":"A"}\n\n',
      'data: not-json\n\n',
      'data: {"delta":"B"}\n\n',
    ])

    const chunks = await collect(consumeSSE(response, (data) => {
      if (!data || typeof data !== 'object') return undefined
      return (data as { delta?: string }).delta
    }))

    expect(chunks).toEqual(['A', 'B'])
  })

  it('flushes the final NDJSON line even without a trailing newline', async () => {
    const response = responseFromChunks([
      '{"message":{"content":"Hel"}}\n{"message":{"content":"lo"}}',
    ])

    const chunks = await collect(consumeNDJSON(response, (data) => {
      if (!data || typeof data !== 'object') return undefined
      const message = (data as { message?: { content?: string } }).message
      return message?.content
    }))

    expect(chunks).toEqual(['Hel', 'lo'])
  })
})
