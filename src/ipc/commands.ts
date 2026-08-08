/**
 * Tauri IPC commands — names and payload types are defined here and nowhere else (by convention).
 * Maps 1:1 to `src-tauri/src/commands.rs` on the Rust side. Changing one side means changing both.
 *
 * Outside Tauri (browser dev / Storybook) this runs on a localStorage-based dev store —
 * it exists so UI flows can be checked in the browser; real persistence is Tauri's SQLite.
 */

import { invoke } from '@tauri-apps/api/core'
import type { WorkspaceMeta } from '../features/dashboard/WorkspaceCard'
import type { GraphEdge, GraphNode } from '../features/canvas/graph/graph-state'
import type { ProviderStatus } from '../features/canvas/library/providers'
import type { ModelSpec } from '../features/canvas/model-spec'

/** Video preset — normalized form of a presets_show item */
export interface HiggsPreset {
  id: string
  name: string
  description?: string
  previewUrl?: string
}

/** Normalizes the presets_show response — accepts {items:[...]} (the actual response), {presets:[...]}, or a bare array */
export function normalizePresets(payload: unknown): HiggsPreset[] {
  const obj = payload as { items?: unknown[]; presets?: unknown[] } | null
  const arr = Array.isArray(payload) ? payload : (obj?.items ?? obj?.presets ?? [])
  return (arr as Array<Record<string, unknown>>)
    .filter((x) => typeof x.id === 'string' && typeof x.name === 'string')
    .map((x) => ({
      id: x.id as string,
      name: x.name as string,
      description: typeof x.description === 'string' ? x.description : undefined,
      previewUrl: typeof x.preview_url === 'string' ? x.preview_url : undefined,
    }))
}

