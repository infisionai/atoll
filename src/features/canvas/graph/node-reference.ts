/**
 * Node → agent reference text — the self-describing format Cmd-C puts on the clipboard.
 * All pure functions. The agent-side contract lives in agent_rules() in terminal.rs.
 */

import type { GraphNode, GraphState } from './graph-state'
import type { ModelSpec } from '../model-spec'
import { EDIT_OPS, type EditOpId } from './edit-ops'

export const NODE_REF_PREFIX = '@atoll:node/'

export interface NodeRefContext {
  graph: GraphState
  catalog: ModelSpec[]
}

/** Reference subset of MediaValue (FormField.tsx) — only the fields we need */
interface MediaLike {
  url?: string
  localPath?: string
}

/** Prompt truncation length — keeps it from eating the agent's input box */
const PROMPT_MAX = 200

/** Maximum number of entries listed on the options line */
const OPTIONS_MAX = 6

const KIND_LABEL: Record<string, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  '3d': '3D',
}

/** Selected nodes ordered by (y, x, id) — selection is a Set, so relying on iteration order makes the output unstable */
export function orderedSelection(graph: GraphState): string[] {
  return [...graph.selection]
    .map((id) => graph.nodes[id])
    .filter((n): n is GraphNode => n !== undefined)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
    .map((n) => n.id)
}

/**
 * Short tokens only — the Cmd-C default. The built-in terminal's agent looks up the
 * full context itself via MCP (canvas_state), so tokens suffice. The full text
 * (nodeReferenceText) is for external terminals without MCP (Shift-Cmd-C).
 */
export function nodeReferenceTokens(graph: GraphState, ids: readonly string[]): string {
  return ids
    .filter((id) => graph.nodes[id])
    .map((id) => `${NODE_REF_PREFIX}${id}`)
    .join(' ')
}

/** Final clipboard text — two or more nodes get a header + blank-line separators */
export function nodeReferenceText(ctx: NodeRefContext, ids: readonly string[]): string {
  const blocks = ids
    .map((id) => describeNode(ctx, id))
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join('\n'))
  if (blocks.length === 0) return ''
  if (blocks.length === 1) return blocks[0]
  return [`${blocks.length} Atoll nodes:`, ...blocks].join('\n\n')
}

/** Description lines for a single node — empty array for a missing node */
export function describeNode(ctx: NodeRefContext, id: string): string[] {
  const node = ctx.graph.nodes[id]
  if (!node) return []
  switch (node.kind) {
    case 'asset':
      return describeAsset(ctx, node)
    case 'model':
      return describeModel(ctx, node)
    case 'edit':
      return describeEdit(ctx, node)
  }
}

// ── Per-kind descriptions ──

function describeAsset(ctx: NodeRefContext, node: GraphNode): string[] {
  const label = KIND_LABEL[node.ref] ?? node.ref
  const media = node.values.media as MediaLike | undefined
  const generating = node.values.generating === true
  const error = typeof node.values.error === 'string' ? node.values.error : undefined

  // Result nodes trace back to the generating model via sourceNode (planted by GraphCanvas at run time)
  const source =
    typeof node.values.sourceNode === 'string' ? ctx.graph.nodes[node.values.sourceNode] : undefined
  const modelName = source ? modelNameOf(ctx.catalog, source.ref) : undefined

  const summary = generating
    ? withModel(`generating ${label}`, modelName)
    : media
      ? source
        ? withModel(`${label} result`, modelName)
        : `uploaded ${label} asset`
      : `empty ${label} asset`

  const lines = [head(node.id, summary)]
  const prompt = source && promptOf(source.values)
  if (prompt) lines.push(`Prompt: "${prompt}"`)
  lines.push(...mediaLines(label, node.ref, media))
  lines.push(...inputLines(ctx.graph, node.id))
  if (error) lines.push(`Status: failed — ${error}`)
  else if (generating) lines.push('Status: generating')
  return lines
}

function describeModel(ctx: NodeRefContext, node: GraphNode): string[] {
  const name = modelNameOf(ctx.catalog, node.ref)
  const summary = name ? `${name} node (${node.ref})` : `${node.ref} node`
  const lines = [head(node.id, summary)]
  const prompt = promptOf(node.values)
  if (prompt) lines.push(`Prompt: "${prompt}"`)
  lines.push(...optionLines(node.values))
  lines.push(...inputLines(ctx.graph, node.id))
  return lines
}

function describeEdit(ctx: NodeRefContext, node: GraphNode): string[] {
  const op = EDIT_OPS[node.ref as EditOpId]
  const lines = [head(node.id, `Edit · ${op?.name ?? node.ref}`)]
  lines.push(...optionLines(node.values))
  const result = node.values.result as MediaLike | undefined
  lines.push(...mediaLines(KIND_LABEL[op?.output ?? ''] ?? 'result', op?.output ?? '', result))
  lines.push(...inputLines(ctx.graph, node.id))
  return lines
}

// ── Shared line builders ──

function head(id: string, summary: string): string {
  return `${NODE_REF_PREFIX}${id} — ${summary}`
}

function withModel(summary: string, modelName: string | undefined): string {
  return modelName ? `${summary} · ${modelName}` : summary
}

function modelNameOf(catalog: ModelSpec[], ref: string): string | undefined {
  return catalog.find((m) => m.id === ref)?.name ?? undefined
}

/** A prompt-like (/prompt/i) string among the values — truncated to 200 chars */
function promptOf(values: Record<string, unknown>): string | undefined {
  for (const [k, v] of Object.entries(values)) {
    if (!/prompt/i.test(k) || k.startsWith('__')) continue
    if (typeof v === 'string' && v.trim()) {
      const t = v.trim()
      return t.length > PROMPT_MAX ? `${t.slice(0, PROMPT_MAX)}…` : t
    }
  }
  return undefined
}

/** Non-prompt scalar values that are filled in — internal keys (__ prefix, state bookkeeping) excluded, max 6 */
function optionLines(values: Record<string, unknown>): string[] {
  const skip = new Set(['generating', 'progressNote', 'sourceNode', 'jobId'])
  const pairs = Object.entries(values)
    .filter(
      ([k, v]) =>
        !k.startsWith('__') &&
        !skip.has(k) &&
        !/prompt/i.test(k) &&
        (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') &&
        v !== '',
    )
    .slice(0, OPTIONS_MAX)
    .map(([k, v]) => `${k}=${v}`)
  return pairs.length > 0 ? [`Options: ${pairs.join(', ')}`] : []
}

/**
 * Media location line — `File:` when a local path exists, otherwise `URL:`.
 * Non-images get a "cannot open directly" hint — so agents don't flounder trying to Read an mp4.
 * URLs are http(s) only — blob: is meaningless outside the webview and data: pastes hundreds of chars verbatim.
 */
function mediaLines(label: string, kind: string, media: MediaLike | undefined): string[] {
  if (!media) return []
  if (media.localPath) {
    const hint = kind === 'image' ? '' : `  (${label} — cannot be opened directly; path reference only)`
    return [`File: ${media.localPath}${hint}`]
  }
  if (media.url && /^https?:/i.test(media.url)) return [`URL: ${media.url}`]
  return []
}

/** Upstream connections — lists the source nodes of incoming edges as references */
function inputLines(graph: GraphState, nodeId: string): string[] {
  const froms = graph.edges
    .filter((e) => e.to.split(':')[0] === nodeId)
    .map((e) => e.from.split(':')[0])
  const unique = [...new Set(froms)]
  return unique.length > 0
    ? [`Inputs: ${unique.map((id) => `${NODE_REF_PREFIX}${id}`).join(', ')}`]
    : []
}
