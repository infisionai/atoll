import type { ProviderStatus } from '../canvas/library/providers'

export type ProviderAuthKind = 'oauth' | 'api_key'

/** Normalize missing auth metadata from older browser stories to the existing OAuth flow. */
export function providerAuthKind(provider: Pick<ProviderStatus, 'authKind'>): ProviderAuthKind {
  return provider.authKind === 'api_key' ? 'api_key' : 'oauth'
}

export function usesApiKey(provider: Pick<ProviderStatus, 'authKind'>): boolean {
  return providerAuthKind(provider) === 'api_key'
}
