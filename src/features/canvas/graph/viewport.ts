import type { Point } from './edge-path'

/** Canvas viewport transforms — pure functions */

export interface Viewport {
  /** Screen-space offset (px) */
  x: number
  y: number
  scale: number
}

export const MIN_SCALE = 0.25
export const MAX_SCALE = 2.5

export const IDENTITY: Viewport = { x: 0, y: 0, scale: 1 }

export function screenToWorld(vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale }
}

export function worldToScreen(vp: Viewport, p: Point): Point {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y }
}

export function pan(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy }
}

/**
 * Zoom while keeping the anchor (screen coordinates) fixed —
 * the world point under the cursor stays under the cursor after zooming.
 */
export function zoomAt(vp: Viewport, anchor: Point, factor: number): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, vp.scale * factor))
  if (scale === vp.scale) return vp
  const world = screenToWorld(vp, anchor)
  return { scale, x: anchor.x - world.x * scale, y: anchor.y - world.y * scale }
}
