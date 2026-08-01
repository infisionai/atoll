import { describe, expect, it } from 'vitest'
import { IDENTITY, MAX_SCALE, MIN_SCALE, pan, screenToWorld, worldToScreen, zoomAt } from './viewport'

describe('screenToWorld / worldToScreen', () => {
  it('they are inverses of each other', () => {
    const vp = { x: 120, y: -40, scale: 1.5 }
    const p = { x: 300, y: 200 }
    expect(worldToScreen(vp, screenToWorld(vp, p))).toEqual(p)
  })
})

describe('pan', () => {
  it('moves only the offset', () => {
    expect(pan({ x: 10, y: 20, scale: 2 }, 5, -5)).toEqual({ x: 15, y: 15, scale: 2 })
  })
})

describe('zoomAt', () => {
  it('the world point under the anchor stays under the anchor after zoom', () => {
    const anchor = { x: 400, y: 300 }
    const before = screenToWorld(IDENTITY, anchor)
    const zoomed = zoomAt(IDENTITY, anchor, 1.6)
    expect(screenToWorld(zoomed, anchor).x).toBeCloseTo(before.x)
    expect(screenToWorld(zoomed, anchor).y).toBeCloseTo(before.y)
  })

  it('scale is clamped to MIN/MAX', () => {
    expect(zoomAt(IDENTITY, { x: 0, y: 0 }, 100).scale).toBe(MAX_SCALE)
    expect(zoomAt(IDENTITY, { x: 0, y: 0 }, 0.001).scale).toBe(MIN_SCALE)
  })

  it('returns the viewport unchanged when clamping leaves scale the same', () => {
    const atMax = { x: 5, y: 5, scale: MAX_SCALE }
    expect(zoomAt(atMax, { x: 100, y: 100 }, 2)).toBe(atMax)
  })
})
