import dns from 'node:dns/promises'
import net from 'node:net'
import type { RuntimeMode } from '../config/runtime.js'

const LOCAL_PROVIDER_SOURCES = new Set([
  'ollama',
  'ollama_native',
  'lmstudio',
  'vllm',
  'llamacpp',
])

interface LookupAddress {
  address: string
  family: number
}

export interface ProviderEndpointPolicyOptions {
  mode: RuntimeMode
  source?: string
  lookup?: (hostname: string) => Promise<LookupAddress[]>
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19))
}

function isAlwaysForbiddenIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0 || (a === 169 && b === 254) || a >= 224
}

function embeddedIpv4FromMappedIpv6(address: string): string | null {
  const normalized = address.toLowerCase()
  if (!normalized.startsWith('::ffff:')) return null
  const embedded = normalized.slice('::ffff:'.length)
  if (net.isIP(embedded) === 4) return embedded
  const groups = embedded.split(':')
  if (groups.length !== 2 && groups.length !== 1) return null
  const values = groups.join('').match(/^[0-9a-f]{8}$/i)
  if (!values) return null
  const numeric = Number.parseInt(values[0], 16)
  return [numeric >>> 24, (numeric >>> 16) & 255, (numeric >>> 8) & 255, numeric & 255].join('.')
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  const mapped = embeddedIpv4FromMappedIpv6(normalized)
  if (mapped) return isPrivateIpv4(mapped)
  if (normalized === '::' || normalized === '::1') return true
  const first = Number.parseInt(normalized.split(':')[0] || '0', 16)
  return !Number.isFinite(first) || (first & 0xfe00) === 0xfc00
}

function isAlwaysForbiddenIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  const mapped = embeddedIpv4FromMappedIpv6(normalized)
  if (mapped) return isAlwaysForbiddenIpv4(mapped)
  if (normalized === '::' || normalized === '::1') return true
  const first = Number.parseInt(normalized.split(':')[0] || '0', 16)
  return !Number.isFinite(first) || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00
}

function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) return isPrivateIpv4(address)
  if (family === 6) return isPrivateIpv6(address)
  return true
}

function isAlwaysForbiddenAddress(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) return isAlwaysForbiddenIpv4(address)
  if (family === 6) return isAlwaysForbiddenIpv6(address)
  return true
}

function isExplicitLocalProvider(source: string | undefined): boolean {
  return source !== undefined && LOCAL_PROVIDER_SOURCES.has(source)
}

function assertPublicProtocol(url: URL, localProvider: boolean): void {
  if (url.protocol === 'http:' && !localProvider) throw new Error('Public provider endpoints must use HTTPS.')
}

export async function validateProviderEndpoint(rawUrl: string, options: ProviderEndpointPolicyOptions): Promise<void> {
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new Error('Provider endpoint must be a valid URL.') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Provider endpoint must use HTTP or HTTPS.')
  if (url.username || url.password) throw new Error('Provider endpoint credentials are not allowed.')
  const localProvider = isExplicitLocalProvider(options.source)
  const hostname = normalizeHostname(url.hostname)
  if (options.mode === 'local') {
    if (net.isIP(hostname) > 0 && isAlwaysForbiddenAddress(hostname)) throw new Error('Link-local, metadata, loopback, or multicast provider endpoints are not allowed.')
    const literalLocal = net.isIP(hostname) > 0 && isPrivateAddress(hostname) && !isAlwaysForbiddenAddress(hostname)
    const namedLocal = hostname === 'localhost' || hostname.endsWith('.localhost')
    if (!localProvider && !literalLocal && !namedLocal) assertPublicProtocol(url, false)
    return
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    if (!localProvider) throw new Error('Loopback provider endpoints are not allowed for this provider.')
    return
  }

  if (net.isIP(hostname)) {
    if (isAlwaysForbiddenAddress(hostname)) throw new Error('Link-local, metadata, loopback, or multicast provider endpoints are not allowed.')
    if (isPrivateAddress(hostname) && !localProvider) throw new Error('Private or reserved provider endpoints are not allowed.')
    assertPublicProtocol(url, localProvider)
    return
  }

  if (!localProvider && url.protocol === 'http:') throw new Error('Public provider endpoints must use HTTPS.')
  if (process.env.NODE_ENV === 'test' && hostname.endsWith('.test')) return
  const lookup = options.lookup ?? (async (name) => dns.lookup(name, { all: true, verbatim: true }))
  const addresses = await lookup(hostname)
  if (addresses.length === 0) throw new Error('Provider endpoint hostname did not resolve.')
  for (const { address } of addresses) {
    if (isAlwaysForbiddenAddress(address)) throw new Error('Link-local, metadata, loopback, or multicast provider endpoints are not allowed.')
    if (isPrivateAddress(address) && !localProvider) throw new Error('Private or reserved provider endpoints are not allowed.')
  }
}
