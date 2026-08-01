import { useEffect, useRef } from 'react'
import type { GraphState } from '../features/canvas/graph/graph-state'
import { ipc } from './commands'
import { toGraphDoc } from './graph-doc'

/**
 * Graph autosave — saves once things have been quiet for delayMs after a change (debounce).
 * The first state right after opening a workspace (the loaded snapshot) is not saved.
 */
export function useGraphAutosave(
  workspaceId: string | null,
  graph: GraphState | null,
  delayMs = 800,
  onSaved?: () => void,
): void {
  const skipFor = useRef<string | null>(null)

  useEffect(() => {
    skipFor.current = workspaceId
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId || !graph) return
    if (skipFor.current === workspaceId) {
      skipFor.current = null
      return
    }
    const t = window.setTimeout(() => {
      void ipc.saveGraph(workspaceId, toGraphDoc(graph)).then(() => onSaved?.())
    }, delayMs)
    return () => window.clearTimeout(t)
  }, [workspaceId, graph, delayMs, onSaved])
}
