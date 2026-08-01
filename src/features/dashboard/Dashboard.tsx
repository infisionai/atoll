import { IconGear } from '../../shared/icons'
import { useState } from 'react'
import type { GraphDoc } from '../../ipc/commands'
import { WorkspaceCard, type WorkspaceMeta } from './WorkspaceCard'
import styles from './Dashboard.module.css'

interface DashboardProps {
  workspaces: WorkspaceMeta[]
  /** Per-workspace graphs — for the card minimap thumbnails */
  graphs?: Record<string, GraphDoc | null>
  /** Reference time for relative-time calculation (epoch ms) — supplied by the caller */
  now: number
  onOpen: (id: string) => void
  onCreate: () => void
  /** Navigate to the settings (provider connections) screen */
  onOpenSettings?: () => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

/**
 * Workspace dashboard (Home tab) — where canvases are created, found, and managed.
 */
export function Dashboard({
  workspaces,
  graphs,
  now,
  onOpen,
  onCreate,
  onOpenSettings,
  onRename,
  onDuplicate,
  onDelete,
}: DashboardProps) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? workspaces.filter((w) => w.name.toLowerCase().includes(query.trim().toLowerCase()))
    : workspaces

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>Workspaces</h1>
        <p className={styles.subtitle}>Create and manage node-based generation workflows.</p>
      </header>

      <div className={styles.toolbar}>
        <nav className={styles.tabs} aria-label="Workspace categories">
          <button type="button" className={styles.tab} data-active="true">
            My spaces
          </button>
          <button type="button" className={styles.tab} disabled title="Coming soon">
            Templates
          </button>
        </nav>

        <div className={styles.actions}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className={styles.create} onClick={onCreate}>
            + New space
          </button>
          {onOpenSettings && (
            <button
              type="button"
              className={styles.settings}
              title="Settings — Provider connections"
              aria-label="Settings"
              onClick={onOpenSettings}
            >
              <IconGear width={14} height={14} />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          {workspaces.length === 0 ? (
            <>
              <p className={styles.emptyTitle}>No spaces yet</p>
              <p className={styles.emptyHint}>Create your first canvas to start a generation flow.</p>
              <button type="button" className={styles.create} onClick={onCreate}>
                + New space
              </button>
            </>
          ) : (
            <p className={styles.emptyHint}>No spaces match "{query}".</p>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((w, i) => (
            <WorkspaceCard
              doc={graphs?.[w.id]}
              enterDelay={Math.min(i, 8) * 40}
              key={w.id}
              workspace={w}
              now={now}
              onOpen={() => onOpen(w.id)}
              onRename={(name) => onRename(w.id, name)}
              onDuplicate={() => onDuplicate(w.id)}
              onDelete={() => onDelete(w.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
