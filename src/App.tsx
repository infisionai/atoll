import { useCallback, useMemo, useReducer, useState } from 'react'
import { CanvasTab } from './features/shell/CanvasTab'
import { TabBar } from './features/shell/TabBar'
import { HOME_TAB, initialTabs, tabReducer } from './features/shell/tab-state'
import { Dashboard } from './features/dashboard/Dashboard'
import { ProviderSettings } from './features/providers/ProviderSettings'
import { buildProviders } from './features/canvas/library/providers'
import { ipc } from './ipc/commands'
import { useInvoke } from './ipc/useInvoke'
import { useProviders } from './ipc/useProviders'
import styles from './App.module.css'

export function App() {
  const [tabState, dispatchTabs] = useReducer(tabReducer, initialTabs)
  const [homeView, setHomeView] = useState<'dashboard' | 'settings'>('dashboard')
  const workspaces = useInvoke(() => ipc.listWorkspaces(), [])
  const prov = useProviders()

  // Live catalog — fetches connected providers in parallel and merges (cache-first). Disconnected means an empty catalog (locked state)
  const connectedIds = prov.statuses
    .filter((s) => s.state === 'connected')
    .map((s) => s.id)
    .join(',')
  const catalog = useInvoke(
    async () => {
      const ids = connectedIds ? connectedIds.split(',') : []
      const lists = await Promise.all(
        ids.map((id) =>
          ipc.getCatalog(id).then(
            // Stamp each model with its owning provider — for run/estimate routing
            (models) => models.map((m) => ({ ...m, provider: m.provider ?? id })),
            () => [],
          ),
        ),
      )
      return lists.flat()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectedIds],
  )

  const names = useMemo(
    () => Object.fromEntries((workspaces.data ?? []).map((w) => [w.id, w.name])),
    [workspaces.data],
  )

  // Graphs for the card minimap thumbnails — re-read on save (updatedAt change)
  const graphKey = (workspaces.data ?? []).map((w) => `${w.id}:${w.updatedAt}`).join(',')
  const graphs = useInvoke(async () => {
    const list = workspaces.data ?? []
    const docs = await Promise.all(list.map((w) => ipc.loadGraph(w.id).catch(() => null)))
    return Object.fromEntries(list.map((w, i) => [w.id, docs[i]]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey])

  const providers = useMemo(
    () =>
      buildProviders(catalog.data ?? [])
        // ElevenLabs is native and its catalog is meaningful only after the API key connects.
        // Keep the existing locked tabs for the three MCP providers unchanged.
        .filter(
          (p) =>
            p.id !== 'elevenlabs' ||
            prov.statuses.find((s) => s.id === p.id)?.state === 'connected',
        )
        .map((p) => ({
          ...p,
          connected: prov.statuses.find((s) => s.id === p.id)?.state === 'connected',
        })),
    [catalog.data, prov.statuses],
  )

  const openWorkspace = (id: string) => dispatchTabs({ type: 'tab/open', id })

  const createAndOpen = async () => {
    const meta = await ipc.createWorkspace('Untitled Space')
    workspaces.reload()
    openWorkspace(meta.id)
  }

  const reload = workspaces.reload
  const onSaved = useCallback(() => reload(), [reload])

  const openSettings = useCallback(() => {
    setHomeView('settings')
    dispatchTabs({ type: 'tab/activate', id: HOME_TAB })
  }, [])

  return (
    <div className={styles.shell}>
      <TabBar
        state={tabState}
        names={names}
        onActivate={(id) => dispatchTabs({ type: 'tab/activate', id })}
        onClose={(id) => dispatchTabs({ type: 'tab/close', id })}
        onNew={() => void createAndOpen()}
      />

      <main className={styles.main}>
        <div className={styles.pane} hidden={tabState.active !== HOME_TAB}>
          {homeView === 'settings' ? (
            <ProviderSettings
              providers={prov.statuses}
              onConnect={(id) => prov.connect(id)}
              onSetApiKey={(id, apiKey) => prov.setApiKey(id, apiKey)}
              onDisconnect={(id) => prov.disconnect(id)}
              onRefreshBalance={(id) => prov.refreshBalance(id)}
              onBuyCredits={(id) => {
                const url = prov.statuses.find((s) => s.id === id)?.pricingUrl
                if (url) window.open(url, '_blank')
              }}
              onBack={() => setHomeView('dashboard')}
            />
          ) : (
            <Dashboard
              workspaces={workspaces.data ?? []}
              graphs={graphs.data ?? undefined}
              now={Date.now()}
              onOpen={openWorkspace}
              onCreate={() => void createAndOpen()}
              onOpenSettings={openSettings}
              onRename={(id, name) => {
                void ipc.renameWorkspace(id, name).then(reload)
              }}
              onDuplicate={(id) => {
                void ipc.duplicateWorkspace(id).then(reload)
              }}
              onDelete={(id) => {
                void ipc.deleteWorkspace(id).then(() => {
                  dispatchTabs({ type: 'tab/close', id })
                  reload()
                })
              }}
            />
          )}
        </div>

        {/* All open canvases stay mounted — editing state survives tab switches */}
        {tabState.tabs.map((id) => (
          <div key={id} className={styles.pane} hidden={tabState.active !== id}>
            <CanvasTab
              workspaceId={id}
              providers={providers}
              balances={prov.statuses}
              onRefreshBalance={(id) => prov.refreshBalance(id)}
              onSaved={onSaved}
              onOpenSettings={openSettings}
            />
          </div>
        ))}
      </main>
    </div>
  )
}
