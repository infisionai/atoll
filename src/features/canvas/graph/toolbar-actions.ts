import type { GraphState } from './graph-state'
import type { ModelSpec } from '../model-spec'

/** Actions exposed in the selection toolbar — only those runnable per node kind */
export type ToolbarAction = 'copy' | 'duplicate' | 'run' | 'export' | 'delete'

export interface ToolbarSpec {
  /** Actions to show (fixed display order: copy → duplicate → run → export → delete) */
  actions: ToolbarAction[]
}

/**
 * Union rules over the selected nodes:
 * - Agent copy, duplicate, and delete are always available when there's a selection
 * - Run when at least one generation (model) node is present (applies only to those nodes)
 * - Export when at least one asset node holds media
 */
export function toolbarSpec(state: GraphState, catalog: ModelSpec[]): ToolbarSpec {
  const selected = [...state.selection]
    .map((id) => state.nodes[id])
    .filter((n) => n !== undefined)
  if (selected.length === 0) return { actions: [] }

  const hasModel = selected.some(
    (n) => n.kind === 'model' && catalog.some((m) => m.id === n.ref),
  )
  const hasExportable = selected.some(
    (n) => n.kind === 'asset' && !!(n.values.media as { url?: string } | undefined)?.url,
  )

  const actions: ToolbarAction[] = ['copy', 'duplicate']
  if (hasModel) actions.push('run')
  if (hasExportable) actions.push('export')
  actions.push('delete')

  return { actions }
}
