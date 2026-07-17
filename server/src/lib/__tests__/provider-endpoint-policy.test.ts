import { describe, expect, it } from 'vitest'
import { validateProviderEndpoint } from '../provider-endpoint-policy.js'

describe('provider endpoint policy', () => {
  it('requires an HTTP(S) URL without embedded credentials', async () => {
    await expect(validateProviderEndpoint('ftp://provider.example', {
      mode: 'local',
      source: 'custom_openai_chat',
    })).rejects.toThrow(/http/i)

    await expect(validateProviderEndpoint('https://user:pass@provider.example', {
      mode: 'local',
      source: 'custom_openai_chat',
    })).rejects.toThrow(/credentials/i)
  })

  it('requires HTTPS for public providers even in local mode', async () => {
    await expect(validateProviderEndpoint('http://provider.example', { mode: 'local', source: 'custom_openai_chat' })).rejects.toThrow(/https/i)
    await expect(validateProviderEndpoint('http://127.0.0.1:11434', { mode: 'local', source: 'ollama_native' })).resolves.toBeUndefined()
  })

  it.each([
    'fe80::1',
    '::ffff:169.254.169.254',
    '::',
    'ff02::1',
  ])('rejects reserved IPv6 provider address %s for local sources', async (address) => {
    await expect(validateProviderEndpoint(`http://[${address}]:8080`, { mode: 'remote', source: 'ollama_native' })).rejects.toThrow(/reserved|link-local|metadata|loopback/i)
  })

  it('rejects mixed DNS results when any address is reserved', async () => {
    await expect(validateProviderEndpoint('https://provider.example', {
      mode: 'remote',
      source: 'ollama_native',
      lookup: async () => [{ address: '192.168.1.2', family: 4 }, { address: 'fe80::1', family: 6 }],
    })).rejects.toThrow(/reserved|link-local|metadata/i)
  })

  it('blocks private custom endpoints in remote mode', async () => {
    await expect(validateProviderEndpoint('http://127.0.0.1:11434', {
      mode: 'remote',
      source: 'custom_openai_chat',
    })).rejects.toThrow(/private|loopback/i)
  })

  it('allows explicitly local providers to reach local services', async () => {
    await expect(validateProviderEndpoint('http://127.0.0.1:11434', {
      mode: 'remote',
      source: 'ollama_native',
    })).resolves.toBeUndefined()
  })

  it('rejects DNS names that resolve into private networks', async () => {
    await expect(validateProviderEndpoint('https://provider.example', {
      mode: 'remote',
      source: 'custom_openai_chat',
      lookup: async () => [{ address: '10.0.0.5', family: 4 }],
    })).rejects.toThrow(/private|reserved/i)
  })
})
