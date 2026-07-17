import fs from 'node:fs'
import path from 'node:path'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const VAULT_FILE_NAME = 'llm-key-vault.json'
const KEY_FILE_NAME = 'llm-vault.key'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const SALT_BYTES = 16

export interface VaultSessionRecord {
  sessionId: string
  label?: string
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  expiresAt: string
  usageCount: number
  hasApiKey: boolean
  apiKey: string
  ownerId: string
}

interface VaultEnvelope {
  version: 1
  kdf: 'file-key' | 'scrypt'
  salt?: string
  iv: string
  tag: string
  ciphertext: string
}

let loadedPath: string | null = null
let records = new Map<string, VaultSessionRecord>()

function dataDir(): string {
  return process.env.LUKER_DATA_DIR ?? path.resolve(process.cwd(), 'data')
}

function vaultDir(): string { return path.join(dataDir(), 'secrets') }
function vaultPath(): string { return path.join(vaultDir(), VAULT_FILE_NAME) }
function keyPath(): string { return path.join(vaultDir(), KEY_FILE_NAME) }

function loadIfNeeded(): Map<string, VaultSessionRecord> {
  const currentPath = vaultPath()
  if (loadedPath === currentPath) return records

  if (!fs.existsSync(currentPath)) {
    loadedPath = currentPath
    records = new Map()
    return records
  }

  const envelope = parseEnvelope(fs.readFileSync(currentPath, 'utf8'))
  const parsed: unknown = JSON.parse(decryptEnvelope(envelope))
  if (!Array.isArray(parsed)) throw new Error('LLM key vault payload is invalid.')
  const loadedRecords = new Map<string, VaultSessionRecord>()
  for (const item of parsed) {
    if (!isVaultSessionRecord(item)) throw new Error('LLM key vault session record is invalid.')
    loadedRecords.set(item.sessionId, item)
  }

  loadedPath = currentPath
  records = loadedRecords
  return records
}

function parseEnvelope(value: string): VaultEnvelope {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object') throw new Error('LLM key vault envelope is invalid.')
  const envelope = parsed as Partial<VaultEnvelope>
  if (envelope.version !== 1 || (envelope.kdf !== 'file-key' && envelope.kdf !== 'scrypt')) {
    throw new Error('LLM key vault version is unsupported.')
  }
  if (typeof envelope.iv !== 'string' || typeof envelope.tag !== 'string' || typeof envelope.ciphertext !== 'string') {
    throw new Error('LLM key vault envelope is incomplete.')
  }
  if (envelope.kdf === 'scrypt' && typeof envelope.salt !== 'string') throw new Error('LLM key vault salt is missing.')
  return envelope as VaultEnvelope
}

function vaultKey(envelope: VaultEnvelope): Buffer {
  if (envelope.kdf === 'scrypt') {
    const secret = process.env.CRAFTTALKER_VAULT_SECRET
    if (!secret) throw new Error('CRAFTTALKER_VAULT_SECRET is required to unlock the LLM key vault.')
    return scryptSync(secret, Buffer.from(envelope.salt!, 'base64'), KEY_BYTES, { N: 16_384, r: 8, p: 1 })
  }
  const file = keyPath()
  if (!fs.existsSync(file)) throw new Error('LLM key vault key file is missing.')
  const key = fs.readFileSync(file)
  if (key.byteLength !== KEY_BYTES) throw new Error('LLM key vault key file is invalid.')
  return key
}

function decryptEnvelope(envelope: VaultEnvelope): string {
  const decipher = createDecipheriv(ALGORITHM, vaultKey(envelope), Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8')
}

function encryptPayload(payload: string): VaultEnvelope {
  const useSecret = typeof process.env.CRAFTTALKER_VAULT_SECRET === 'string' && process.env.CRAFTTALKER_VAULT_SECRET.length > 0
  const salt = useSecret ? randomBytes(SALT_BYTES) : undefined
  const key = useSecret
    ? scryptSync(process.env.CRAFTTALKER_VAULT_SECRET!, salt!, KEY_BYTES, { N: 16_384, r: 8, p: 1 })
    : loadOrCreateFileKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  return {
    version: 1,
    kdf: useSecret ? 'scrypt' : 'file-key',
    ...(salt ? { salt: salt.toString('base64') } : {}),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

function loadOrCreateFileKey(): Buffer {
  const file = keyPath()
  fs.mkdirSync(vaultDir(), { recursive: true })
  if (fs.existsSync(file)) {
    const key = fs.readFileSync(file)
    if (key.byteLength !== KEY_BYTES) throw new Error('LLM key vault key file is invalid.')
    return key
  }
  const key = randomBytes(KEY_BYTES)
  writeDurably(file, key, 0o600)
  return key
}

function save(): void {
  const envelope = encryptPayload(JSON.stringify([...records.values()]))
  writeDurably(vaultPath(), Buffer.from(JSON.stringify(envelope), 'utf8'))
}

function writeDurably(filePath: string, body: Buffer, mode = 0o600): void {
  const directory = path.dirname(filePath)
  fs.mkdirSync(directory, { recursive: true })
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  const handle = fs.openSync(tempPath, 'w', mode)
  try {
    fs.writeSync(handle, body)
    fs.fsyncSync(handle)
  } finally {
    fs.closeSync(handle)
  }
  try {
    fs.renameSync(tempPath, filePath)
  } catch (error) {
    if (!isReplaceError(error)) throw error
    fs.rmSync(filePath, { force: true })
    fs.renameSync(tempPath, filePath)
  }
}

function isReplaceError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'EEXIST' || error.code === 'EPERM' || error.code === 'ENOTEMPTY')
}

function isVaultSessionRecord(value: unknown): value is VaultSessionRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<VaultSessionRecord>
  return typeof record.sessionId === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string'
    && typeof record.expiresAt === 'string'
    && typeof record.usageCount === 'number'
    && typeof record.hasApiKey === 'boolean'
    && typeof record.apiKey === 'string'
    && typeof record.ownerId === 'string'
}

export function getLlmKeyVaultRecords(): Map<string, VaultSessionRecord> { return loadIfNeeded() }
export function persistLlmKeyVault(): void { loadIfNeeded(); save() }

export function resetLlmKeyVaultForTest(): void {
  if (process.env.NODE_ENV !== 'test') return
  loadedPath = null
  records = new Map()
}

export function clearLlmKeyVaultForTest(): void {
  if (process.env.NODE_ENV !== 'test') return
  loadedPath = null
  records = new Map()
  fs.rmSync(vaultPath(), { force: true })
  fs.rmSync(keyPath(), { force: true })
}
