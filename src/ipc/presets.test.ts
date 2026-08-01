import { describe, expect, it } from 'vitest'
import { normalizePresets } from './commands'

describe('normalizePresets — presets_show response normalization', () => {
  it('accepts {items:[...]} (real response), {presets:[...]}, and bare arrays', () => {
    const item = { id: 'a', name: 'EARTH ZOOM', description: 'd', preview_url: 'https://v/p.mp4' }
    expect(normalizePresets({ items: [item] })).toEqual([
      { id: 'a', name: 'EARTH ZOOM', description: 'd', previewUrl: 'https://v/p.mp4' },
    ])
    expect(normalizePresets({ presets: [item] })).toHaveLength(1)
    expect(normalizePresets([item])).toHaveLength(1)
  })

  it('filters out entries missing required fields', () => {
    expect(normalizePresets({ presets: [{ id: 'x' }, { name: 'n' }, 3] })).toEqual([])
    expect(normalizePresets(null)).toEqual([])
  })
})
