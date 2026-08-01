import { describe, expect, it } from 'vitest'
import { thumbnailLayout } from './thumbnail'
import type { GraphDoc } from '../../ipc/commands'

function doc(partial: Partial<GraphDoc>): GraphDoc {
  return { nodes: [], edges: [], ...partial }
}

const NODE = { kind: 'asset', ref: 'image', values: {} }

describe('thumbnailLayout', () => {
  it('returns null for an empty graph', () => {
    expect(thumbnailLayout(doc({}), 160, 100)).toBeNull()
    expect(thumbnailLayout(null, 160, 100)).toBeNull()
  })

  it('fits nodes inside the padding and centers them', () => {
    const d = doc({
      nodes: [
        { ...NODE, id: 'a', x: 0, y: 0 },
        { ...NODE, id: 'b', x: 1000, y: 500 },
      ] as GraphDoc['nodes'],
    })
    const layout = thumbnailLayout(d, 160, 100, 6)!
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(6 - 1e-9)
      expect(n.y).toBeGreaterThanOrEqual(6 - 1e-9)
      expect(n.x + n.w).toBeLessThanOrEqual(160 - 6 + 1e-9)
      expect(n.y + n.h).toBeLessThanOrEqual(100 - 6 + 1e-9)
    }
    // Graph fills the full width — left and right margins are equal (center-aligned)
    const left = Math.min(...layout.nodes.map((n) => n.x))
    const right = 160 - Math.max(...layout.nodes.map((n) => n.x + n.w))
    expect(left).toBeCloseTo(right, 5)
  })

  it('edges run from the source node right-center to the target node left-center', () => {
    const d = doc({
      nodes: [
        { ...NODE, id: 'a', kind: 'model', x: 0, y: 0 },
        { ...NODE, id: 'b', x: 600, y: 0 },
      ] as GraphDoc['nodes'],
      edges: [{ from: 'a:__out', to: 'b:__in' }],
    })
    const layout = thumbnailLayout(d, 160, 100)!
    const [a, b] = layout.nodes
    expect(layout.edges).toHaveLength(1)
    expect(layout.edges[0].x1).toBeCloseTo(a.x + a.w, 5)
    expect(layout.edges[0].y1).toBeCloseTo(a.y + a.h / 2, 5)
    expect(layout.edges[0].x2).toBeCloseTo(b.x, 5)
  })

  it('ignores edges pointing at removed nodes', () => {
    const d = doc({
      nodes: [{ ...NODE, id: 'a', x: 0, y: 0 }] as GraphDoc['nodes'],
      edges: [{ from: 'a:__out', to: 'ghost:__in' }],
    })
    expect(thumbnailLayout(d, 160, 100)!.edges).toHaveLength(0)
  })

  it('exposes asset media URLs — excluding blob:', () => {
    const d = doc({
      nodes: [
        { ...NODE, id: 'a', x: 0, y: 0, values: { media: { url: 'https://cdn/x.png' } } },
        { ...NODE, id: 'b', x: 400, y: 0, values: { media: { url: 'blob:dead' } } },
        { ...NODE, id: 'm', kind: 'model', x: 800, y: 0, values: { media: { url: 'https://y' } } },
      ] as GraphDoc['nodes'],
    })
    const layout = thumbnailLayout(d, 160, 100)!
    expect(layout.nodes.find((n) => n.id === 'a')?.mediaUrl).toBe('https://cdn/x.png')
    expect(layout.nodes.find((n) => n.id === 'b')?.mediaUrl).toBeUndefined()
    // Model nodes do not expose media
    expect(layout.nodes.find((n) => n.id === 'm')?.mediaUrl).toBeUndefined()
  })
})
