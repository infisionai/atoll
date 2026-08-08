import { useEffect, useRef, useState } from 'react'
import { BusyButton } from '../../shared/BusyButton'
import styles from './NewSpaceDialog.module.css'

interface NewSpaceDialogProps {
  /** Confirm — resolves when the workspace is created (spinner on the confirm button meanwhile) */
  onConfirm: (name: string) => Promise<unknown> | void
  onCancel: () => void
}

const DEFAULT_NAME = 'Untitled Space'

/** Name prompt shown before creating a space — Enter confirms, Escape cancels */
export function NewSpaceDialog({ onConfirm, onCancel }: NewSpaceDialogProps) {
  const [name, setName] = useState(DEFAULT_NAME)
  const inputRef = useRef<HTMLInputElement>(null)

  // Pre-selected default — typing replaces it, Enter accepts it as-is
  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const confirm = () => onConfirm(name.trim() || DEFAULT_NAME)

  return (
    <div className={styles.backdrop} onPointerDown={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-space-title"
        className={styles.panel}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
      >
        <h2 id="new-space-title" className={styles.title}>
          New space
        </h2>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault()
            void confirm()
          }}
        >
          <input
            ref={inputRef}
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Space name"
            spellCheck={false}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onCancel}>
              Cancel
            </button>
            <BusyButton className={styles.confirm} onClick={confirm}>
              Create
            </BusyButton>
          </div>
        </form>
      </div>
    </div>
  )
}
