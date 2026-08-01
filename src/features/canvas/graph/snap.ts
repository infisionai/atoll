import type { Point } from './edge-path'

/** Magnetic snapping — pure functions */

export interface SnapCandidate {
  id: string
  center: Point
}

/** Snaps on when entering this radius */
export const SNAP_RADIUS = 28
/** Once snapped, it only detaches beyond this radius — the hysteresis creates the "magnetic" feel */
export const RELEASE_RADIUS = 44

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Determine the snap target at the current cursor position.
 * - Already snapped: held as long as it stays within RELEASE_RADIUS (won't switch even if another port is closer)
 * - Not snapped: attaches to the nearest candidate within SNAP_RADIUS
 * radiusScale: pass 1/zoom when computing in world coordinates to keep the screen-space radius constant
 */
export function resolveSnap(
  cursor: Point,
  candidates: SnapCandidate[],
  current: string | null,
  radiusScale = 1,
): string | null {
  if (current) {
    const held = candidates.find((c) => c.id === current)
    if (held && dist(held.center, cursor) <= RELEASE_RADIUS * radiusScale) return current
  }

  let best: string | null = null
  let bestDist = SNAP_RADIUS * radiusScale
  for (const c of candidates) {
    const d = dist(c.center, cursor)
    if (d <= bestDist) {
      bestDist = d
      best = c.id
    }
  }
  return best
}
