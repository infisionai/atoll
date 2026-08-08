import { BusyButton } from '../../shared/BusyButton'
import { useState } from 'react'
import type { ProviderStatus } from '../canvas/library/providers'
import { usesApiKey } from './auth-kind'
import { displayProviderError } from './provider-error'
import styles from './ProviderSettings.module.css'

interface ProviderSettingsProps {
  providers: ProviderStatus[]
  /** Per-provider connect/key-validation failure messages (useProviders.connectErrors) */
  connectErrors?: Record<string, string>
  onConnect: (id: string) => Promise<unknown> | void
  onSetApiKey: (id: string, apiKey: string) => Promise<unknown> | void
  onDisconnect: (id: string) => Promise<unknown> | void
  onRefreshBalance: (id: string) => Promise<unknown> | void
  /** Buy credits — opens the provider's web checkout page in an external browser (no in-app payments) */
  onBuyCredits: (id: string) => void
}

/** Settings > Provider connections — opens in its own shell tab */
export function ProviderSettings({
  providers,
  connectErrors,
  onConnect,
  onSetApiKey,
  onDisconnect,
  onRefreshBalance,
  onBuyCredits,
}: ProviderSettingsProps) {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>Provider Connections</h1>
        <p className={styles.subtitle}>Connect the MCP providers you want to generate with.</p>
      </header>

      <div className={styles.list}>
        {providers.map((p) => (
          <article key={p.id} className={styles.card} data-state={p.state}>
            <div className={styles.cardHead}>
              <span className={styles.stateDot} data-state={p.state} aria-hidden />
              <span className={styles.name}>{p.name}</span>
              <span className={styles.stateLabel} data-state={p.state}>
                {p.state === 'connected' && `Connected${p.account ? ` · ${p.account}` : ''}`}
                {p.state === 'connecting' && 'Connecting…'}
                {p.state === 'disconnected' && 'Not connected'}
                {p.state === 'expired' && 'Session expired — sign in again'}
              </span>
            </div>

            {p.state === 'connected' && (
              <div className={styles.balanceRow}>
                <span className={styles.balance}>
                  ⚡ {p.balance?.toFixed(2) ?? '—'}{p.balanceUnit ? ` ${p.balanceUnit}` : ''}
                </span>
                {p.notice && <span className={styles.notice}>{p.notice}</span>}
                <BusyButton className={styles.action} onClick={() => onRefreshBalance(p.id)}>
                  Refresh balance
                </BusyButton>
                <button type="button" className={styles.action} onClick={() => onBuyCredits(p.id)}>
                  Buy credits ↗
                </button>
                <BusyButton
                  className={`${styles.action} ${styles.danger}`}
                  onClick={() => onDisconnect(p.id)}
                >
                  Disconnect
                </BusyButton>
              </div>
            )}

            {p.state === 'disconnected' && (
              <div className={styles.balanceRow}>
                {p.description && <span className={styles.description}>{p.description}</span>}
                {usesApiKey(p) ? (
                  <>
                    <input
                      className={styles.keyInput}
                      type="password"
                      autoComplete="current-password"
                      placeholder="Paste API key"
                      aria-label={`${p.name} API key`}
                      value={apiKeys[p.id] ?? ''}
                      onChange={(event) =>
                        setApiKeys((keys) => ({ ...keys, [p.id]: event.target.value }))
                      }
                    />
                    <BusyButton
                      className={`${styles.action} ${styles.primary}`}
                      disabled={!apiKeys[p.id]?.trim()}
                      onClick={() =>
                        Promise.resolve(onSetApiKey(p.id, apiKeys[p.id] ?? '')).then(
                          () => setApiKeys((keys) => ({ ...keys, [p.id]: '' })),
                          // Validation failure keeps the typed key; the reason renders below
                          () => {},
                        )
                      }
                    >
                      Connect
                    </BusyButton>
                    <a
                      className={styles.keyHelp}
                      href={p.pricingUrl ?? 'https://elevenlabs.io/app/settings/api-keys'}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Get an API key ↗
                    </a>
                  </>
                ) : (
                  <BusyButton
                    className={`${styles.action} ${styles.primary}`}
                    onClick={() => onConnect(p.id)}
                  >
                    Connect
                  </BusyButton>
                )}
                {displayProviderError(connectErrors?.[p.id]) && (
                  <span className={styles.notice} role="alert">
                    {displayProviderError(connectErrors?.[p.id])}
                  </span>
                )}
              </div>
            )}

            {p.state === 'connecting' && (
              <div className={styles.balanceRow}>
                <span className={styles.description}>Finish signing in from your browser…</span>
              </div>
            )}

            {p.state === 'expired' && (
              <div className={styles.balanceRow}>
                <span className={styles.description}>Token refresh failed.</span>
                <BusyButton
                  className={`${styles.action} ${styles.primary}`}
                  onClick={() => onConnect(p.id)}
                >
                  Reconnect
                </BusyButton>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
