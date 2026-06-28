import path from 'node:path'
import { createError, ErrorCode } from './errors.js'
export { writeAtomicFile } from './path-utils.js'

export type SupportedImageKind = 'png' | 'jpeg' | 'webp' | 'gif'

export interface UploadedImageFile {
  name?: string
  size?: number
  type?: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

export interface ValidatedImageUpload {
  body: Buffer
  kind: SupportedImageKind
}

export function detectImageKind(body: Buffer): SupportedImageKind | null {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png'
  }
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return 'jpeg'
  }
  if (body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp'
  }
  if (body.length >= 6) {
    const signature = body.subarray(0, 6).toString('ascii')
    if (signature === 'GIF87a' || signature === 'GIF89a') {
      return 'gif'
    }
  }
  return null
}

export function getImageContentType(kind: SupportedImageKind): string {
  if (kind === 'jpeg') return 'image/jpeg'
  return `image/${kind}`
}

export function getFallbackImageContentType(filename: string): string {
  const extension = path.extname(filename).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  return 'image/png'
}

export function getStoredImageContentType(body: Buffer, filename: string): string {
  const kind = detectImageKind(body)
  return kind ? getImageContentType(kind) : getFallbackImageContentType(filename)
}

export function assertSupportedImage(
  body: Buffer,
  options: { label: string; maxBytes: number },
): SupportedImageKind {
  if (body.length > options.maxBytes) {
    throw createError(ErrorCode.VALIDATION_ERROR, `${options.label} is too large`, {
      maxBytes: options.maxBytes,
      size: body.length,
    })
  }

  const kind = detectImageKind(body)
  if (!kind) {
    throw createError(ErrorCode.VALIDATION_ERROR, `${options.label} must be a PNG, JPEG, WebP, or GIF image`)
  }
  return kind
}

export async function readValidatedImageUpload(
  file: UploadedImageFile,
  options: { label: string; maxBytes: number },
): Promise<ValidatedImageUpload> {
  const body = Buffer.from(await file.arrayBuffer())
  const kind = assertSupportedImage(body, options)
  return { body, kind }
}
