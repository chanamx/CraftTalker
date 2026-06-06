/**
 * 安全存储工具 - 使用 Web Crypto API 加密敏感数据
 *
 * 注意：这是临时方案。生产环境应将 API Key 存储在服务端，前端仅通过 session 认证。
 *
 * 加密密钥存储在 sessionStorage（会话期间有效），重启浏览器后需要重新输入 API Key。
 * 这比 localStorage 明文存储安全，但不如服务端存储。
 */

const STORAGE_KEY = 'luker-encrypted-settings'
const CRYPTO_KEY_NAME = 'luker-crypto-key'

// 生成或获取加密密钥（会话期间缓存）
async function getCryptoKey(): Promise<CryptoKey> {
  const stored = sessionStorage.getItem(CRYPTO_KEY_NAME)

  if (stored) {
    try {
      const keyData = JSON.parse(stored)
      return await crypto.subtle.importKey(
        'jwk',
        keyData,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      )
    } catch {
      sessionStorage.removeItem(CRYPTO_KEY_NAME)
    }
  }

  // 生成新密钥
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  const exported = await crypto.subtle.exportKey('jwk', key)
  sessionStorage.setItem(CRYPTO_KEY_NAME, JSON.stringify(exported))

  return key
}

// 加密数据
async function encrypt(data: string): Promise<string> {
  const key = await getCryptoKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(data)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  // 格式: base64(iv) + '.' + base64(encrypted)
  const ivB64 = btoa(String.fromCharCode(...iv))
  const encryptedB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)))

  return `${ivB64}.${encryptedB64}`
}

// 解密数据
async function decrypt(encrypted: string): Promise<string | null> {
  try {
    const [ivB64, encryptedB64] = encrypted.split('.')
    if (!ivB64 || !encryptedB64) return null

    const key = await getCryptoKey()
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0))
    const data = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0))

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    return null
  }
}

// Zustand 持久化适配器
export const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const encrypted = localStorage.getItem(name)
    if (!encrypted) return null

    const decrypted = await decrypt(encrypted)
    return decrypted
  },

  setItem: async (name: string, value: string): Promise<void> => {
    const encrypted = await encrypt(value)
    localStorage.setItem(name, encrypted)
  },

  removeItem: (name: string): void => {
    localStorage.removeItem(name)
  },
}

// 清除会话密钥（退出登录时调用）
export function clearCryptoKey(): void {
  sessionStorage.removeItem(CRYPTO_KEY_NAME)
  localStorage.removeItem(STORAGE_KEY)
}
