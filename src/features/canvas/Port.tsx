import type { PointerEvent } from 'react'
import styles from './Port.module.css'

export interface PortConfig {
  /** Port identifier for DOM lookup — `<nodeId>:<field>` or `<nodeId>:__out` */
  id?: string
  connected?: boolean
  /** Highlight as a viable target during a drag */
  candidate?: boolean
  /** Not connectable during a drag — dimmed */
  dimmed?: boolean
  /** Connection count — 2 or more shows a badge next to the port (multi input) */
  count?: number
  onPointerDown?: (e: PointerEvent) => void
  onPointerUp?: () => void
}

interface PortProps extends PortConfig {
  direction: 'in' | 'out'
  /** Placement class — the parent (card/field) decides the position */
  className?: string
}

/** Node connection point. All states (hover/focus/connected/candidate) use token-based design */
export function Port({
  id,
  direction,
  connected,
  candidate,
  dimmed,
  count,
  className,
  onPointerDown,
  onPointerUp,
}: PortProps) {
  return (
    <button
      type="button"
      className={`${styles.port} ${className ?? ''}`}
      data-port={id}
      data-direction={direction}
      data-connected={connected}
      data-candidate={candidate}
      data-dimmed={dimmed}
      data-multi={count !== undefined && count > 1}
      aria-label={direction === 'in' ? 'Input port' : 'Output port'}
      onPointerDown={(e) => {
        e.preventDefault()
        onPointerDown?.(e)
      }}
      onPointerUp={onPointerUp}
    >
      {count !== undefined && count > 1 && <span className={styles.count}>{count}</span>}
    </button>
  )
}
