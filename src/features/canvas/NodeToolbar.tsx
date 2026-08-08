import {
  IconCheck,
  IconClipboard,
  IconDuplicate,
  IconFileExport,
  IconPlay,
  IconSpinnerArc,
  IconTrash,
} from '../../shared/icons'
import type { ToolbarAction } from './graph/toolbar-actions'
import styles from './NodeToolbar.module.css'

interface NodeToolbarProps {
  /** Actions to expose — only those runnable on the selected nodes (graph/toolbar-actions) */
  actions: ToolbarAction[]
  running?: boolean
  /** Copy the agent reference text to the clipboard (Cmd-C) */
  onCopy?: () => void
  /** Just copied — briefly switches to a check icon */
  copied?: boolean
  onDuplicate?: () => void
  onRun?: () => void
  /** Export results to files */
  onExport?: () => void
  onDelete?: () => void
}

/** Action toolbar floating above the selected nodes — shows only actions runnable per node */
export function NodeToolbar({
  actions,
  running,
  onCopy,
  copied,
  onDuplicate,
  onRun,
  onExport,
  onDelete,
}: NodeToolbarProps) {
  const has = (a: ToolbarAction) => actions.includes(a)
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Node actions">
      {has('copy') && (
        <button
          type="button"
          className={styles.button}
          title="Copy for agent (⌘C · ⇧⌘C for full detail)"
          data-active={copied || undefined}
          onClick={onCopy}
        >
          {copied ? <IconCheck className={styles.icon} /> : <IconClipboard className={styles.icon} />}
        </button>
      )}

      {has('duplicate') && (
        <button type="button" className={styles.button} title="Duplicate (⌘D)" onClick={onDuplicate}>
          <IconDuplicate className={styles.icon} />
        </button>
      )}

      {has('run') && (
        <button
          type="button"
          className={`${styles.button} ${styles.run}`}
          title="Run (⌘↵)"
          disabled={running}
          onClick={onRun}
        >
          {running ? (
            <IconSpinnerArc className={`${styles.icon} ${styles.spinner}`} />
          ) : (
            <IconPlay className={styles.icon} />
          )}
        </button>
      )}

      {has('export') && (
        <button type="button" className={styles.button} title="Export" onClick={onExport}>
          <IconFileExport className={styles.icon} />
        </button>
      )}

      {has('delete') && (
        <button
          type="button"
          className={`${styles.button} ${styles.delete}`}
          title="Delete (⌫)"
          onClick={onDelete}
        >
          <IconTrash className={styles.icon} />
        </button>
      )}
    </div>
  )
}
