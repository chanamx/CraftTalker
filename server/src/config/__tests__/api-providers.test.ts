/**
 * API 提供商配置测试
 */

import { describe, it, expect } from 'vitest'
import {
  API_PROVIDERS,
  getProviderConfig,
  buildEndpointUrl,
  buildHeaders,
} from '../api-providers.js'

describe('API Provider Configuration', () => {
  describe('Provider Registry', () => {
    it('should have all required providers', () => {
      const requiredProviders = [
        'openai',
        'azure_openai',
        'anthropic',
        'google',
        'gemini',
        'openrouter',
        'groq',
        'deepseek',
        'moonshot',
        'siliconflow',
        'ollama',
        'ollama_native',
        'lmstudio',
        'vllm',
        'llamacpp',
        'cohere',
        'mistral',
      ]

      for (const provider of requiredProviders) {
        expect(API_PROVIDERS[provider]).toBeDefined()
      }
    })

    it('should have valid provider configurations', () => {
      Object.values(API_PROVIDERS).forEach(config => {
        expect(config.id).toBeTruthy()
        expect(config.name).toBeTruthy()
        expect(config.defaultEndpoint).toMatch(/^https?:\/\//)
        expect(config.apiFormat).toBeTruthy()
        expect(typeof config.supportsStreaming).toBe('boolean')
        expect(['bearer', 'api-key', 'custom']).toContain(config.authType)
      })
    })
  })

  describe('getProviderConfig', () => {
    it('should return config for valid provider', () => {
      const config = getProviderConfig('openai')
      expect(config).toBeDefined()
      expect(config?.id).toBe('openai')
    })

    it('should return undefined for invalid provider', () => {
      const config = getProviderConfig('invalid-provider')
      expect(config).toBeUndefined()
    })
  })

  describe('buildEndpointUrl', () => {
    it('should return default endpoint when no overrides', () => {
      const url = buildEndpointUrl('openai')
      expect(url).toBe('https://api.openai.com/v1')
    })

    it('should use custom endpoint when provided', () => {
      const customUrl = 'https://custom.api.com/v1'
      const url = buildEndpointUrl('openai', customUrl)
      expect(url).toBe(customUrl)
    })

    it('should use reverse proxy endpoint when specified', () => {
      const url = buildEndpointUrl('openai', undefined, 'OpenRouter')
      expect(url).toBe('https://openrouter.ai/api/v1')
    })

    it('should throw error for unknown provider', () => {
      expect(() => buildEndpointUrl('invalid-provider')).toThrow('Unknown provider')
    })
  })

  describe('buildHeaders', () => {
    it('should build OpenAI headers with bearer auth', () => {
      const headers = buildHeaders('openai', 'test-key')

      expect(headers['Authorization']).toBe('Bearer test-key')
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('should build Anthropic headers with x-api-key', () => {
      const headers = buildHeaders('anthropic', 'test-key')

      expect(headers['x-api-key']).toBe('test-key')
      expect(headers['anthropic-version']).toBe('2023-06-01')
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('should build Gemini headers with x-goog-api-key', () => {
      const headers = buildHeaders('gemini', 'test-key')

      expect(headers['x-goog-api-key']).toBe('test-key')
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('should build Azure OpenAI headers with api-key auth', () => {
      const headers = buildHeaders('azure_openai', 'test-key')

      expect(headers['api-key']).toBe('test-key')
      expect(headers['Authorization']).toBeUndefined()
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('should build OpenRouter attribution headers by default', () => {
      const headers = buildHeaders('openrouter', 'test-key')

      expect(headers['Authorization']).toBe('Bearer test-key')
      expect(headers['HTTP-Referer']).toBe('https://crafttalker.app')
      expect(headers['X-OpenRouter-Title']).toBe('CraftTalker')
    })

    it('should omit authorization for local providers without an API key', () => {
      const headers = buildHeaders('lmstudio', '')

      expect(headers['Authorization']).toBeUndefined()
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('should include reverse proxy custom headers', () => {
      const headers = buildHeaders('openai', 'test-key', undefined, 'OpenRouter')

      expect(headers['HTTP-Referer']).toBe('https://crafttalker.app')
    })

    it('should allow user custom headers to override', () => {
      const customHeaders = {
        'User-Agent': 'CustomAgent/1.0',
        'X-Custom': 'value',
      }

      const headers = buildHeaders('openai', 'test-key', customHeaders)

      expect(headers['User-Agent']).toBe('CustomAgent/1.0')
      expect(headers['X-Custom']).toBe('value')
    })

    it('should throw error for unknown provider', () => {
      expect(() => buildHeaders('invalid-provider', 'test-key')).toThrow('Unknown provider')
    })
  })

  describe('Rate Limits', () => {
    it('should have rate limit configurations', () => {
      const openai = getProviderConfig('openai')

      expect(openai?.rateLimit).toBeDefined()
      expect(openai?.rateLimit?.requestsPerMinute).toBeGreaterThan(0)
    })
  })

  describe('Model Defaults', () => {
    it('should have reasonable default parameters', () => {
      Object.values(API_PROVIDERS).forEach(config => {
        if (config.modelDefaults) {
          const { temperature, maxTokens, topP } = config.modelDefaults

          if (temperature !== undefined) {
            expect(temperature).toBeGreaterThanOrEqual(0)
            expect(temperature).toBeLessThanOrEqual(2)
          }

          if (maxTokens !== undefined) {
            expect(maxTokens).toBeGreaterThan(0)
          }

          if (topP !== undefined) {
            expect(topP).toBeGreaterThanOrEqual(0)
            expect(topP).toBeLessThanOrEqual(1)
          }
        }
      })
    })
  })
})
