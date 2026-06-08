/**
 * Encrypted settings storage backed by Web Crypto.
 *
 * This is a transitional client-side protection. A production deployment should
 * keep API keys server-side and expose only an authenticated session to the UI.
 */

export const SETTINGS_STORAGE_KEY = 'luker-settings-store'
const CRYPTO_KEY_NAME = 'luker-crypto-key'

function looksLikePlainJson(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

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

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  const exported = await crypto.subtle.exportKey('jwk', key)
  sessionStorage.setItem(CRYPTO_KEY_NAME, JSON.stringify(exported))

  return key
}

async function encrypt(data: string): Promise<string> {
  const key = await getCryptoKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(data)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  const ivB64 = btoa(String.fromCharCode(...iv))
  const encryptedB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)))

  return `${ivB64}.${encryptedB64}`
}

async function decrypt(encrypted: string): Promise<string | null> {
  try {
    const [ivB64, encryptedB64] = encrypted.split('.')
    if (!ivB64 || !encryptedB64) return null

    const key = await getCryptoKey()
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0))
    const data = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0))

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

export const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const stored = localStorage.getItem(name)
    if (!stored) return null

    if (looksLikePlainJson(stored)) {
      await secureStorage.setItem(name, stored)
      return stored
    }

    return decrypt(stored)
  },

  setItem: async (name: string, value: string): Promise<void> => {
    const encrypted = await encrypt(value)
    localStorage.setItem(name, encrypted)
  },

  removeItem: async (name: string): Promise<void> => {
    localStorage.removeItem(name)
  },
}

export function clearCryptoKey(): void {
  sessionStorage.removeItem(CRYPTO_KEY_NAME)
  localStorage.removeItem(SETTINGS_STORAGE_KEY)
}
