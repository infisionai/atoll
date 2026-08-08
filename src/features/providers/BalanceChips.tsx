import { useState } from 'react'
import { Spinner } from '../../shared/Spinner'
import type { ProviderStatus } from '../canvas/library/providers'
import styles from './BalanceChips.module.css'

interface BalanceChipsProps {
  providers: ProviderStatus[]
  /** Click = refresh balance */
  onRefresh: (id: string) => Promise<unknown> | void
  /** Clicking an expired chip = go to settings */
  onOpenSettings: (id: string) => void
}

/**
 * Balance chips at the canvas top-right — always-visible ⚡ balance per connected provider.
 * Re-fetched on every job-completion event so deductions are reflected immediately.
 */
function BalanceChip({
  provider: p,
  onRefresh,
}: {
  provider: ProviderStatus
  onRefresh: (id: string) => Promise<unknown> | void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className={styles.chip}
      disabled={busy}
      title={`Refresh ${p.name} balance`}
      onClick={() => {
        const result = onRefresh(p.id)
        if (result instanceof Promise) {
          setBusy(true)
          void result.finally(() => setBusy(false))
        }
      }}
    >
      <span className={styles.dot} aria-hidden />
      {p.name}
      <span className={styles.amount}>
        {busy ? (
          <Spinner size={11} />
        ) : (
          <>⚡ {p.balance?.toFixed(2) ?? '—'}{p.balanceUnit ? ` ${p.balanceUnit}` : ''}</>
        )}
      </span>
    </button>
  )
}

export function BalanceChips({ providers, onRefresh, onOpenSettings }: BalanceChipsProps) {
  const visible = providers.filter((p) => p.state === 'connected' || p.state === 'expired')
  if (visible.length === 0) return null

  return (
    <div className={styles.chips}>
      {visible.map((p) =>
        p.state === 'expired' ? (
          <button
            key={p.id}
            type="button"
            className={`${styles.chip} ${styles.expired}`}
            title={`${p.name} session expired — reconnect`}
            onClick={() => onOpenSettings(p.id)}
          >
            ⚠ {p.name}
          </button>
        ) : (
          <BalanceChip key={p.id} provider={p} onRefresh={onRefresh} />
        ),
      )}
    </div>
  )
}
