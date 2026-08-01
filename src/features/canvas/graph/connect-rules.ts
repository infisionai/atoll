/** Port connection rules — pure functions */

/** Kinds of values that flow through ports */
export type PortValueType = 'text' | 'image' | 'video' | 'audio' | '3d'

export interface PortRef {
  direction: 'in' | 'out'
  type: PortValueType
  nodeId: string
}

/** Only identical value types flow — prevents accidents like plugging an image into a prompt (text) */
export function compatible(from: PortValueType, to: PortValueType): boolean {
  return from === to
}

/**
 * Conditions for a connection:
 * 1. Direction — output (out) → input (in) only. No out→out, in→in, or in→out
 * 2. No connection to the node itself
 * 3. Value types compatible
 */
export function canConnect(from: PortRef, to: PortRef): boolean {
  if (from.direction !== 'out' || to.direction !== 'in') return false
  if (from.nodeId === to.nodeId) return false
  return compatible(from.type, to.type)
}
