import { describe, expect, it } from 'vitest'
import { providerAuthKind, usesApiKey } from './auth-kind'

describe('provider authentication mode', () => {
  it('selects API-key flow for native providers', () => {
    expect(providerAuthKind({ authKind: 'api_key' })).toBe('api_key')
    expect(usesApiKey({ authKind: 'api_key' })).toBe(true)
  })

  it('keeps missing metadata on the OAuth flow for existing providers', () => {
    expect(providerAuthKind({ authKind: undefined })).toBe('oauth')
    expect(usesApiKey({ authKind: undefined })).toBe(false)
  })
})
