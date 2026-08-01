/** Edge (connection line) geometry — pure functions */

export interface Point {
  x: number
  y: number
}

/**
 * Horizontal bezier path from an output port (right) to an input port (left).
 * Control points are pushed horizontally so the line leaves/arrives at ports horizontally.
 */
export function edgePath(from: Point, to: Point): string {
  const reach = bezierReach(from, to)
  return `M ${from.x} ${from.y} C ${from.x + reach} ${from.y}, ${to.x - reach} ${to.y}, ${to.x} ${to.y}`
}

/** Horizontal control-point distance — at least 40px when close, half the distance when far */
export function bezierReach(from: Point, to: Point): number {
  return Math.max(40, Math.abs(to.x - from.x) / 2)
}

/** Midpoint of the edge curve (t=0.5) — where the delete button sits */
export function edgeMidpoint(from: Point, to: Point): Point {
  const reach = bezierReach(from, to)
  const c1 = { x: from.x + reach, y: from.y }
  const c2 = { x: to.x - reach, y: to.y }
  // Cubic bezier B(0.5) = (P0 + 3·P1 + 3·P2 + P3) / 8
  return {
    x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8,
    y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8,
  }
}
