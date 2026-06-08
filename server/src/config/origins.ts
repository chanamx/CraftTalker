const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
]

export function getAllowedOrigins(): string[] {
  const additionalOrigins = process.env.ALLOWED_ORIGINS
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) || []

  return [...DEFAULT_ALLOWED_ORIGINS, ...additionalOrigins]
}

export function isAllowedOrigin(origin: string): boolean {
  return getAllowedOrigins().includes(origin)
}

export function corsOrigin(origin: string): string {
  return isAllowedOrigin(origin) ? origin : ''
}
