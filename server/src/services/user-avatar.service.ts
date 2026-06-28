import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createError, ErrorCode } from '../lib/errors.js'
import { validatePathInBase } from '../lib/path-utils.js'
import {
  getStoredImageContentType,
  readValidatedImageUpload,
  writeAtomicFile,
  type UploadedImageFile,
} from '../lib/image-storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')
const MAX_USER_AVATAR_BYTES = 10 * 1024 * 1024
const SAFE_USER_AVATAR_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.() -]{0,199}\.(?:png|jpg|jpeg|webp|gif)$/i

export interface UploadedAvatarFile {
  name?: string
  size?: number
  type?: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

export interface UserAvatarReadResult {
  body: Buffer
  contentType: string
}

export interface UserAvatarUploadResult {
  path: string
}

export interface UserAvatarDeleteResult {
  result: 'ok'
}

function getDataDir(): string {
  return process.env.LUKER_DATA_DIR ?? DEFAULT_DATA_DIR
}

function getUserAvatarsDir(): string {
  return path.join(getDataDir(), 'user', 'avatars')
}

function assertSafeUserAvatarName(value: string): string {
  const filename = String(value ?? '').trim()
  if (!SAFE_USER_AVATAR_NAME.test(filename) || filename !== path.basename(filename)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid user avatar name')
  }
  return filename
}

function getUserAvatarPath(filename: string): string {
  const safeName = assertSafeUserAvatarName(filename)
  return validatePathInBase(path.join(getUserAvatarsDir(), safeName), getUserAvatarsDir())
}

export async function listUserAvatars(): Promise<string[]> {
  const avatarsDir = getUserAvatarsDir()
  if (!existsSync(avatarsDir)) return []

  const entries = await fs.readdir(avatarsDir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && SAFE_USER_AVATAR_NAME.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

export async function readUserAvatar(filename: string): Promise<UserAvatarReadResult> {
  const safeName = assertSafeUserAvatarName(filename)
  const filePath = getUserAvatarPath(safeName)
  if (!existsSync(filePath)) {
    throw createError(ErrorCode.FILE_NOT_FOUND, 'User avatar was not found', { filename: safeName })
  }

  const body = await fs.readFile(filePath)
  return {
    body,
    contentType: getStoredImageContentType(body, safeName),
  }
}

export async function saveUploadedUserAvatar(
  file: UploadedImageFile,
  overwriteName?: string,
): Promise<UserAvatarUploadResult> {
  const rawName = overwriteName?.trim() || file.name || `${Date.now()}.png`
  const safeName = assertSafeUserAvatarName(rawName)
  const { body } = await readValidatedImageUpload(file, {
    label: 'User avatar',
    maxBytes: MAX_USER_AVATAR_BYTES,
  })

  await writeAtomicFile(getUserAvatarPath(safeName), body)
  return { path: safeName }
}

export async function deleteUserAvatar(filename: string): Promise<UserAvatarDeleteResult> {
  const safeName = assertSafeUserAvatarName(filename)
  const filePath = getUserAvatarPath(safeName)
  try {
    await fs.unlink(filePath)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw createError(ErrorCode.FILE_NOT_FOUND, 'User avatar was not found', { filename: safeName })
    }
    throw error
  }
  return { result: 'ok' }
}
