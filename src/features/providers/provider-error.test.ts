import { describe, expect, it } from 'vitest'
import { displayProviderError } from './provider-error'

describe('displayProviderError', () => {
  it('strips the stable diagnostic prefix', () => {
    expect(
      displayProviderError('eleven-key-invalid: ElevenLabs rejected the API key'),
    ).toBe('ElevenLabs rejected the API key')
    expect(
      displayProviderError(
        'eleven-key-permissions: the API key is missing required permissions',
      ),
    ).toBe('the API key is missing required permissions')
  })

  it('passes through messages without a prefix', () => {
    expect(displayProviderError('Network unreachable')).toBe('Network unreachable')
  })

  it('returns null for empty input', () => {
    expect(displayProviderError(null)).toBeNull()
    expect(displayProviderError(undefined)).toBeNull()
    expect(displayProviderError('')).toBeNull()
  })

  it('falls back to the raw message when only a prefix is present', () => {
    expect(displayProviderError('eleven-validation:')).toBe('eleven-validation:')
  })
})
