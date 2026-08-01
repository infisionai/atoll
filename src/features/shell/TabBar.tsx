import { IconHome } from '../../shared/icons'
import { HOME_TAB, type TabState } from './tab-state'
import styles from './TabBar.module.css'

interface TabBarProps {
  state: TabState
  /** Workspace id → display name */
  names: Record<string, string>
  onActivate: (id: string) => void
  onClose: (id: string) => void
  /** + button — creates and opens a new space */
  onNew: () => void
}

/** Browser-style tab bar — the Home tab is pinned, canvas tabs are closable */
export function TabBar({ state, names, onActivate, onClose, onNew }: TabBarProps) {
  return (
    <div className={styles.bar} role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={state.active === HOME_TAB}
        className={styles.tab}
        data-active={state.active === HOME_TAB}
        onClick={() => onActivate(HOME_TAB)}
      >
        <IconHome className={styles.homeIcon} />
        Home
      </button>

      {state.tabs.map((id) => (
        <div
          key={id}
          role="tab"
          aria-selected={state.active === id}
          className={styles.tab}
          data-active={state.active === id}
          onClick={() => onActivate(id)}
          onPointerUp={(e) => {
            // Middle-click to close
            if (e.button === 1) onClose(id)
          }}
        >
          <span className={styles.name}>{names[id] ?? id}</span>
          <button
            type="button"
            className={styles.close}
            aria-label={`Close ${names[id] ?? id}`}
            onClick={(e) => {
              e.stopPropagation()
              onClose(id)
            }}
          >
            ×
          </button>
        </div>
      ))}

      <button type="button" className={styles.newTab} aria-label="New space" onClick={onNew}>
        +
      </button>
    </div>
  )
}
