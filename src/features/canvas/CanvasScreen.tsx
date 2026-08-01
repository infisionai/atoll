import { useEffect, useMemo, useRef, useState } from 'react'
import { GraphCanvas, type GraphCanvasHandle } from './graph/GraphCanvas'
import type { GraphState } from './graph/graph-state'
import { BalanceChips } from '../providers/BalanceChips'
import { LibrarySidebar } from './library/LibrarySidebar'
import { flattenCatalog, type ProviderCatalog, type ProviderStatus } from './library/providers'
import { TerminalPanel, type TerminalHandle } from '../terminal/TerminalPanel'
import type { TerminalSession } from '../terminal/useTerminalSession'
import type { GenerationRunner } from '../../ipc/runner'
import { IconTerminal } from '../../shared/icons'
import styles from './CanvasScreen.module.css'

interface CanvasScreenProps {
  providers: ProviderCatalog[]
  /** Workspace id for routing local MCP commands */
  workspaceId?: string
  initialGraph?: GraphState
  onGraphChange?: (state: GraphState) => void
  /** "Go connect" from the unconnected-provider lock panel */
  onOpenSettings?: () => void
  runner?: GenerationRunner
  /** Agent terminal session — the terminal toggle hides without it */
  terminal?: TerminalSession
  /** Balance chips — top right of the canvas (kept inside the canvas area to avoid overlapping the terminal panel) */
  balances?: ProviderStatus[]
  onRefreshBalance?: (id: string) => void
}

/** Canvas screen — library sidebar + graph canvas + agent terminal on the right */
export function CanvasScreen({ providers, workspaceId, initialGraph, onGraphChange, onOpenSettings, runner, terminal, balances, onRefreshBalance }: CanvasScreenProps) {
  const canvasRef = useRef<GraphCanvasHandle>(null)
  const catalog = useMemo(() => flattenCatalog(providers), [providers])

  // Terminal panel — the session survives closing (useTerminalSession owns the session)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalWidth, setTerminalWidth] = useState(420)
  const terminalRef = useRef<TerminalHandle>(null)

  // PTY output → Xterm (while the panel is open)
  useEffect(() => {
    if (!terminalOpen || !terminal) return
    return terminal.subscribe((d) => terminalRef.current?.write(d))
  }, [terminalOpen, terminal])

  return (
    <div className={styles.screen}>
      <LibrarySidebar
        providers={providers}
        onAdd={(def) => canvasRef.current?.addNode(def)}
        onOpenSettings={onOpenSettings}
      />
      <div className={styles.canvasArea}>
        <GraphCanvas
          ref={canvasRef}
          catalog={catalog}
          initialGraph={initialGraph}
          onGraphChange={onGraphChange}
          runner={runner}
          workspaceId={workspaceId}
        />
        {balances && balances.length > 0 && (
          <div className={styles.chipsOverlay}>
            <BalanceChips
              providers={balances}
              onRefresh={(id) => onRefreshBalance?.(id)}
              onOpenSettings={onOpenSettings ?? (() => {})}
            />
          </div>
        )}
        {!terminalOpen && terminal && (
          <button
            type="button"
            className={styles.terminalToggle}
            title="Open agent terminal"
            onClick={() => setTerminalOpen(true)}
          >
            <IconTerminal width={15} height={15} />
          </button>
        )}
      </div>
      {terminalOpen && terminal && (
        <TerminalPanel
          ref={terminalRef}
          status={terminal.status}
          agent={terminal.agent}
          onStartAgent={(a) => terminal.start(a)}
          width={terminalWidth}
          onWidthChange={setTerminalWidth}
          onInput={(d) => terminal.write(d)}
          onResize={(cols, rows) => terminal.resize(cols, rows)}
          onStop={() => terminal.stop()}
          onClose={() => setTerminalOpen(false)}
        />
      )}
    </div>
  )
}
