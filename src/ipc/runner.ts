import { useMemo } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { isTauri } from './commands'

/** Generation job status push — maps 1:1 to the Rust polling worker (job/updated event) */
export interface JobUpdate {
  jobId: string
  nodeId: string
  workspaceId: string
  status: 'running' | 'done' | 'failed'
  urls: string[]
  /** Local cache file path downloaded by Rust — used instead of the remote URL when present */
  localPath?: string
  /** Asset-protocol URL for localPath — derived on the frontend (Rust does not send it) */
  localUrl?: string
  message?: string
}

export interface GenerationRunner {
  /** Submit a generation — nodeId is the node that receives the result. Defaults to higgsfield when provider is omitted */
  submit(
    nodeId: string,
    kind: 'image' | 'video' | 'audio' | '3d',
    params: Record<string, unknown>,
    provider?: string,
  ): Promise<{ jobIds: string[] }>
  subscribe(cb: (update: JobUpdate) => void): () => void
  /** Fetch stored job states — on canvas load, reconciles pushes missed before subscribing */
  resync(): Promise<JobUpdate[]>
  /** Cancel tracking (local only) — an already-submitted generation may keep running server-side and consume credits */
  cancel(jobId: string): Promise<void>
}

/** If a local cache exists, put the asset-protocol URL first */
function withLocalUrl(u: JobUpdate): JobUpdate {
  if (!u.localPath) return u
  const localUrl = convertFileSrc(u.localPath)
  return { ...u, localUrl, urls: [localUrl, ...u.urls] }
}

function tauriRunner(workspaceId: string): GenerationRunner {
  return {
    submit: (nodeId, kind, params, provider) =>
      invoke<{ jobIds: string[] }>('submit_generation', {
        workspaceId,
        nodeId,
        kind,
        params,
        provider,
      }),
    subscribe: (cb) => {
      let disposed = false
      let unlisten: (() => void) | null = null
      void import('@tauri-apps/api/event').then(({ listen }) =>
        listen<JobUpdate>('job/updated', (e) => {
          if (e.payload.workspaceId === workspaceId) cb(withLocalUrl(e.payload))
        }).then((un) => {
          if (disposed) un()
          else unlisten = un
        }),
      )
      return () => {
        disposed = true
        unlisten?.()
      }
    },
    resync: () =>
      invoke<JobUpdate[]>('list_jobs', { workspaceId }).then((list) => list.map(withLocalUrl)),
    cancel: (jobId) => invoke<void>('cancel_job', { jobId }),
  }
}

/** Browser dev simulator — placeholder result after 2.5s */
const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c1519"/><stop offset="1" stop-color="#2fc9be"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><text x="200" y="155" text-anchor="middle" fill="#eaf4f4" font-family="sans-serif" font-size="16">Generated result (dev)</text></svg>`,
  )

function browserRunner(workspaceId: string): GenerationRunner {
  const listeners = new Set<(u: JobUpdate) => void>()
  const canceled = new Set<string>()
  return {
    async submit(nodeId) {
      const jobId = `dev-${crypto.randomUUID().slice(0, 8)}`
      setTimeout(() => {
        if (canceled.has(jobId)) return
        for (const cb of listeners) {
          cb({ jobId, nodeId, workspaceId, status: 'done', urls: [PLACEHOLDER] })
        }
      }, 2500)
      return { jobIds: [jobId] }
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    resync: async () => [],
    cancel: async (jobId) => {
      canceled.add(jobId)
    },
  }
}

export function useGenerationRunner(workspaceId: string): GenerationRunner {
  return useMemo(
    () => (isTauri() ? tauriRunner(workspaceId) : browserRunner(workspaceId)),
    [workspaceId],
  )
}
