import { parentPort, workerData } from 'node:worker_threads'
import { buildSTPrompt } from '../lib/prompt-builder.js'
import type { EngineRequest, EngineResponse } from './types.js'

const { stPath: _stPath } = workerData as { stPath: string | null }

interface WorkerMsg {
  id: string
  type: string
  payload: unknown
}

parentPort!.on('message', async (msg: WorkerMsg) => {
  const { id, type, payload } = msg

  try {
    switch (type) {
      case 'generate': {
        const req = payload as EngineRequest
        const { messages } = buildSTPrompt({
          character: req.character,
          messages: req.messages,
        })
        const response = await callLLM(req, messages)
        parentPort!.postMessage({ id, type: 'result', payload: response })
        break
      }

      case 'stream': {
        const req = payload as EngineRequest
        const { messages } = buildSTPrompt({
          character: req.character,
          messages: req.messages,
        })
        await streamLLM(req, messages, (chunk) => {
          parentPort!.postMessage({ id, type: 'stream-chunk', payload: chunk })
        })
        parentPort!.postMessage({ id, type: 'stream-end' })
        break
      }

      case 'test': {
        const req = payload as { apiUrl: string; apiKey: string; model: string; type: string }
        const ok = await testConnection(req)
        parentPort!.postMessage({ id, type: 'result', payload: ok })
        break
      }

      default:
        parentPort!.postMessage({ id, type: 'error', payload: `未知请求类型: ${type}` })
    }
  } catch (err) {
    parentPort!.postMessage({ id, type: 'error', payload: String(err) })
  }
})

async function callLLM(
  req: EngineRequest,
  messages: Array<{ role: string; content: string }>,
): Promise<EngineResponse> {
  const { config, preset } = req
  const baseUrl = config.apiUrl.replace(/\/v1\/?$/, '')
  const url = `${baseUrl}/v1/chat/completions`

  const body = {
    model: config.model,
    messages,
    temperature: preset.temperature,
    top_p: preset.top_p,
    max_tokens: preset.max_tokens,
    frequency_penalty: preset.frequency_penalty,
    presence_penalty: preset.presence_penalty,
    stream: false,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LLM API error ${res.status}: ${text}`)
  }

  const data = await res.json() as any
  const choice = data.choices?.[0]
  return {
    content: choice?.message?.content ?? '',
    finishReason: choice?.finish_reason ?? 'stop',
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    } : undefined,
  }
}

async function streamLLM(
  req: EngineRequest,
  messages: Array<{ role: string; content: string }>,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const { config, preset } = req
  const baseUrl = config.apiUrl.replace(/\/v1\/?$/, '')
  const url = `${baseUrl}/v1/chat/completions`

  const body = {
    model: config.model,
    messages,
    temperature: preset.temperature,
    top_p: preset.top_p,
    max_tokens: preset.max_tokens,
    frequency_penalty: preset.frequency_penalty,
    presence_penalty: preset.presence_penalty,
    stream: true,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LLM API error ${res.status}: ${text}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') return

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) onChunk(content)
      } catch { continue }
    }
  }
}

async function testConnection(config: { apiUrl: string; apiKey: string; model: string }): Promise<boolean> {
  try {
    const baseUrl = config.apiUrl.replace(/\/v1\/?$/, '')
    const res = await fetch(`${baseUrl}/v1/models`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
    })
    return res.ok
  } catch {
    return false
  }
}
