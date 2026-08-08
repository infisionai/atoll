import type { AssetKind } from '../AssetNode'
import { buildFormSpec, initialValues } from '../form-spec'
import type { ModelSpec } from '../model-spec'
import type { GraphEdge, GraphNode, GraphState } from './graph-state'

/** Builds an initial graph state from simple definitions — pure functions */

export interface NodeDef {
  id: string
  x: number
  y: number
  /** Generation node — catalog model id */
  model?: string
  asset?: AssetKind
}

export function buildNode(catalog: ModelSpec[], def: NodeDef): GraphNode {
  if (def.model) {
    const spec = catalog.find((m) => m.id === def.model)
    if (!spec) throw new Error(`Model not in catalog: ${def.model}`)
    return {
      id: def.id,
      kind: 'model',
      ref: def.model,
      x: def.x,
      y: def.y,
      values: initialValues(buildFormSpec(spec)),
    }
  }
  if (def.asset) {
    return { id: def.id, kind: 'asset', ref: def.asset, x: def.x, y: def.y, values: {} }
  }
  throw new Error(`Node def has no kind: ${def.id}`)
}

export function buildGraph(
  catalog: ModelSpec[],
  defs: NodeDef[],
  edges: GraphEdge[] = [],
): GraphState {
  return {
    nodes: Object.fromEntries(defs.map((d) => [d.id, buildNode(catalog, d)])),
    edges,
    selection: new Set(),
  }
}
