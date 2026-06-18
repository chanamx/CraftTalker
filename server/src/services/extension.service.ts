import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createError, ErrorCode } from '../lib/errors.js'
import { validatePathInBase } from '../lib/path-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')
const PUBLIC_DIR = path.resolve(__dirname, '../../../public')
const PUBLIC_SCRIPTS_DIR = path.resolve(__dirname, '../../../public/scripts')
const PUBLIC_EXTENSIONS_DIR = path.join(PUBLIC_SCRIPTS_DIR, 'extensions')
const SETTINGS_FILE_NAME = 'extension-settings.json'

export type ExtensionType = 'system' | 'local' | 'global'

export interface ExtensionDiscovery {
  type: ExtensionType
  name: string
}

export interface ExtensionManifest {
  display_name?: string
  version?: string
  author?: string
  js?: string
  css?: string
  loading_order?: number
  [key: string]: unknown
}

interface ExtensionLocation extends ExtensionDiscovery {
  dir: string
}

function getDataDir(): string {
  return process.env.LUKER_DATA_DIR ?? DEFAULT_DATA_DIR
}

function getLocalExtensionsDir(): string {
  return path.join(getDataDir(), 'extensions')
}

function getNestedLocalExtensionsDir(): string {
  return path.join(getLocalExtensionsDir(), 'third-party')
}

function getGlobalExtensionsDir(): string {
  return path.join(PUBLIC_EXTENSIONS_DIR, 'third-party')
}

function getExtensionSettingsPath(): string {
  return path.join(getLocalExtensionsDir(), SETTINGS_FILE_NAME)
}

async function listDirectories(baseDir: string): Promise<string[]> {
  if (!existsSync(baseDir)) return []
  const entries = await fs.readdir(baseDir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => isSafePathSegment(name))
    .sort((a, b) => a.localeCompare(b))
}

function isSafePathSegment(value: string): boolean {
  return Boolean(value)
    && value !== '.'
    && value !== '..'
    && !value.includes('/')
    && !value.includes('\\')
    && !value.includes('\0')
}

function assertSafeRelativePath(value: string): string {
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid extension path')
  }
  if (!decoded || decoded.includes('\0') || decoded.includes('\\') || path.isAbsolute(decoded)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid extension path')
  }

  const normalized = path.posix.normalize(decoded)
  if (
    normalized === '.'
    || normalized.startsWith('../')
    || normalized === '..'
    || normalized.includes('/../')
  ) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid extension path')
  }

  const parts = normalized.split('/')
  if (parts.some(part => !isSafePathSegment(part))) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid extension path')
  }
  return normalized
}

async function getSystemLocations(): Promise<ExtensionLocation[]> {
  const names = await listDirectories(PUBLIC_EXTENSIONS_DIR)
  return names
    .filter(name => name !== 'third-party')
    .map(name => ({ type: 'system', name, dir: path.join(PUBLIC_EXTENSIONS_DIR, name) }))
}

async function getLocalLocations(): Promise<ExtensionLocation[]> {
  const directNames = await listDirectories(getLocalExtensionsDir())
  const nestedNames = await listDirectories(getNestedLocalExtensionsDir())
  const names = new Set([
    ...directNames.filter(name => name !== 'third-party'),
    ...nestedNames,
  ])

  return [...names].sort((a, b) => a.localeCompare(b)).map((name) => {
    const nestedDir = path.join(getNestedLocalExtensionsDir(), name)
    const directDir = path.join(getLocalExtensionsDir(), name)
    return {
      type: 'local',
      name: `third-party/${name}`,
      dir: existsSync(nestedDir) ? nestedDir : directDir,
    }
  })
}

async function getGlobalLocations(): Promise<ExtensionLocation[]> {
  const names = await listDirectories(getGlobalExtensionsDir())
  return names.map(name => ({
    type: 'global',
    name: `third-party/${name}`,
    dir: path.join(getGlobalExtensionsDir(), name),
  }))
}

export async function discoverExtensions(): Promise<ExtensionDiscovery[]> {
  const locations = [
    ...await getSystemLocations(),
    ...await getLocalLocations(),
    ...await getGlobalLocations(),
  ]

  const seen = new Set<string>()
  const discovered: ExtensionDiscovery[] = []
  for (const location of locations) {
    if (seen.has(location.name)) continue
    seen.add(location.name)
    discovered.push({ type: location.type, name: location.name })
  }
  return discovered
}

async function getExtensionLocations(): Promise<ExtensionLocation[]> {
  return [
    ...await getSystemLocations(),
    ...await getLocalLocations(),
    ...await getGlobalLocations(),
  ]
}

async function findExtensionLocation(name: string): Promise<ExtensionLocation | null> {
  const safeName = assertSafeRelativePath(name)
  const locations = await getExtensionLocations()
  return locations.find(location => location.name === safeName) ?? null
}

