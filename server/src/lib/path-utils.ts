import fs from 'node:fs/promises'
import path from 'node:path'
import { createError, ErrorCode } from './errors.js'

export function sanitizePathSegment(input: string, maxLength = 255): string {
  if (!input || typeof input !== 'string') {
    throw createError(ErrorCode.VALIDATION_ERROR, '路径参数不能为空')
  }

  let safe = input
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9\-_.\u4e00-\u9fa5 ()]/g, '_')
    .trim()

  if (safe.length > maxLength) {
    safe = safe.slice(0, maxLength)
  }

  if (!safe || safe === '.') {
    throw createError(ErrorCode.VALIDATION_ERROR, '路径参数无效')
  }

  return safe
}

export function validatePathInBase(targetPath: string, baseDir: string): string {
  const resolved = path.resolve(targetPath)
  const base = path.resolve(baseDir)
  const relative = path.relative(base, resolved)

  if (relative !== '' && (relative.startsWith('..') || path.isAbsolute(relative))) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      '非法路径：超出允许范围',
      { targetPath, baseDir },
    )
  }

  return resolved
}

export function safePath(baseDir: string, ...segments: string[]): string {
  const sanitized = segments.map(s => sanitizePathSegment(s))
  const targetPath = path.join(baseDir, ...sanitized)
  return validatePathInBase(targetPath, baseDir)
}

export async function writeAtomicFile(filePath: string, body: Buffer): Promise<void> {
  const directory = path.dirname(filePath)
  await fs.mkdir(directory, { recursive: true })
  const tempPath = validatePathInBase(
    path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`),
    directory,
  )
  await fs.writeFile(tempPath, body)
  await fs.rename(tempPath, filePath)
}
