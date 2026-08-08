import type { GraphState, NodeKind } from '../features/canvas/graph/graph-state'
import type { GraphDoc } from './commands'

/** GraphState ↔ persisted document (GraphDoc) conversion — pure functions. selection is not persisted */

const KNOWN_KINDS: NodeKind[] = ['model', 'asset']

export function toGraphDoc(state: GraphState): GraphDoc {
  return { nodes: Object.values(state.nodes), edges: state.edges }
}

/**
 * Nodes of a kind the app no longer knows (e.g. the removed 'edit' ops in old saves)
 * are dropped on load, along with any edge touching them.
 */
export function fromGraphDoc(doc: GraphDoc): GraphState {
  const nodes = doc.nodes.filter((n) => KNOWN_KINDS.includes(n.kind))
  const ids = new Set(nodes.map((n) => n.id))
  return {
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    edges: doc.edges.filter(
      (e) => ids.has(e.from.split(':')[0]) && ids.has(e.to.split(':')[0]),
    ),
    selection: new Set(),
  }
}