export async function readExtensionManifest(name: string): Promise<ExtensionManifest> {
  const location = await findExtensionLocation(name)
  if (!location) {
    throw createError(ErrorCode.NOT_FOUND, `Extension "${name}" was not found`)
  }

  const manifestPath = validatePathInBase(path.join(location.dir, 'manifest.json'), location.dir)
  const raw = await fs.readFile(manifestPath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Extension manifest must be a JSON object')
  }
  return parsed as ExtensionManifest
}

export async function readExtensionResource(requestPath: string): Promise<{
  filePath: string
  contentType: string
  body: Uint8Array
}> {
  const safePath = assertSafeRelativePath(requestPath)
  const parts = safePath.split('/')
  const isThirdParty = parts[0] === 'third-party'
  const extensionName = isThirdParty ? parts.slice(0, 2).join('/') : parts[0]
  const resourcePath = isThirdParty ? parts.slice(2).join('/') : parts.slice(1).join('/')

  if (!extensionName || !resourcePath) {
    throw createError(ErrorCode.NOT_FOUND, 'Extension resource was not found')
  }

  const location = await findExtensionLocation(extensionName)
  if (!location) {
    throw createError(ErrorCode.NOT_FOUND, `Extension "${extensionName}" was not found`)
  }

  const normalizedResourcePath = assertSafeRelativePath(resourcePath)
  const filePath = validatePathInBase(path.join(location.dir, normalizedResourcePath), location.dir)
  let body: Buffer
  try {
    body = await fs.readFile(filePath)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw createError(ErrorCode.NOT_FOUND, 'Extension resource was not found')
    }
    throw error
  }
  return {
    filePath,
    contentType: getContentType(filePath),
    body,
  }
}

export async function readPublicScriptResource(requestPath: string): Promise<{
  filePath: string
  contentType: string
  body: Uint8Array
}> {
  const safePath = assertSafeRelativePath(requestPath)
  const filePath = validatePathInBase(path.join(PUBLIC_SCRIPTS_DIR, safePath), PUBLIC_SCRIPTS_DIR)
  let body: Buffer
  try {
    body = await fs.readFile(filePath)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw createError(ErrorCode.NOT_FOUND, 'Script resource was not found')
    }
    throw error
  }
  return {
    filePath,
    contentType: getContentType(filePath),
    body,
  }
}

export async function readPublicRootScriptResource(requestPath: string): Promise<{
  filePath: string
  contentType: string
  body: Uint8Array
}> {
  const safePath = assertSafeRelativePath(requestPath)
  const filePath = validatePathInBase(path.join(PUBLIC_DIR, safePath), PUBLIC_DIR)
  let body: Buffer
  try {
    body = await fs.readFile(filePath)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw createError(ErrorCode.NOT_FOUND, 'Script resource was not found')
    }
    throw error
  }
  return {
    filePath,
    contentType: getContentType(filePath),
    body,
  }
}

export async function readExtensionSettings(): Promise<Record<string, unknown>> {
  const filePath = getExtensionSettingsPath()
  if (!existsSync(filePath)) return getDefaultExtensionSettings()

  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return getDefaultExtensionSettings()
  }
  return { ...getDefaultExtensionSettings(), ...parsed as Record<string, unknown> }
}

export async function saveExtensionSettings(settings: Record<string, unknown>): Promise<Record<string, unknown>> {
  const merged = { ...getDefaultExtensionSettings(), ...settings }
  const filePath = getExtensionSettingsPath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

export function getDefaultExtensionSettings(): Record<string, unknown> {
  return {
    apiUrl: 'http://localhost:5100',
    apiKey: '',
    autoConnect: false,
    notifyUpdates: false,
    disabledExtensions: [],
    expressionOverrides: [],
    memory: {},
    note: {
      default: '',
      chara: [],
      wiAddition: [],
    },
    caption: {
      refine_mode: false,
    },
    expressions: {
      custom: [],
      showDefault: false,
      translate: false,
      allowMultiple: true,
      rerollIfSame: false,
      promptType: 'raw',
    },
    connectionManager: {
      selectedProfile: '',
      profiles: [],
    },
    dice: {},
    regex: [],
    regex_presets: [],
    character_allowed_regex: [],
    preset_allowed_regex: {},
    tts: {},
    sd: {
      prompts: {},
      character_prompts: {},
      character_negative_prompts: {},
    },
    chromadb: {},
    translate: {},
    objective: {},
    quickReply: {},
    randomizer: {
      controls: [],
      fluctuation: 0.1,
      enabled: false,
    },
    speech_recognition: {},
    rvc: {},
    hypebot: {},
    vectors: {},
    variables: {
      global: {},
    },
    attachments: [],
    character_attachments: {},
    disabled_attachments: [],
    gallery: {
      folders: {},
      sort: 'dateAsc',
    },
  }
}

function getContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.html':
      return 'text/html; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.ttf':
      return 'font/ttf'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.wav':
      return 'audio/wav'
    case '.mp3':
      return 'audio/mpeg'
    case '.ogg':
      return 'audio/ogg'
    default:
      return 'application/octet-stream'
  }
}