/** Persisted graph document — GraphState serialized without selection */
export interface GraphDoc {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface IpcApi {
  listWorkspaces: () => Promise<WorkspaceMeta[]>
  createWorkspace: (name: string) => Promise<WorkspaceMeta>
  renameWorkspace: (id: string, name: string) => Promise<void>
  duplicateWorkspace: (id: string) => Promise<WorkspaceMeta>
  deleteWorkspace: (id: string) => Promise<void>
  loadGraph: (workspaceId: string) => Promise<GraphDoc>
  saveGraph: (workspaceId: string, graph: GraphDoc) => Promise<void>
  listProviders: () => Promise<ProviderStatus[]>
  connectProvider: (id: string) => Promise<ProviderStatus>
  setProviderApiKey: (providerId: string, apiKey: string) => Promise<ProviderStatus>
  disconnectProvider: (id: string) => Promise<void>
  refreshBalance: (id: string) => Promise<number>
  /** Provider model catalog — cache-first; with refresh, re-fetches from the server */
  getCatalog: (id: string, refresh?: boolean) => Promise<ModelSpec[]>
  /** Pre-run estimate — get_cost preflight (consumes no credits). Defaults to higgsfield when provider is omitted */
  estimateCost: (kind: string, params: Record<string, unknown>, provider?: string) => Promise<number>
  /** Video preset gallery (presets_show, file-cached) */
  getPresets: (refresh?: boolean) => Promise<HiggsPreset[]>
}

/** Whether we are running inside the Tauri runtime */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

const tauriIpc: IpcApi = {
  listWorkspaces: () => invoke<WorkspaceMeta[]>('list_workspaces'),
  createWorkspace: (name) => invoke<WorkspaceMeta>('create_workspace', { name }),
  renameWorkspace: (id, name) => invoke<void>('rename_workspace', { id, name }),
  duplicateWorkspace: (id) => invoke<WorkspaceMeta>('duplicate_workspace', { id }),
  deleteWorkspace: (id) => invoke<void>('delete_workspace', { id }),
  loadGraph: (workspaceId) => invoke<GraphDoc>('load_graph', { workspaceId }),
  saveGraph: (workspaceId, graph) => invoke<void>('save_graph', { workspaceId, graph }),
  listProviders: () => invoke<ProviderStatus[]>('list_providers'),
  connectProvider: (id) => invoke<ProviderStatus>('connect_provider', { id }),
  setProviderApiKey: (providerId, apiKey) =>
    invoke<ProviderStatus>('set_provider_api_key', { providerId, apiKey }),
  disconnectProvider: (id) => invoke<void>('disconnect_provider', { id }),
  refreshBalance: (id) => invoke<number>('refresh_balance', { id }),
  getCatalog: (id, refresh) => invoke<ModelSpec[]>('get_catalog', { id, refresh }),
  estimateCost: (kind, params, provider) =>
    invoke<number>('estimate_cost', { kind, params, provider }),
  getPresets: async (refresh) =>
    normalizePresets(await invoke<unknown>('get_presets', { refresh })),
}

// ── Browser dev fallback ──

const DEV_KEY = 'atoll-dev-store'

interface StoredWorkspace {
  meta: WorkspaceMeta
  graph: GraphDoc
}

function readAll(): Record<string, StoredWorkspace> {
  try {
    return JSON.parse(localStorage.getItem(DEV_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, StoredWorkspace>): void {
  localStorage.setItem(DEV_KEY, JSON.stringify(all))
}

function must(all: Record<string, StoredWorkspace>, id: string): StoredWorkspace {
  const item = all[id]
  if (!item) throw new Error(`Workspace not found: ${id}`)
  return item
}

const browserIpc: IpcApi = {
  async listWorkspaces() {
    return Object.values(readAll())
      .map((w) => w.meta)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async createWorkspace(name) {
    const all = readAll()
    const meta: WorkspaceMeta = {
      id: `ws-${crypto.randomUUID().slice(0, 8)}`,
      name,
      updatedAt: Date.now(),
    }
    all[meta.id] = { meta, graph: { nodes: [], edges: [] } }
    writeAll(all)
    return meta
  },
  async renameWorkspace(id, name) {
    const all = readAll()
    const item = must(all, id)
    item.meta = { ...item.meta, name, updatedAt: Date.now() }
    writeAll(all)
  },
  async duplicateWorkspace(id) {
    const all = readAll()
    const src = must(all, id)
    const meta: WorkspaceMeta = {
      id: `ws-${crypto.randomUUID().slice(0, 8)}`,
      name: `${src.meta.name} (copy)`,
      updatedAt: Date.now(),
    }
    all[meta.id] = { meta, graph: structuredClone(src.graph) }
    writeAll(all)
    return meta
  },
  async deleteWorkspace(id) {
    const all = readAll()
    must(all, id)
    delete all[id]
    writeAll(all)
  },
  async loadGraph(workspaceId) {
    return must(readAll(), workspaceId).graph
  },
  async saveGraph(workspaceId, graph) {
    const all = readAll()
    const item = must(all, workspaceId)
    item.graph = graph
    item.meta = { ...item.meta, updatedAt: Date.now() }
    writeAll(all)
  },

  // Provider — browser dev simulation (connect takes 1.2s, balance 100)
  async listProviders() {
    return [...devProviders.values()]
  },
  async connectProvider(id) {
    const p = devProviders.get(id)
    if (!p) throw new Error(`Unsupported provider: ${id}`)
    devProviders.set(id, { ...p, state: 'connecting' })
    await new Promise((r) => setTimeout(r, 1200))
    const connected: ProviderStatus = {
      ...p,
      state: 'connected',
      account: 'dev@browser',
      balance: 100,
    }
    devProviders.set(id, connected)
    return connected
  },
  async setProviderApiKey(id, _apiKey) {
    const p = devProviders.get(id)
    if (!p) throw new Error(`Unsupported provider: ${id}`)
    const connected: ProviderStatus = { ...p, state: 'connected', balance: 100 }
    devProviders.set(id, connected)
    return connected
  },
  async disconnectProvider(id) {
    const p = devProviders.get(id)
    if (!p) throw new Error(`Unsupported provider: ${id}`)
    devProviders.set(id, { id: p.id, name: p.name, state: 'disconnected' })
  },
  async refreshBalance(id) {
    const p = devProviders.get(id)
    if (!p || p.state !== 'connected') throw new Error('Not connected')
    devProviders.set(id, { ...p, balance: p.balance ?? 100 })
    return p.balance ?? 100
  },
  async getCatalog(id) {
    if (!devProviders.has(id)) throw new Error(`Unsupported provider: ${id}`)
    if (id !== 'higgsfield') return [] // Magnific catalog is not served in the browser dev fallback yet
    // Browser dev — mock catalog
    const { default: models } = await import('../features/canvas/mocks/models.json')
    return models as ModelSpec[]
  },
  async getPresets() {
    // Browser dev — samples for layout checks (no previews)
    await new Promise((r) => setTimeout(r, 300))
    return [
      { id: 'dev-earth-zoom', name: 'EARTH ZOOM', description: 'Cinematic zoom diving from low orbit into a living room' },
      { id: 'dev-float-spin', name: 'FLOAT SPIN', description: 'Lifts off in place and spins 360 degrees' },
      { id: 'dev-orbit-360', name: 'ORBIT 360', description: 'The camera circles the subject once' },
    ]
  },
  async estimateCost(_kind, params) {
    // Browser dev — fake estimate based on prompt length (for checking the badge flow)
    await new Promise((r) => setTimeout(r, 400))
    const count = typeof params.count === 'number' ? params.count : 1
    return count * 2
  },
}

const devProviders = new Map<string, ProviderStatus>([
  ['higgsfield', { id: 'higgsfield', name: 'Higgsfield', state: 'disconnected' }],
  ['magnific', { id: 'magnific', name: 'Magnific', state: 'disconnected' }],
  ['kling', { id: 'kling', name: 'Kling', state: 'disconnected' }],
  ['elevenlabs', { id: 'elevenlabs', name: 'ElevenLabs', state: 'disconnected', authKind: 'api_key' }],
])

export const ipc: IpcApi = isTauri() ? tauriIpc : browserIpc
