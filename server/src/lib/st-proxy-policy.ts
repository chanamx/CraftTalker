export const ST_CORS_PROXY_ENABLED_ENV = 'CRAFTTALKER_ST_CORS_PROXY_ENABLED'
export const ST_CORS_PROXY_ALLOWLIST_ENV = 'CRAFTTALKER_ST_CORS_PROXY_ALLOWLIST'
export const ST_CORS_PROXY_MAX_BYTES = 2 * 1024 * 1024
export const ST_IMAGE_BACKEND_PING_ENABLED_ENV = 'CRAFTTALKER_ST_IMAGE_BACKEND_PING_ENABLED'
export const ST_IMAGE_BACKEND_ALLOWLIST_ENV = 'CRAFTTALKER_ST_IMAGE_BACKEND_ALLOWLIST'

export interface StCorsProxyPolicy {
  enabled: boolean
  allowedHosts: string[]
  maxBytes: number
}

export interface StImageBackendPolicy {
  pingEnabled: boolean
  allowedOrigins: string[]
}

function getEnvFlag(name: string): boolean {
  return process.env[name]?.toLowerCase() === 'true'
}

export function normalizeCorsProxyHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

function getAllowedHosts(): string[] {
  return [...new Set((process.env[ST_CORS_PROXY_ALLOWLIST_ENV] ?? '')
    .split(/[,\s]+/)
    .map(normalizeCorsProxyHost)
    .filter(Boolean))]
}

function getAllowedOrigins(): string[] {
  return [...new Set((process.env[ST_IMAGE_BACKEND_ALLOWLIST_ENV] ?? '')
    .split(/[,\s]+/)
    .map((entry) => {
      try {
        const url = new URL(entry)
        return url.origin
      } catch {
        return ''
      }
    })
    .filter(Boolean))]
}

export function getStCorsProxyPolicy(): StCorsProxyPolicy {
  return {
    enabled: getEnvFlag(ST_CORS_PROXY_ENABLED_ENV),
    allowedHosts: getAllowedHosts(),
    maxBytes: ST_CORS_PROXY_MAX_BYTES,
  }
}

export function getStImageBackendPolicy(): StImageBackendPolicy {
  return {
    pingEnabled: getEnvFlag(ST_IMAGE_BACKEND_PING_ENABLED_ENV),
    allowedOrigins: getAllowedOrigins(),
  }
}
