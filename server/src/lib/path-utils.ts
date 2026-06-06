/**
 * 路径安全工具 - 防止路径遍历攻击
 */

import path from 'node:path'
import { createError, ErrorCode } from './errors.js'

/**
 * 清理用户输入的路径片段，移除危险字符
 *
 * @param input 用户输入的路径片段（文件名、目录名等）
 * @param maxLength 最大长度限制
 * @returns 安全的路径片段
 */
export function sanitizePathSegment(input: string, maxLength = 255): string {
  if (!input || typeof input !== 'string') {
    throw createError(ErrorCode.VALIDATION_ERROR, '路径参数不能为空')
  }

  // 1. 移除路径遍历字符
  let safe = input.replace(/\.\./g, '')

  // 2. 替换路径分隔符为下划线（防止创建子目录）
  safe = safe.replace(/[/\\]/g, '_')

  // 3. 白名单字符：字母、数字、中文、常见标点
  // 允许: a-z A-Z 0-9 中文 - _ . 空格 ()
  safe = safe.replace(/[^a-zA-Z0-9\-_.一-龥 ()]/g, '_')

  // 4. 移除前后空格
  safe = safe.trim()

  // 5. 长度限制
  if (safe.length > maxLength) {
    safe = safe.slice(0, maxLength)
  }

  // 6. 不允许空字符串或纯空格
  if (!safe || safe === '.') {
    throw createError(ErrorCode.VALIDATION_ERROR, '路径参数无效')
  }

  return safe
}

/**
 * 验证解析后的路径是否在允许的基础目录内
 *
 * @param targetPath 目标路径（相对或绝对）
 * @param baseDir 允许的基础目录（绝对路径）
 * @returns 验证通过返回规范化的绝对路径
 * @throws 如果路径越界则抛出错误
 */
export function validatePathInBase(targetPath: string, baseDir: string): string {
  const resolved = path.resolve(targetPath)
  const base = path.resolve(baseDir)

  // Windows 路径不区分大小写，统一转小写比较
  const normalizedResolved = resolved.toLowerCase()
  const normalizedBase = base.toLowerCase()

  if (!normalizedResolved.startsWith(normalizedBase)) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      '非法路径：超出允许范围',
      { targetPath, baseDir }
    )
  }

  return resolved
}

/**
 * 安全构建路径并验证
 *
 * @param baseDir 基础目录
 * @param segments 路径片段（每个片段会被清理）
 * @returns 安全的绝对路径
 */
export function safePath(baseDir: string, ...segments: string[]): string {
  const sanitized = segments.map(s => sanitizePathSegment(s))
  const targetPath = path.join(baseDir, ...sanitized)
  return validatePathInBase(targetPath, baseDir)
}
