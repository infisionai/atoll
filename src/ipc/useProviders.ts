import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProviderStatus } from '../features/canvas/library/providers'
import { ipc, isTauri } from './commands'

/** Planned providers the backend does not know yet — display-only placeholders (currently none) */
const PLACEHOLDERS: ProviderStatus[] = []

/**
 * Provider connection status hook — shared by the settings screen, balance chips, and library tab.
 * Subscribes to Tauri events (provider/status-changed, provider/balance-changed) for immediate updates.
 */
export function useProviders() {
  const [statuses, setStatuses] = useState<ProviderStatus[]>(PLACEHOLDERS)
  const [error, setError] = useState<string | null>(null)

  const merge = useCallback((incoming: ProviderStatus[]) => {
    setStatuses((prev) => {
      // Overlay onto the previous state — a single-item status event (provider/status-changed)
      // must not wipe out the other providers
      const map = new Map(prev.map((p) => [p.id, p]))
      for (const p of incoming) map.set(p.id, p)
      for (const ph of PLACEHOLDERS) {
        if (!map.has(ph.id)) map.set(ph.id, ph)
      }
      // Keep the provider cards stable while allowing native providers to join the registry.
      const order = ['higgsfield', 'magnific', 'kling', 'elevenlabs']
      return [...map.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    })
  }, [])

  const reload = useCallback(() => {
    ipc.listProviders().then(merge, (e) => setError(String(e)))
  }, [merge])

  useEffect(() => {
    reload()
    if (!isTauri()) return
    // Subscribe to status changes pushed by Rust
    const unlisteners: Array<() => void> = []
    void import('@tauri-apps/api/event').then(({ listen }) => {
      for (const event of ['provider/status-changed', 'provider/balance-changed']) {
        void listen<ProviderStatus>(event, (e) => merge([e.payload])).then((un) =>
          unlisteners.push(un),
        )
      }
    })
    return () => unlisteners.forEach((un) => un())
  }, [merge, reload])

  const patch = (id: string, p: Partial<ProviderStatus>) =>
    setStatuses((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)))

  // If connected but the balance is missing, fetch it automatically once (after that, only on job completion or manual refresh)
  const balanceRequested = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const p of statuses) {
      if (p.state === 'connected' && p.balance == null && !balanceRequested.current.has(p.id)) {
        balanceRequested.current.add(p.id)
        void ipc.refreshBalance(p.id).then(
          (balance) => patch(p.id, { balance, notice: undefined }),
          // Surface the failure reason on the card — kept in requested to prevent an auto-retry loop (manual refresh still works)
          (e) => patch(p.id, { notice: balanceNotice(e) }),
        )
      }
    }
  }, [statuses])

  const connect = useCallback(
    async (id: string) => {
      setError(null)
      patch(id, { state: 'connecting' })
      try {
        merge([await ipc.connectProvider(id)])
      } catch (e) {
        patch(id, { state: 'disconnected' })
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [merge],
  )

  const setApiKey = useCallback(
    async (id: string, apiKey: string) => {
      setError(null)
      patch(id, { state: 'connecting' })
      try {
        merge([await ipc.setProviderApiKey(id, apiKey)])
      } catch (e) {
        patch(id, { state: 'disconnected' })
        setError(e instanceof Error ? e.message : String(e))
        throw e
      }
    },
    [merge],
  )

  const disconnect = useCallback(
    async (id: string) => {
      await ipc.disconnectProvider(id)
      patch(id, { state: 'disconnected', account: undefined, balance: undefined })
      reload()
    },
    [reload],
  )

  const refreshBalance = useCallback(
    async (id: string) => {
      try {
        const balance = await ipc.refreshBalance(id)
        patch(id, { balance, notice: undefined })
      } catch (e) {
        patch(id, { notice: balanceNotice(e) })
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [],
  )

  return { statuses, error, reload, connect, setApiKey, disconnect, refreshBalance }
}

/** Balance lookup failure → notice text for the card. Known reasons are spelled out in Korean */
function balanceNotice(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/premium account/i.test(msg)) {
    return 'Magnific MCP is available on premium plans only — upgrade your plan to use it'
  }
  return `Balance lookup failed: ${msg}`
}
