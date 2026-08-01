import { describe, expect, it } from 'vitest'
import { buildProviders, flattenCatalog } from './providers'
import type { ModelSpec } from '../model-spec'

describe('provider catalog wiring', () => {
  it('routes dynamic Kling models into the Kling provider tab', () => {
    const models: ModelSpec[] = [
      { id: 'kling/text_to_image/kling-image-v3_0', name: 'Kling Image', output_type: 'image', provider: 'kling' },
      { id: 'higgsfield/soul', name: 'Soul', output_type: 'image', provider: 'higgsfield' },
    ]

    const providers = buildProviders(models)
    expect(providers.find((provider) => provider.id === 'kling')?.models).toHaveLength(1)
    expect(flattenCatalog(providers)).toHaveLength(2)
  })
})
