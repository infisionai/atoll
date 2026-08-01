import styles from './StatusBadge.module.css'

export type NodeStatus = 'idle' | 'running' | 'done' | 'error'

const LABELS: Record<NodeStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  done: 'Done',
  error: 'Error',
}

export function StatusBadge({ status }: { status: NodeStatus }) {
  return (
    <span className={styles.badge} data-status={status}>
      <span className={styles.dot} />
      {LABELS[status]}
    </span>
  )
}
