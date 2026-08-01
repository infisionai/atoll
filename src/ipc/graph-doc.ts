import type { GraphState } from '../features/canvas/graph/graph-state'
import type { GraphDoc } from './commands'

/** GraphState ↔ persisted document (GraphDoc) conversion — pure functions. selection is not persisted */

export function toGraphDoc(state: GraphState): GraphDoc {
  return { nodes: Object.values(state.nodes), edges: state.edges }
}

export function fromGraphDoc(doc: GraphDoc): GraphState {
  return {
    nodes: Object.fromEntries(doc.nodes.map((n) => [n.id, n])),
    edges: doc.edges,
    selection: new Set(),
  }
}
