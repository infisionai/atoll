import type { MediaValue } from '../fields/FormField'
import type { JobUpdate } from '../../../ipc/runner'

/**
 * Batch-generation (gallery) result handling — pure functions.
 *
 * A batch result node keeps the single-media asset-node shape but adds:
 *   jobIds:   all job ids from the submit, order = slot order
 *   expected: number of results the count parameter asked for
 *   items:    slot-indexed results (null = not arrived yet) — slots never reorder
 *   settled:  job ids that reached done/failed — drives completion
 *   selected: index feeding the OUT port
 * plus legacy mirrors `media` / `jobId` (= selected item) so export, agent
 * references, and downstream run-params keep working unchanged.
 *
 * Two provider shapes are merged by mergeJobUpdate:
 *   Shape A — N job ids, one url each (Magnific: one creation per job)
 *   Shape B — one job id whose payload carries N urls (Kling imageCount)
 */

export interface GalleryItem extends MediaValue {
  /** Originating job id — per-item for shape A, the shared id for shape B */
  jobId?: string
  /** Remote https URL even when `url` points at the local cache — for cross-provider run-params */
  remoteUrl?: string
}

/** Result media mime guess — based on node kind */
export const MIME_BY_KIND: Record<string, string> = {
  image: 'image/png',
  video: 'video/mp4',
  audio: 'audio/mpeg',
  '3d': 'model/gltf-binary',
}

const KIND_EXT: Record<string, RegExp> = {
  video: /\.(mp4|webm|mov)(\?|$)/i,
  image: /\.(png|jpe?g|webp|gif)(\?|$)/i,
  audio: /\.(mp3|wav|m4a|ogg|flac)(\?|$)/i,
  '3d': /\.(glb|gltf)(\?|$)/i,
}

/** Result file name — keeps the extension visible */
export function resultName(url: string): string {
  const ext = url.split('?')[0].split('.').pop()
  return ext && ext.length <= 5 && /^[a-z0-9]+$/i.test(ext)
    ? `Generated result.${ext}`
    : 'Generated result'
}

/** Pick the result URL matching the node kind */
export function pickMediaUrl(urls: string[], kind: string): string | undefined {
  return pickMediaUrls(urls, kind, 1)[0]
}

/**
 * All result URLs matching the node kind, up to `limit`.
 * Falls back to the first URL when nothing matches the kind's extensions
 * (some providers serve results from extensionless URLs).
 */
export function pickMediaUrls(urls: string[], kind: string, limit: number): string[] {
  const preferred = KIND_EXT[kind]
  const hits = preferred ? urls.filter((u) => preferred.test(u)) : []
  const picked = hits.length > 0 ? hits : urls.slice(0, 1)
  return picked.slice(0, Math.max(1, limit))
}

/** Batch size the params ask for — providers name the parameter differently */
export function expectedResultCount(params: Record<string, unknown>): number {
  let count = 1
  for (const key of ['count', 'imageCount', 'image_count']) {
    const v = params[key]
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    if (Number.isFinite(n) && n > count) count = Math.floor(n)
  }
  return count
}

/** True when the node's values carry batch bookkeeping */
export function isBatchValues(values: Record<string, unknown>): boolean {
  return Array.isArray(values.jobIds)
}

/** Params for one submit of a client-side fan-out — the count is app-level, not a provider argument */
export function stripBatchCountParams(params: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...params }
  delete rest.count
  delete rest.imageCount
  delete rest.image_count
  return rest
}

/** Initial values for a pending batch result node */
export function initBatchValues(
  jobIds: string[],
  expected: number,
  sourceNode: string,
  progressNote: string,
): Record<string, unknown> {
  const slots = Math.max(expected, jobIds.length)
  return {
    generating: true,
    progressNote,
    sourceNode,
    jobIds,
    expected: slots,
    items: Array<GalleryItem | null>(slots).fill(null),
    settled: [],
    selected: 0,
    jobId: jobIds[0],
  }
}

function makeItem(url: string, u: JobUpdate, kind: string): GalleryItem {
  const isLocal = url === u.localUrl
  const remote = isLocal
    ? pickMediaUrls(u.urls.filter((x) => x !== u.localUrl && /^https?:/i.test(x)), kind, 1)[0]
    : /^https?:/i.test(url)
      ? url
      : undefined
  return {
    name: resultName(url),
    url,
    mime: MIME_BY_KIND[kind] ?? 'image/png',
    // Attach the real path only when the chosen URL is the local cache — a remote URL must not carry an unrelated path
    localPath: isLocal ? u.localPath : undefined,
    remoteUrl: remote,
    jobId: u.jobId,
  }
}

/**
 * Merge one job update into batch node values. Returns the value patch to apply,
 * or null when the update is irrelevant (unknown job, running heartbeat).
 * Idempotent — resync after a push delivers the same update twice.
 */
export function mergeJobUpdate(
  values: Record<string, unknown>,
  u: JobUpdate,
  kind: string,
): Record<string, unknown> | null {
  const jobIds = values.jobIds as string[]
  if (!jobIds.includes(u.jobId)) return null
  if (u.status === 'running') return null

  const expected = (values.expected as number) ?? jobIds.length
  const items = [...((values.items as (GalleryItem | null)[]) ?? [])]
  const settled = new Set(values.settled as string[])

  if (jobIds.length === 1 && expected > 1) {
    // Shape B — one job, N urls in its payload
    if (u.status === 'done') {
      const urls = pickMediaUrls(u.urls, kind, expected)
      for (let i = 0; i < urls.length; i++) items[i] = makeItem(urls[i], u, kind)
    }
    settled.add(u.jobId)
  } else {
    // Shape A — one url per job, slot = the job's position in the submit response
    const slot = jobIds.indexOf(u.jobId)
    if (u.status === 'done') {
      const url = pickMediaUrls(u.urls, kind, 1)[0]
      if (url) items[slot] = makeItem(url, u, kind)
    }
    settled.add(u.jobId)
  }

  const arrived = items.filter((it) => it !== null).length
  const patch: Record<string, unknown> = { items, settled: [...settled] }

  if (settled.size < jobIds.length) {
    patch.progressNote = `${arrived}/${expected}`
    return patch
  }

  // All jobs settled — complete with whatever arrived (partial failures keep their empty slots)
  patch.generating = false
  patch.progressNote = undefined
  if (arrived > 0) {
    const selected = items.findIndex((it) => it !== null)
    patch.selected = selected
    patch.media = items[selected]
    patch.jobId = items[selected]?.jobId ?? jobIds[0]
  } else {
    patch.error = u.message ?? 'Result URL not found'
  }
  return patch
}

/** Select a gallery item — updates the legacy mirrors feeding the OUT port */
export function selectItem(
  values: Record<string, unknown>,
  index: number,
): Record<string, unknown> | null {
  const items = values.items as (GalleryItem | null)[] | undefined
  const item = items?.[index]
  if (!item) return null
  return {
    selected: index,
    media: item,
    jobId: item.jobId ?? (values.jobIds as string[] | undefined)?.[0] ?? values.jobId,
  }
}

/** Values for a standalone asset node extracted (copied) from a gallery item */
export function extractedItemValues(
  values: Record<string, unknown>,
  index: number,
): Record<string, unknown> | null {
  const items = values.items as (GalleryItem | null)[] | undefined
  const item = items?.[index]
  if (!item) return null
  return {
    media: { ...item },
    jobId: item.jobId ?? (values.jobIds as string[] | undefined)?.[0] ?? values.jobId,
  }
}
