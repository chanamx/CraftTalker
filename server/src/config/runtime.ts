import { createHash } from 'node:crypto'

export type RuntimeMode = 'local' | 'remote'

export interface RuntimeConfig {
  mode: RuntimeMode
  hostname: string
  requiresAuthentication: boolean
  remoteAccessToken?: string
}

const DEFAULT_HOSTNAME = '127.0.0.1'
const MIN_REMOTE_TOKEN_LENGTH = 32

export function isLoopbackHostname(value: string): boolean {
  const hostname = value.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  return hostname === 'localhost'
    || hostname === '::1'
    || hostname.startsWith('127.')
}

export function resolveRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const hostname = environment.HOST?.trim() || DEFAULT_HOSTNAME
  const requestedMode = environment.CRAFTTALKER_RUNTIME_MODE?.trim().toLowerCase()
  if (requestedMode && requestedMode !== 'local' && requestedMode !== 'remote') {
    throw new Error('CRAFTTALKER_RUNTIME_MODE must be either "local" or "remote".')
  }

  const loopback = isLoopbackHostname(hostname)
  const mode: RuntimeMode = requestedMode === 'remote' || !loopback ? 'remote' : 'local'
  if (requestedMode === 'local' && !loopback) {
    throw new Error('Local runtime mode may only listen on a loopback hostname.')
  }

  const remoteAccessToken = environment.CRAFTTALKER_REMOTE_ACCESS_TOKEN?.trim()
  if (mode === 'remote' && (!remoteAccessToken || remoteAccessToken.length < MIN_REMOTE_TOKEN_LENGTH)) {
    throw new Error(
      `Remote runtime mode requires a remote access token in CRAFTTALKER_REMOTE_ACCESS_TOKEN with at least ${MIN_REMOTE_TOKEN_LENGTH} characters.`,
    )
  }

  return {
    mode,
    hostname,
    requiresAuthentication: mode === 'remote',
    ...(remoteAccessToken ? { remoteAccessToken } : {}),
  }
}

export function resolveRuntimeOwnerId(environment: NodeJS.ProcessEnv = process.env): string {
  const config = resolveRuntimeConfig(environment)
  if (!config.remoteAccessToken) return 'local'
  return `remote:${createHash('sha256').update(config.remoteAccessToken).digest('hex').slice(0, 24)}`
}
