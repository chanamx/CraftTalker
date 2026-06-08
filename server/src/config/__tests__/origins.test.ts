import { afterEach, describe, expect, it } from 'vitest'
import { corsOrigin, getAllowedOrigins, isAllowedOrigin } from '../origins.js'

const previousAllowedOrigins = process.env.ALLOWED_ORIGINS

afterEach(() => {
  if (previousAllowedOrigins === undefined) {
    delete process.env.ALLOWED_ORIGINS
  } else {
    process.env.ALLOWED_ORIGINS = previousAllowedOrigins
  }
})

describe('origin configuration', () => {
  it('allows built-in development origins', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true)
    expect(corsOrigin('http://localhost:5173')).toBe('http://localhost:5173')
  })

  it('trims and allows ALLOWED_ORIGINS entries', () => {
    process.env.ALLOWED_ORIGINS = ' https://crafttalker.example , https://app.example '

    expect(getAllowedOrigins()).toContain('https://crafttalker.example')
    expect(isAllowedOrigin('https://app.example')).toBe(true)
    expect(corsOrigin('https://app.example')).toBe('https://app.example')
  })

  it('returns an empty CORS origin for untrusted origins', () => {
    expect(isAllowedOrigin('https://evil.example')).toBe(false)
    expect(corsOrigin('https://evil.example')).toBe('')
  })
})
