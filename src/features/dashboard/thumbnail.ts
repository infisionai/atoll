import type { GraphDoc } from '../../ipc/commands'
import type { NodeKind } from '../canvas/graph/graph-state'

/** Dashboard card minimap — pure computation that normalizes a graph to fit a viewbox */

export interface ThumbNode {
  id: string
  kind: NodeKind
  x: number
  y: number
  w: number
  h: number
  /** Media preview for asset nodes (blob: URLs die after reload, so they are excluded) */
  mediaUrl?: string
}

export interface ThumbEdge {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ThumbLayout {
  nodes: ThumbNode[]
  edges: ThumbEdge[]
}

/** Approximate node size in world coordinates — width from the standard width tokens, height from the average rendered height */
const NODE_SIZE: Record<NodeKind, { w: number; h: number }> = {
  model: { w: 300, h: 380 },
  edit: { w: 240, h: 230 },
  asset: { w: 208, h: 250 },
}

/** Scales the graph to fit within viewW×viewH with a pad margin, center-aligned. Returns null for an empty graph */
export function thumbnailLayout(
  doc: GraphDoc | null | undefined,
  viewW: number,
  viewH: number,
  pad = 6,
): ThumbLayout | null {
  if (!doc || doc.nodes.length === 0) return null

  const boxes = doc.nodes.map((n) => {
    const size = NODE_SIZE[n.kind as NodeKind] ?? NODE_SIZE.asset
    // Asset nodes follow their resized width (__w) — height scales proportionally
    const w = (n.values as { __w?: number } | undefined)?.__w
    const scaled = w ? { w, h: (size.h * w) / size.w } : size
    return { node: n, x: n.x, y: n.y, ...scaled }
  })

  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxX = Math.max(...boxes.map((b) => b.x + b.w))
  const maxY = Math.max(...boxes.map((b) => b.y + b.h))
  const bw = maxX - minX
  const bh = maxY - minY

  const scale = Math.min((viewW - pad * 2) / bw, (viewH - pad * 2) / bh)
  const offsetX = (viewW - bw * scale) / 2 - minX * scale
  const offsetY = (viewH - bh * scale) / 2 - minY * scale

  const nodes: ThumbNode[] = boxes.map((b) => {
    const values = (b.node.values ?? {}) as { media?: { url?: string } }
    const url = b.node.kind === 'asset' ? values.media?.url : undefined
    return {
      id: b.node.id,
      kind: b.node.kind as NodeKind,
      x: b.x * scale + offsetX,
      y: b.y * scale + offsetY,
      w: b.w * scale,
      h: b.h * scale,
      mediaUrl: url && !url.startsWith('blob:') ? url : undefined,
    }
  })

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges: ThumbEdge[] = []
  for (const e of doc.edges) {
    const from = byId.get(e.from.split(':')[0])
    const to = byId.get(e.to.split(':')[0])
    if (!from || !to) continue
    edges.push({
      x1: from.x + from.w,
      y1: from.y + from.h / 2,
      x2: to.x,
      y2: to.y + to.h / 2,
    })
  }

  return { nodes, edges }
}
