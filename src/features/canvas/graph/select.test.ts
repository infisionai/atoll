import { describe, expect, it } from 'vitest'
import { rectFromPoints, rectsIntersect } from './select'

describe('rectFromPoints', () => {
  it('normalizes to a positive size whichever direction you drag', () => {
    expect(rectFromPoints({ x: 100, y: 80 }, { x: 20, y: 10 })).toEqual({
      x: 20,
      y: 10,
      width: 80,
      height: 70,
    })
  })
})

describe('rectsIntersect', () => {
  const box = { x: 0, y: 0, width: 100, height: 100 }

  it('true when overlapping', () => {
    expect(rectsIntersect(box, { x: 90, y: 90, width: 50, height: 50 })).toBe(true)
  })

  it('true on partial overlap (full containment not required)', () => {
    expect(rectsIntersect(box, { x: -10, y: 50, width: 20, height: 20 })).toBe(true)
  })

  it('false when apart', () => {
    expect(rectsIntersect(box, { x: 101, y: 0, width: 10, height: 10 })).toBe(false)
    expect(rectsIntersect(box, { x: 0, y: 101, width: 10, height: 10 })).toBe(false)
  })
})
