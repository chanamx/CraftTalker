import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { llmRoutes } from '../llm.routes.js'

function createTestApp() {
  const app = new Hono()
  app.route('/api/llm', llmRoutes)
  return app
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('/api/llm/models provider routing', () => {
  it('accepts LM Studio as a first-class source', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'local-model' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/llm/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'lmstudio',
        apiUrl: 'http://localhost:1234/v1',
        apiKey: '',
        model: 'local-model',
        type: 'openai',
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(['local-model'])
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:1234/v1/models', expect.objectContaining({
      method: 'GET',
    }))
  })

  it('fetches Azure OpenAI deployments with api-version and api-key auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      value: [
        { id: 'gpt-4o-mini-deploy' },
        { model: 'fallback-deploy' },
      ],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/llm/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'azure_openai',
        apiUrl: 'https://{resource}.openai.azure.com',
        apiKey: 'azure-key',
        model: 'gpt-4o-mini-deploy',
        type: 'openai',
        azureConfig: {
          resourceName: 'craft-resource',
          deploymentName: 'gpt-4o-mini-deploy',
          apiVersion: '2024-10-21',
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(['gpt-4o-mini-deploy', 'fallback-deploy'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://craft-resource.openai.azure.com/openai/deployments?api-version=2024-10-21',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'api-key': 'azure-key',
        }),
      }),
    )
  })

  it('fetches Anthropic models with version headers and cursor pagination', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'claude-sonnet-4-5' }],
        has_more: true,
        last_id: 'claude-sonnet-4-5',
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [
          { id: 'claude-haiku-4-5' },
          { id: 'claude-sonnet-4-5' },
        ],
        has_more: false,
      }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/llm/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'anthropic',
        apiUrl: 'https://api.anthropic.com/v1',
        apiKey: 'claude-key',
        model: 'claude-sonnet-4-5',
        type: 'openai',
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(['claude-sonnet-4-5', 'claude-haiku-4-5'])
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.anthropic.com/v1/models?limit=1000',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-api-key': 'claude-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.anthropic.com/v1/models?limit=1000&after_id=claude-sonnet-4-5',
      expect.objectContaining({
        method: 'GET',
      }),
    )
  })

  it('fetches Gemini models, filters generation-capable entries, and normalizes model ids', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        models: [
          {
            name: 'models/gemini-2.0-flash',
            baseModelId: 'gemini-2.0-flash',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/embedding-001',
            supportedGenerationMethods: ['embedContent'],
          },
        ],
        nextPageToken: 'page-2',
      }))
      .mockResolvedValueOnce(jsonResponse({
        models: [
          {
            name: 'models/gemini-1.5-pro',
            supportedActions: ['generateContent'],
          },
        ],
      }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/llm/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'google',
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'gemini-key',
        model: 'gemini-2.0-flash',
        type: 'openai',
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(['gemini-2.0-flash', 'gemini-1.5-pro'])
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-goog-api-key': 'gemini-key',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=page-2',
      expect.objectContaining({
        method: 'GET',
      }),
    )
  })

  it('fetches Ollama native tags from /api/tags', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      models: [
        { name: 'llama3.1:latest' },
        { name: 'qwen2.5:7b' },
      ],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/llm/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'ollama_native',
        apiUrl: 'http://localhost:11434',
        apiKey: '',
        model: 'llama3.1',
        type: 'openai',
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(['llama3.1:latest', 'qwen2.5:7b'])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.objectContaining({
        method: 'GET',
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    )
  })

  it('fetches NanoGPT detailed models from its provider-specific endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'gpt-4o-mini' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/llm/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'nanogpt',
        apiUrl: 'https://nano-gpt.com/api/v1',
        apiKey: 'nano-key',
        model: 'gpt-4o-mini',
        type: 'openai',
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(['gpt-4o-mini'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://nano-gpt.com/api/v1/models?detailed=true',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer nano-key',
        }),
      }),
    )
  })

  it('fetches Pollinations models from its public models endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(['openai', 'mistral']))
    vi.stubGlobal('fetch', fetchMock)

    const res = await createTestApp().request('/api/llm/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'pollinations',
        apiUrl: 'https://gen.pollinations.ai/v1',
        apiKey: '',
        model: 'openai',
        type: 'openai',
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(['openai', 'mistral'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gen.pollinations.ai/models',
      expect.objectContaining({
        method: 'GET',
      }),
    )
  })
})
