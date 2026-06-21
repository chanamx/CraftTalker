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
  requires?: string[]
  dependencies?: string[]
  optional?: string[]
  minimum_client_version?: string
  homePage?: string
  auto_update?: boolean
  generate_interceptor?: string
  [key: string]: unknown
}

interface ExtensionLocation extends ExtensionDiscovery {
  dir: string
}

export type ExtensionRuntimeCapabilityStatus = 'supported' | 'partial' | 'stub' | 'blocked'

export interface ExtensionRuntimeCapability {
  id: string
  status: ExtensionRuntimeCapabilityStatus
  note: string
}

export interface ExtensionCompatibilityReportItem extends ExtensionDiscovery {
  displayName: string
  version: string
  author: string
  enabled: boolean
  manifestOk: boolean
  manifestError?: string
  scriptPath: string | null
  scriptOk: boolean
  cssPath: string | null
  cssOk: boolean
  loadingOrder: number
  requires: string[]
  missingRequiredDependencies: string[]
  optional: string[]
  minimumClientVersion: string | null
  homePage: string | null
  autoUpdate: boolean
  generateInterceptor: string | null
}

export interface ExtensionCompatibilityReport {
  generatedAt: string
  totals: {
    discovered: number
    enabled: number
    withErrors: number
  }
  extensions: ExtensionCompatibilityReportItem[]
  runtimeCapabilities: ExtensionRuntimeCapability[]
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

export async function getExtensionCompatibilityReport(): Promise<ExtensionCompatibilityReport> {
  const [locations, settings] = await Promise.all([
    getExtensionLocations(),
    readExtensionSettings(),
  ])
  const disabledExtensions = getDisabledExtensions(settings)

  const seen = new Set<string>()
  const uniqueLocations: ExtensionLocation[] = []
  for (const location of locations) {
    if (seen.has(location.name)) continue
    seen.add(location.name)
    uniqueLocations.push(location)
  }

  const manifestNameSet = new Set(uniqueLocations.map(location => location.name))
  const extensions = await Promise.all(uniqueLocations.map(location =>
    buildExtensionCompatibilityReportItem(location, disabledExtensions, manifestNameSet),
  ))
  const withErrors = extensions.filter(item =>
    !item.manifestOk
    || !item.scriptOk
    || !item.cssOk
    || item.missingRequiredDependencies.length > 0,
  ).length

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      discovered: extensions.length,
      enabled: extensions.filter(item => item.enabled).length,
      withErrors,
    },
    extensions,
    runtimeCapabilities: getExtensionRuntimeCapabilities(),
  }
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

async function buildExtensionCompatibilityReportItem(
  location: ExtensionLocation,
  disabledExtensions: Set<string>,
  manifestNameSet: Set<string>,
): Promise<ExtensionCompatibilityReportItem> {
  let manifest: ExtensionManifest | null = null
  let manifestError: string | undefined
  try {
    manifest = await readManifestFromLocation(location)
  } catch (error) {
    manifestError = error instanceof Error ? error.message : String(error)
  }

  const scriptPath = getManifestPathValue(manifest?.js)
  const cssPath = getManifestPathValue(manifest?.css)
  const requires = getManifestDependencies(manifest)
  return {
    type: location.type,
    name: location.name,
    displayName: String(manifest?.display_name ?? location.name),
    version: String(manifest?.version ?? ''),
    author: String(manifest?.author ?? ''),
    enabled: !disabledExtensions.has(location.name),
    manifestOk: manifest !== null,
    ...(manifestError ? { manifestError } : {}),
    scriptPath,
    scriptOk: scriptPath === null ? true : await resourceExists(location, scriptPath),
    cssPath,
    cssOk: cssPath === null ? true : await resourceExists(location, cssPath),
    loadingOrder: getManifestLoadingOrder(manifest),
    requires,
    missingRequiredDependencies: requires.filter(dependency => !hasManifestDependency(manifestNameSet, dependency)),
    optional: getStringArray(manifest?.optional),
    minimumClientVersion: typeof manifest?.minimum_client_version === 'string' ? manifest.minimum_client_version : null,
    homePage: typeof manifest?.homePage === 'string' ? manifest.homePage : null,
    autoUpdate: manifest?.auto_update === true,
    generateInterceptor: typeof manifest?.generate_interceptor === 'string' ? manifest.generate_interceptor : null,
  }
}

