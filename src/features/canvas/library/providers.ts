import type { ModelSpec } from '../model-spec'

/**
 * MCP provider catalogs — multi-provider ready.
 * Only Higgsfield for now; entries grow in this array as Magnific and Kling come online.
 * Provider connect/disconnect is handled in settings.
 */

export type ProviderId = 'higgsfield' | 'magnific' | 'kling' | 'elevenlabs'

export interface ProviderCatalog {
  id: ProviderId
  name: string
  models: ModelSpec[]
  connected: boolean
}

/** Splits the merged catalog (by each model's provider field) into the provider tab structure */
export function buildProviders(models: ModelSpec[]): ProviderCatalog[] {
  const byProvider = (id: ProviderId) =>
    models.filter((m) => (m.provider ?? 'higgsfield') === id)
  return [
    { id: 'higgsfield', name: 'Higgsfield', models: byProvider('higgsfield'), connected: true },
    { id: 'magnific', name: 'Magnific', models: byProvider('magnific'), connected: false },
    { id: 'kling', name: 'Kling', models: byProvider('kling'), connected: false },
    { id: 'elevenlabs', name: 'ElevenLabs', models: byProvider('elevenlabs'), connected: false },
  ]
}

/** Flatten all providers' models — for spec resolution in GraphCanvas */
export function flattenCatalog(providers: ProviderCatalog[]): ModelSpec[] {
  return providers.flatMap((p) => p.models)
}

/** Provider runtime connection state — shared by the settings screen, balance chip, and library tabs */
export type ProviderConnState = 'disconnected' | 'connecting' | 'connected' | 'expired'

export interface ProviderStatus {
  id: ProviderId
  name: string
  /** One-line intro shown on the unconnected card */
  description?: string
  state: ProviderConnState
  /** OAuth for MCP providers; API key for native providers */
  authKind?: 'oauth' | 'api_key'
  /** For displaying the connected account (email, etc.) */
  account?: string
  /** Balance cache — refetched only on job completion or manual refresh */
  balance?: number
  /** Optional provider-specific balance label */
  balanceUnit?: string
  /** Credit purchase page — provided by the Rust ProviderStatusDto */
  pricingUrl?: string
  /** Notice when connected but usage is restricted (e.g. premium only) — set on the frontend */
  notice?: string
}
