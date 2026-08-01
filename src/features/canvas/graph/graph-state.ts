/**
 * Graph state reducer — pure functions over the canvas's persistent state (nodes, edges, selection).
 * Transient UI state like pan, zoom, or drag progress does not enter here.
 * This shape is the direct basis for the SQLite storage schema.
 */

export type NodeKind = 'model' | 'asset' | 'edit'

export interface GraphNode {
  id: string
  kind: NodeKind
  /** Per-kind reference — model: catalog model id, asset: 'image'|'video', edit: EditOpId */
  ref: string
  x: number
  y: number
  values: Record<string, unknown>
}

export interface GraphEdge {
  from: string // `<nodeId>:__out`
  to: string // `<nodeId>:<portName>`
}

export interface GraphState {
  nodes: Record<string, GraphNode>
  edges: GraphEdge[]
  selection: ReadonlySet<string>
}

export const emptyGraph: GraphState = {
  nodes: {},
  edges: [],
  selection: new Set(),
}

export type GraphAction =
  | { type: 'node/add'; node: GraphNode }
  | { type: 'node/move'; ids: readonly string[]; dx: number; dy: number }
  | { type: 'node/remove'; ids: readonly string[] }
  | { type: 'node/setValue'; id: string; name: string; value: unknown }
  | { type: 'edge/connect'; from: string; to: string; max: number }
  | { type: 'edge/remove'; from: string; to: string }
  | { type: 'selection/set'; ids: readonly string[] }
  | { type: 'selection/toggle'; id: string }
  | { type: 'selection/clear' }

export function graphReducer(state: GraphState, action: GraphAction): GraphState {
  switch (action.type) {
    case 'node/add':
      return { ...state, nodes: { ...state.nodes, [action.node.id]: action.node } }

    case 'node/move': {
      const nodes = { ...state.nodes }
      for (const id of action.ids) {
        const n = nodes[id]
        if (n) nodes[id] = { ...n, x: n.x + action.dx, y: n.y + action.dy }
      }
      return { ...state, nodes }
    }

    case 'node/remove': {
      const removed = new Set(action.ids)
      const nodes = { ...state.nodes }
      for (const id of action.ids) delete nodes[id]
      // When a node disappears, edges attached to it disappear with it
      const edges = state.edges.filter(
        (e) => !removed.has(e.from.split(':')[0]) && !removed.has(e.to.split(':')[0]),
      )
      const selection = new Set([...state.selection].filter((id) => !removed.has(id)))
      return { nodes, edges, selection }
    }

    case 'node/setValue': {
      const n = state.nodes[action.id]
      if (!n) return state
      return {
        ...state,
        nodes: {
          ...state.nodes,
          [action.id]: { ...n, values: { ...n.values, [action.name]: action.value } },
        },
      }
    }

    case 'edge/connect': {
      // Structural guards: no duplicate sources + the target port's max connection count.
      // Type/direction validation (canConnect) is the caller's responsibility
      const existing = state.edges.filter((e) => e.to === action.to)
      if (existing.length >= action.max) return state
      if (existing.some((e) => e.from === action.from)) return state
      return { ...state, edges: [...state.edges, { from: action.from, to: action.to }] }
    }

    case 'edge/remove':
      return {
        ...state,
        edges: state.edges.filter((e) => !(e.from === action.from && e.to === action.to)),
      }

    case 'selection/set':
      return { ...state, selection: new Set(action.ids) }

    case 'selection/toggle': {
      const selection = new Set(state.selection)
      if (selection.has(action.id)) selection.delete(action.id)
      else selection.add(action.id)
      return { ...state, selection }
    }

    case 'selection/clear':
      return state.selection.size === 0 ? state : { ...state, selection: new Set() }
  }
}

/** Sources of edges coming into a node (portName → from[]) */
export function incomingByPort(state: GraphState, nodeId: string): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const e of state.edges) {
    const [tn, tp] = e.to.split(':')
    if (tn === nodeId) (map[tp] ??= []).push(e.from)
  }
  return map
}

/** Port connectivity map (output port included) */
export function connectionsOf(state: GraphState, nodeId: string): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  for (const e of state.edges) {
    const [fn, fp] = e.from.split(':')
    const [tn, tp] = e.to.split(':')
    if (fn === nodeId) map[fp] = true
    if (tn === nodeId) map[tp] = true
  }
  return map
}