async function readManifestFromLocation(location: ExtensionLocation): Promise<ExtensionManifest> {
  const manifestPath = validatePathInBase(path.join(location.dir, 'manifest.json'), location.dir)
  const raw = await fs.readFile(manifestPath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Extension manifest must be a JSON object')
  }
  return parsed as ExtensionManifest
}

async function resourceExists(location: ExtensionLocation, resourcePath: string): Promise<boolean> {
  try {
    const safePath = assertSafeRelativePath(resourcePath)
    const filePath = validatePathInBase(path.join(location.dir, safePath), location.dir)
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function getDisabledExtensions(settings: Record<string, unknown>): Set<string> {
  const disabled = settings.disabledExtensions
  return new Set(Array.isArray(disabled) ? disabled.filter((value): value is string => typeof value === 'string') : [])
}

function getManifestPathValue(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text : null
}

function getManifestLoadingOrder(manifest: ExtensionManifest | null): number {
  const order = Number(manifest?.loading_order)
  return Number.isFinite(order) ? order : 0
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '') : []
}

function getManifestDependencies(manifest: ExtensionManifest | null): string[] {
  return [...new Set([
    ...getStringArray(manifest?.requires),
    ...getStringArray(manifest?.dependencies),
  ])]
}

function hasManifestDependency(manifestNameSet: Set<string>, dependency: string): boolean {
  return manifestNameSet.has(dependency) || manifestNameSet.has(`third-party/${dependency}`)
}

function getExtensionRuntimeCapabilities(): ExtensionRuntimeCapability[] {
  return [
    {
      id: 'resource-loading',
      status: 'supported',
      note: 'Discovers local/global/system extensions and serves manifests, scripts, styles, chunks, workers, templates, locales, and ST root script shims.',
    },
    {
      id: 'settings',
      status: 'supported',
      note: 'Persists extension settings while preserving unknown plugin keys.',
    },
    {
      id: 'st-public-shims',
      status: 'partial',
      note: 'Provides common SillyTavern public module exports, globals, events, slash commands, macros, chat-completion source constants, ChatCompletionService bridge, jQuery, lodash, toastr, YAML, and a permissive z facade.',
    },
    {
      id: 'dom-anchors',
      status: 'partial',
      note: 'Provides stable extension settings anchors plus offscreen mirrors for common chat, send-form, quick-reply, and worldbook DOM selectors without replacing the native React UI.',
    },
    {
      id: 'metadata-persistence',
      status: 'partial',
      note: 'Active chat metadata can write through CraftTalker chat persistence; message-variable and broader ST field writes still need typed bridges.',
    },
    {
      id: 'worldbook-api',
      status: 'partial',
      note: 'Worldbook names, global selections, and entries are available through read-only CraftTalker world-service bridges; plugin write operations remain blocked or stubbed.',
    },
    {
      id: 'generation-api',
      status: 'partial',
      note: 'ST host chat-completions status/generate endpoints proxy direct provider calls through CraftTalker provider rules across common OpenAI-compatible, Claude, Gemini, and custom sources; TavernHelper generate/generateRaw can run governed background requests with explicit custom_api/oai_settings, streaming token events, and AbortController cancellation without writing chats, runs, or plugin state.',
    },
    {
      id: 'extension-management',
      status: 'blocked',
      note: 'Install, update, delete, move, branch switching, and version checks remain disabled server-side.',
    },
    {
      id: 'unsafe-script-runtime',
      status: 'blocked',
      note: 'Arbitrary TaskJS/system-level script execution is not exposed without a trust, permission, and journal boundary.',
    },
  ]
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
