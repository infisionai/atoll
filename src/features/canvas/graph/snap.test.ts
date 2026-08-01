import { describe, expect, it } from 'vitest'
import { RELEASE_RADIUS, resolveSnap, SNAP_RADIUS, type SnapCandidate } from './snap'

const port = (id: string, x: number, y = 0): SnapCandidate => ({ id, center: { x, y } })

describe('resolveSnap', () => {
  it('snaps when inside SNAP_RADIUS', () => {
    expect(resolveSnap({ x: SNAP_RADIUS - 1, y: 0 }, [port('p', 0)], null)).toBe('p')
  })

  it('does not snap outside SNAP_RADIUS', () => {
    expect(resolveSnap({ x: SNAP_RADIUS + 1, y: 0 }, [port('p', 0)], null)).toBeNull()
  })

  it('snaps to the nearest of multiple candidate ports', () => {
    expect(resolveSnap({ x: 10, y: 0 }, [port('far', 30), port('near', 15)], null)).toBe('near')
  })

  it('once snapped, holds past SNAP_RADIUS until RELEASE_RADIUS', () => {
    const between = (SNAP_RADIUS + RELEASE_RADIUS) / 2
    expect(resolveSnap({ x: between, y: 0 }, [port('p', 0)], 'p')).toBe('p')
  })

  it('releases once past RELEASE_RADIUS', () => {
    expect(resolveSnap({ x: RELEASE_RADIUS + 1, y: 0 }, [port('p', 0)], 'p')).toBeNull()
  })

  it('does not switch to a closer port while snapped', () => {
    const cursor = { x: 20, y: 0 }
    const candidates = [port('held', 0), port('closer', 22)]
    expect(resolveSnap(cursor, candidates, 'held')).toBe('held')
  })

  it('right after release it can snap to a nearby new port', () => {
    const cursor = { x: RELEASE_RADIUS + 10, y: 0 }
    const candidates = [port('old', 0), port('new', RELEASE_RADIUS + 20)]
    expect(resolveSnap(cursor, candidates, 'old')).toBe('new')
  })
})
