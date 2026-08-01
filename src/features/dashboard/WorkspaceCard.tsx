import { IconDots } from '../../shared/icons'
import { useEffect, useRef, useState } from 'react'
import type { GraphDoc } from '../../ipc/commands'
import { relativeTime } from './relative-time'
import { WorkspaceThumbnail } from './WorkspaceThumbnail'
import styles from './WorkspaceCard.module.css'

export interface WorkspaceMeta {
  id: string
  name: string
  /** Last modified time (epoch ms) */
  updatedAt: number
}

interface WorkspaceCardProps {
  workspace: WorkspaceMeta
  /** Canvas graph — for the minimap thumbnail (undefined while still loading) */
  doc?: GraphDoc | null
  /** Staggered group-entrance delay (ms) */
  enterDelay?: number
  now: number
  onOpen: () => void
  onRename: (name: string) => void
  onDuplicate: () => void
  onDelete: () => void
}

/** Workspace card — thumbnail + name + relative time + ⋮ menu */
export function WorkspaceCard({
  workspace,
  doc,
  enterDelay,
  now,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: WorkspaceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commitRename = () => {
    const next = inputRef.current?.value.trim()
    if (next && next !== workspace.name) onRename(next)
    setEditing(false)
  }

  return (
    <article
      className={styles.card}
      style={enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}
    >
      <button type="button" className={styles.thumbButton} onClick={onOpen} aria-label={`Open ${workspace.name}`}>
        <WorkspaceThumbnail doc={doc} />
      </button>

      <div className={styles.meta}>
        <div className={styles.nameRow}>
          {editing ? (
            <input
              ref={inputRef}
              className={styles.nameInput}
              defaultValue={workspace.name}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
          ) : (
            <span className={styles.name} onDoubleClick={() => setEditing(true)}>
              {workspace.name}
            </span>
          )}
          <div className={styles.menuWrap}>
            <button
              type="button"
              className={styles.menuButton}
              aria-label="Workspace menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <IconDots width={13} height={13} />
            </button>
            {menuOpen && (
              <div className={styles.menu} role="menu" onPointerLeave={() => setMenuOpen(false)}>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    setMenuOpen(false)
                    setEditing(true)
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    setMenuOpen(false)
                    onDuplicate()
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.menuItem} ${styles.menuDanger}`}
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete()
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        <span className={styles.time}>{relativeTime(workspace.updatedAt, now)}</span>
      </div>
    </article>
  )
}
