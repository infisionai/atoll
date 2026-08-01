import { describe, expect, it } from 'vitest'
import { bezierReach, edgeMidpoint, edgePath } from './edge-path'

describe('bezierReach', () => {
  it('guarantees at least 40px for nearby ports', () => {
    expect(bezierReach({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(40)
  })

  it('uses half the horizontal distance for distant ports', () => {
    expect(bezierReach({ x: 0, y: 0 }, { x: 400, y: 100 })).toBe(200)
  })

  it('stays positive even reversed (dragging left)', () => {
    expect(bezierReach({ x: 400, y: 0 }, { x: 0, y: 0 })).toBe(200)
  })
})

describe('edgePath', () => {
  it('leaves the start horizontally and arrives at the end horizontally', () => {
    expect(edgePath({ x: 0, y: 10 }, { x: 300, y: 90 })).toBe(
      'M 0 10 C 150 10, 150 90, 300 90',
    )
  })
})

describe('edgeMidpoint', () => {
  it('the midpoint of a symmetric curve is the arithmetic center of the endpoints', () => {
    expect(edgeMidpoint({ x: 0, y: 0 }, { x: 300, y: 100 })).toEqual({ x: 150, y: 50 })
  })
})
