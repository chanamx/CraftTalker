import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createError, ErrorCode } from '../lib/errors.js'
import { validatePathInBase, writeAtomicFile } from '../lib/path-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')
const MAX_USER_FILE_BYTES = 25 * 1024 * 1024
const SAFE_TEXT_USER_FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.() -]{0,199}\.(?:json|txt|md|yaml|yml)$/i
const SAFE_LITTLE_WHITE_BOX_ZIP_NAME = /^LWB_VectorBackup_[a-z0-9]+\.zip$/i

export interface UserFileReadResult {
  body: Buffer
  contentType: string
}

export interface UserFileSaveResult {
  success: true
  name: string
  path: string
  size: number
}

export interface UserFileDeleteResult {
  success: true
  deleted: true
  path: string
}

function getDataDir(): string {
  return process.env.LUKER_DATA_DIR ?? DEFAULT_DATA_DIR
}

function getUserFilesDir(): string {
  return path.join(getDataDir(), 'user', 'files')
}

function assertSafeUserFileName(value: string): string {
  const filename = String(value ?? '').trim()
  if (
    (!SAFE_TEXT_USER_FILE_NAME.test(filename) && !SAFE_LITTLE_WHITE_BOX_ZIP_NAME.test(filename))
    || filename !== path.basename(filename)
  ) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid user file name')
  }
  return filename
}

function assertSafeUserFilePath(value: string): string {
  const normalizedPath = String(value ?? '')
    .trim()
    .replace(/^\/+/, '')
    .replaceAll('\\', '/')

  const prefix = 'user/files/'
  if (!normalizedPath.startsWith(prefix)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid user file path')
  }
  const filename = normalizedPath.slice(prefix.length)
  return assertSafeUserFileName(filename)
}

function getUserFilePath(filename: string): string {
  const safeName = assertSafeUserFileName(filename)
  return validatePathInBase(path.join(getUserFilesDir(), safeName), getUserFilesDir())
}

function getContentType(filename: string): string {
  const extension = path.extname(filename).toLowerCase()
  if (extension === '.json') return 'application/json; charset=utf-8'
  if (extension === '.md') return 'text/markdown; charset=utf-8'
  if (extension === '.yaml' || extension === '.yml') return 'application/yaml; charset=utf-8'
  if (extension === '.zip') return 'application/zip'
  return 'text/plain; charset=utf-8'
}

function decodeBase64Payload(value: string): Buffer {
  const raw = String(value ?? '').trim()
  const payload = raw.includes(';base64,') ? raw.slice(raw.indexOf(';base64,') + ';base64,'.length) : raw
  const compactPayload = payload.replace(/\s/g, '')
  if (
    !compactPayload
    || !/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(compactPayload)
  ) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid base64 file data')
  }

  const buffer = Buffer.from(compactPayload, 'base64')
  if (buffer.length > MAX_USER_FILE_BYTES) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'User file is too large', {
      maxBytes: MAX_USER_FILE_BYTES,
      size: buffer.length,
    })
  }
  return buffer
}

export async function readUserFile(filename: string): Promise<UserFileReadResult> {
  const filePath = getUserFilePath(filename)
  if (!existsSync(filePath)) {
    throw createError(ErrorCode.FILE_NOT_FOUND, 'User file was not found', { filename })
  }
  return {
    body: await fs.readFile(filePath),
    contentType: getContentType(filename),
  }
}

export async function saveUploadedUserFile(name: string, data: string): Promise<UserFileSaveResult> {
  const safeName = assertSafeUserFileName(name)
  const filePath = getUserFilePath(safeName)
  const body = decodeBase64Payload(data)
  await writeAtomicFile(filePath, body)
  return {
    success: true,
    name: safeName,
    path: `/user/files/${encodeURIComponent(safeName)}`,
    size: body.length,
  }
}

export async function deleteUserFileByPath(userFilePath: string): Promise<UserFileDeleteResult> {
  const safeName = assertSafeUserFilePath(userFilePath)
  const filePath = getUserFilePath(safeName)
  try {
    await fs.unlink(filePath)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw createError(ErrorCode.FILE_NOT_FOUND, 'User file was not found', { filename: safeName })
    }
    throw error
  }
  return {
    success: true,
    deleted: true,
    path: `/user/files/${encodeURIComponent(safeName)}`,
  }
}
