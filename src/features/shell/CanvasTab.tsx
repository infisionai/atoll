import { useState } from 'react'
import { CanvasScreen } from '../canvas/CanvasScreen'
import type { GraphState } from '../canvas/graph/graph-state'
import type { ProviderCatalog } from '../canvas/library/providers'
import { ipc } from '../../ipc/commands'
import { fromGraphDoc } from '../../ipc/graph-doc'
import type { ProviderStatus } from '../canvas/library/providers'
import { useGenerationRunner } from '../../ipc/runner'
import { useTerminalSession } from '../terminal/useTerminalSession'
import { useGraphAutosave } from '../../ipc/useGraphAutosave'
import { useInvoke } from '../../ipc/useInvoke'
import styles from './CanvasTab.module.css'

interface CanvasTabProps {
  workspaceId: string
  providers: ProviderCatalog[]
  /** Provider status for the balance chips */
  balances?: ProviderStatus[]
  onRefreshBalance?: (id: string) => void
  /** Called when autosave completes (to refresh the dashboard's updatedAt) */
  onSaved?: () => void
  onOpenSettings?: () => void
}

/** A single canvas tab — load graph → edit → autosave */
export function CanvasTab({ workspaceId, providers, balances, onRefreshBalance, onSaved, onOpenSettings }: CanvasTabProps) {
  const loaded = useInvoke(() => ipc.loadGraph(workspaceId), [workspaceId])
  const [graph, setGraph] = useState<GraphState | null>(null)
  const runner = useGenerationRunner(workspaceId)
  const terminal = useTerminalSession(workspaceId)

  useGraphAutosave(workspaceId, graph, 800, onSaved)

  if (loaded.loading) {
    return <div className={styles.center}>Loading…</div>
  }
  if (loaded.error) {
    return <div className={`${styles.center} ${styles.error}`}>Failed to load: {loaded.error}</div>
  }

  return (
    <CanvasScreen
      providers={providers}
      initialGraph={fromGraphDoc(loaded.data!)}
      onGraphChange={setGraph}
      onOpenSettings={onOpenSettings}
      runner={runner}
      terminal={terminal}
      workspaceId={workspaceId}
      balances={balances}
      onRefreshBalance={onRefreshBalance}
    />
  )
}
