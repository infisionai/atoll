import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import { AssetNode, RESULT_IN_PORT, type AssetKind } from '../AssetNode'
import { NodeCard, OUT_PORT } from '../NodeCard'
import { NodeToolbar } from '../NodeToolbar'
import type { NodeStatus } from '../StatusBadge'
import type { MediaValue } from '../fields/FormField'
import { buildFormSpec, maxItemsOf, portTypeOf } from '../form-spec'
import type { ModelSpec } from '../model-spec'
import { canConnect, compatible, type PortValueType } from './connect-rules'
import { edgeMidpoint, edgePath, type Point } from './edge-path'
import {
  connectionsOf,
  emptyGraph,
  graphReducer,
  incomingByPort,
  type GraphEdge,
  type GraphNode,
  type GraphState,
  type NodeKind,
} from './graph-state'
import { buildNode, type NodeDef } from './graph-build'
import {
  MIME_BY_KIND,
  expectedResultCount,
  extractedItemValues,
  initBatchValues,
  isBatchValues,
  mergeJobUpdate,
  pickMediaUrl,
  resultName,
  selectItem,
  stripBatchCountParams,
  type GalleryItem,
} from './gallery'
import { nodeReferenceText, nodeReferenceTokens, orderedSelection } from './node-reference'
import { rectFromPoints, rectsIntersect } from './select'
import { buildRunParams } from './run-params'
import { toolbarSpec } from './toolbar-actions'
import { useCostEstimates } from './useCostEstimates'
import { resolveSnap, type SnapCandidate } from './snap'
import { IDENTITY, pan, screenToWorld, zoomAt, type Viewport } from './viewport'
import type { GenerationRunner, JobUpdate } from '../../../ipc/runner'
import { isTauri } from '../../../ipc/commands'
import { writeClipboardText } from '../../../shared/clipboard'
import styles from './GraphCanvas.module.css'

/** Global port identifier: `<nodeId>:<portName>` */
type PortId = string

interface GraphCanvasProps {
  /** Catalog used to resolve model specs */
  catalog: ModelSpec[]
  initialGraph?: GraphState
  /** Called whenever persistent state changes — hook point for auto-save */
  onGraphChange?: (state: GraphState) => void
  /** Generation runner — without it the run button does nothing */
  runner?: GenerationRunner
  /** Receives commands from the local MCP tool (canvas/command) — no subscription without it */
  workspaceId?: string
}

/** Handle for external controls (e.g. the library sidebar) to manipulate the canvas */
export interface GraphCanvasHandle {
  /** Adds a node at the viewport center and selects it */
  addNode: (def: Omit<NodeDef, 'id' | 'x' | 'y'>) => void
}

/** Don't start a node drag when the pointer is over a control */
function isInteractive(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    !!el.closest(
      'button, input, textarea, select, a, canvas, video, [data-port], [data-resize], [role="switch"]',
    )
  )
}

function isTyping(e: KeyboardEvent): boolean {
  return (
    e.target instanceof HTMLElement &&
    !!e.target.closest('input, textarea, select, [contenteditable]')
  )
}

/**
 * Graph canvas — graphReducer owns persistent state (nodes, edges, selection);
 * local state owns transient state (pan, zoom, drag, marquee).
 * Interactions: two-finger pan / pinch or ctrl+wheel zoom / Space+drag pan /
 * node, marquee, and Shift selection / Delete to remove / Cmd-D to duplicate /
 * port-drag connection with magnetic snapping
 */
export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  { catalog, initialGraph, onGraphChange, runner, workspaceId },
  handleRef,
) {
  const containerRef = useRef<HTMLDivElement>(null)

  const [graph, dispatch] = useReducer(graphReducer, initialGraph ?? emptyGraph)
  const graphRef = useRef(graph)
  graphRef.current = graph

  useEffect(() => {
    onGraphChange?.(graph)
  }, [graph, onGraphChange])

  const [vp, setVp] = useState<Viewport>(IDENTITY)
  const vpRef = useRef(vp)
  vpRef.current = vp

  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [drag, setDrag] = useState<{
    from: PortId
    fromType: PortValueType
    cursor: Point
    snapped: PortId | null
  } | null>(null)
  const dragRef = useRef<typeof drag>(null)
  dragRef.current = drag

  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const panLast = useRef<Point | null>(null)
  const nodeDrag = useRef<{ ids: string[]; last: Point } | null>(null)

  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null)
  const marqueeRef = useRef<typeof marquee>(null)
  marqueeRef.current = marquee

  // Gallery item drag-out — client coords (ghost renders outside the world transform)
  const [itemDrag, setItemDrag] = useState<{
    nodeId: string
    index: number
    item: GalleryItem
    start: Point
    cursor: Point
    active: boolean
  } | null>(null)
  const itemDragRef = useRef<typeof itemDrag>(null)
  itemDragRef.current = itemDrag
  // A completed drag-out must not also register as a tile click (selection change)
  const suppressItemClick = useRef(false)

  const edgeKey = (e: GraphEdge) => `${e.from}→${e.to}`

  // Port DOM doesn't exist on first render so edges can't be drawn — redraw once after mount
  const [, forceRedraw] = useState(0)
  useEffect(() => {
    forceRedraw((n) => n + 1)
  }, [])

  /** Client coordinates → world coordinates */
  const toWorld = useCallback((clientX: number, clientY: number): Point => {
    const rect = containerRef.current!.getBoundingClientRect()
    return screenToWorld(vpRef.current, { x: clientX - rect.left, y: clientY - rect.top })
  }, [])

  const portCenter = useCallback(
    (portId: PortId): Point | null => {
      const el = containerRef.current?.querySelector(`[data-port="${portId}"]`)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return toWorld(r.left + r.width / 2, r.top + r.height / 2)
    },
    [toWorld],
  )

  // ── Node kind/type resolution ──

  const modelOf = useCallback(
    (node: GraphNode | undefined): ModelSpec | undefined =>
      node?.kind === 'model' ? catalog.find((m) => m.id === node.ref) : undefined,
    [catalog],
  )

  /** Output port value type — asset: its asset kind, model: the model's output_type */
  const outTypeOf = useCallback(
    (nodeId: string): PortValueType | null => {
      const n = graphRef.current.nodes[nodeId]
      if (!n) return null
      if (n.kind === 'asset') return n.ref as PortValueType
      const model = modelOf(n)
      return model ? portTypeOf(model, OUT_PORT) : null
    },
    [modelOf],
  )

  /** Input port value type — per node kind */
  const inTypeOf = useCallback(
    (nodeId: string, portName: string): PortValueType | null => {
      const n = graphRef.current.nodes[nodeId]
      if (!n) return null
      if (n.kind === 'model') {
        const model = modelOf(n)
        return model ? portTypeOf(model, portName) : null
      }
      return null // Asset nodes have no input ports
    },
    [modelOf],
  )

  /** Maximum number of connections for an input port */
  const inMaxOf = useCallback(
    (nodeId: string, portName: string): number => {
      const model = modelOf(graphRef.current.nodes[nodeId])
      return model ? maxItemsOf(model, portName) : 1
    },
    [modelOf],
  )

  // ── Wheel: two-finger pan / pinch or ctrl+wheel zoom (attached non-passive to block default scrolling) ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        setVp((v) => zoomAt(v, anchor, Math.exp(-e.deltaY * 0.01)))
      } else {
        setVp((v) => pan(v, -e.deltaX, -e.deltaY))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Selection actions ──

  const removeSelection = useCallback(() => {
    const ids = [...graphRef.current.selection]
    if (ids.length > 0) dispatch({ type: 'node/remove', ids })
  }, [])

  const duplicateSelection = useCallback(() => {
    const g = graphRef.current
    const copies: string[] = []
    for (const id of g.selection) {
      const src = g.nodes[id]
      if (!src) continue
      const copyId = `${src.ref}-${crypto.randomUUID().slice(0, 8)}`
      copies.push(copyId)
      dispatch({
        type: 'node/add',
        node: {
          ...src,
          id: copyId,
          x: src.x + 24,
          y: src.y + 24,
          values: structuredClone(src.values),
        },
      })
    }
    if (copies.length > 0) dispatch({ type: 'selection/set', ids: copies })
  }, [])

  // External handle — the library sidebar adds nodes at the viewport center
  useImperativeHandle(
    handleRef,
    () => ({
      addNode: (def) => {
        const el = containerRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const center = screenToWorld(vpRef.current, { x: r.width / 2, y: r.height / 2 })
        const ref = def.model ?? def.asset ?? 'node'
        const id = `${ref}-${crypto.randomUUID().slice(0, 8)}`
        const node = buildNode(catalog, {
          id,
          x: center.x - 150,
          y: center.y - 100,
          ...def,
        })
        dispatch({ type: 'node/add', node })
        dispatch({ type: 'selection/set', ids: [id] })
      },
    }),
    [catalog],
  )

  /** Run a single generation (model) node — validate → submit → pending result node. Failure rejects and marks the node as error */
  const runNode = useCallback(
    (id: string): Promise<{ jobIds: string[] }> => {
      const g = graphRef.current
      const gn = g.nodes[id]
      if (!gn || gn.kind !== 'model') {
        return Promise.reject(new Error('Not a generation (model) node'))
      }
      const model = catalog.find((m) => m.id === gn.ref)
      if (!model) return Promise.reject(new Error(`Model not in catalog: ${gn.ref}`))
      if (!runner) return Promise.reject(new Error('Runner is not connected'))

      const fail = (message: string) => {
        dispatch({ type: 'node/setValue', id, name: '__status', value: 'error' })
        dispatch({ type: 'node/setValue', id, name: '__error', value: message })
        return Promise.reject(new Error(message))
      }

      const outType = model.output_type
      if (outType !== 'image' && outType !== 'video' && outType !== 'audio' && outType !== '3d') {
        return fail(`Unknown output kind: ${outType}`)
      }

      // Collect and validate params — uses the same builder as cost estimation (get_cost)
      const { params, missing } = buildRunParams(g, gn, model)
      if (missing.length > 0) {
        return fail(`Missing required inputs: ${missing.join(', ')}`)
      }

      // Pending-result asset node (skeleton while generating)
      const resultId = `result-${crypto.randomUUID().slice(0, 8)}`
      dispatch({
        type: 'node/add',
        node: {
          id: resultId,
          kind: 'asset',
          ref: outType,
          x: gn.x + 340,
          y: gn.y,
          values: { generating: true, progressNote: `Generating with ${model.name}`, sourceNode: id },
        },
      })
      // Edge from the generating node to the result node
      dispatch({
        type: 'edge/connect',
        from: `${id}:${OUT_PORT}`,
        to: `${resultId}:${RESULT_IN_PORT}`,
        max: 1,
      })
      dispatch({ type: 'node/setValue', id, name: '__status', value: 'running' })
      dispatch({ type: 'node/setValue', id, name: '__error', value: undefined })

      const expected = expectedResultCount(params)
      // Providers without a native batch param (client_batch) get N parallel submits instead;
      // partial submit failures proceed with whatever got through
      const submitAll: Promise<{ jobIds: string[] }> =
        model.client_batch === true && expected > 1
          ? Promise.allSettled(
              Array.from({ length: expected }, () =>
                runner.submit(resultId, outType, stripBatchCountParams(params), model.provider),
              ),
            ).then((results) => {
              const jobIds = results.flatMap((r) =>
                r.status === 'fulfilled' ? r.value.jobIds : [],
              )
              if (jobIds.length === 0) {
                const failed = results.find(
                  (r): r is PromiseRejectedResult => r.status === 'rejected',
                )
                throw failed?.reason instanceof Error
                  ? failed.reason
                  : new Error(String(failed?.reason ?? 'All submissions failed'))
              }
              return { jobIds }
            })
          : runner.submit(resultId, outType, params, model.provider)

      return submitAll.then(
        ({ jobIds }) => {
          dispatch({ type: 'node/setValue', id, name: '__status', value: undefined })
          if (expected > 1 || jobIds.length > 1) {
            // Batch — the result node becomes a gallery collecting all jobs/urls
            dispatch({
              type: 'node/patchValues',
              id: resultId,
              patch: initBatchValues(jobIds, expected, id, `Generating with ${model.name}`),
            })
          } else {
            dispatch({ type: 'node/setValue', id: resultId, name: 'jobId', value: jobIds[0] })
          }
          return { jobIds }
        },
        (e) => {
          console.error('Generation submit failed:', e)
          const message = `Generation submit failed: ${e instanceof Error ? e.message : e}`
          dispatch({ type: 'node/setValue', id, name: '__status', value: 'error' })
          dispatch({ type: 'node/setValue', id, name: '__error', value: message })
          dispatch({ type: 'node/remove', ids: [resultId] })
          throw new Error(message)
        },
      )
    },
    [catalog, runner],
  )

  /** Run the selected generation nodes — validation failures show up as node status badges */
  const runSelection = useCallback(() => {
    for (const id of [...graphRef.current.selection]) {
      void runNode(id).catch(() => {})
    }
  }, [runNode])

  /** Executes canvas commands from the local MCP tool — the reducer remains the source of truth for the graph */
  const executeCanvasCommand = async (cmd: Record<string, unknown>): Promise<unknown> => {
    const g = graphRef.current
    switch (cmd.type as string) {
      case 'state':
        return {
          nodes: Object.values(g.nodes).map((n) => {
            const model = n.kind === 'model' ? catalog.find((m) => m.id === n.ref) : undefined
            const spec = model ? buildFormSpec(model) : null
            return {
              id: n.id,
              kind: n.kind,
              ref: n.ref,
              x: n.x,
              y: n.y,
              values: n.values,
              fields: spec
                ? [...spec.basic, ...spec.advanced].map((f) => ({
                    name: f.name,
                    kind: f.kind,
                    required: f.required ?? false,
                    connectable: f.connectable ?? false,
                  }))
                : undefined,
            }
          }),
          edges: g.edges,
        }

      case 'add_node': {
        const kind = cmd.kind as NodeKind
        const ref = cmd.ref as string
        if (kind === 'model' && !catalog.some((m) => m.id === ref)) {
          throw new Error(`Model not in catalog: ${ref} — check with list_models`)
        }
        if (kind === 'asset' && ref !== 'image' && ref !== 'video') {
          throw new Error('asset ref must be image or video')
        }

        const rect = containerRef.current?.getBoundingClientRect()
        const center = rect
          ? screenToWorld(vpRef.current, { x: rect.width / 2, y: rect.height / 2 })
          : { x: 150, y: 100 }
        const id = `${ref}-${crypto.randomUUID().slice(0, 8)}`
        const def = kind === 'model' ? { model: ref } : { asset: ref as AssetKind }
        const node = buildNode(catalog, {
          id,
          x: (cmd.x as number | undefined) ?? center.x - 150,
          y: (cmd.y as number | undefined) ?? center.y - 100,
          ...def,
        })
        if (cmd.values && typeof cmd.values === 'object') {
          node.values = { ...node.values, ...(cmd.values as Record<string, unknown>) }
        }
        dispatch({ type: 'node/add', node })
        return { nodeId: id }
      }

      case 'set_value': {
        const nodeId = cmd.nodeId as string
        if (!g.nodes[nodeId]) throw new Error(`Node not found: ${nodeId}`)
        dispatch({ type: 'node/setValue', id: nodeId, name: cmd.name as string, value: cmd.value })
        return { ok: true }
      }

      case 'connect': {
        const fromNode = cmd.fromNode as string
        const toNode = cmd.toNode as string
        const toPort = cmd.toPort as string
        if (!g.nodes[fromNode]) throw new Error(`Node not found: ${fromNode}`)
        if (!g.nodes[toNode]) throw new Error(`Node not found: ${toNode}`)
        const outType = outTypeOf(fromNode)
        const inType = inTypeOf(toNode, toPort)
        if (!outType) throw new Error('Node has no output port')
        if (!inType) throw new Error(`Input port not found: ${toPort} — check the connectable field in canvas_state`)
        if (!compatible(outType, inType)) throw new Error(`Type mismatch: ${outType} → ${inType}`)
        const from = `${fromNode}:${OUT_PORT}`
        const to = `${toNode}:${toPort}`
        if (g.edges.some((e) => e.from === from && e.to === to)) throw new Error('Already connected')
        const max = inMaxOf(toNode, toPort)
        if (g.edges.filter((e) => e.to === to).length >= max) {
          throw new Error(`Exceeds the input port's maximum connections (${max})`)
        }
        dispatch({ type: 'edge/connect', from, to, max })
        return { ok: true }
      }

      case 'disconnect':
        dispatch({
          type: 'edge/remove',
          from: `${cmd.fromNode as string}:${OUT_PORT}`,
          to: `${cmd.toNode as string}:${cmd.toPort as string}`,
        })
        return { ok: true }

      case 'run':
        return runNode(cmd.nodeId as string)

      default:
        throw new Error(`Unknown command: ${cmd.type as string}`)
    }
  }
  const executeCanvasCommandRef = useRef(executeCanvasCommand)
  executeCanvasCommandRef.current = executeCanvasCommand

  // Subscribe to canvas/command — executes tool calls from the local MCP server (Rust) and replies
  useEffect(() => {
    if (!workspaceId || !isTauri()) return
    let disposed = false
    let un: (() => void) | null = null
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<{ id: number; workspaceId: string; command: Record<string, unknown> }>(
        'canvas/command',
        (e) => {
          if (e.payload.workspaceId !== workspaceId) return
          void (async () => {
            let result: unknown
            try {
              result = await executeCanvasCommandRef.current(e.payload.command)
            } catch (err) {
              result = { error: err instanceof Error ? err.message : String(err) }
            }
            const { invoke } = await import('@tauri-apps/api/core')
            void invoke('canvas_command_result', { id: e.payload.id, result })
          })()
        },
      ).then((u) => {
        if (disposed) u()
        else un = u
      }),
    )
    return () => {
      disposed = true
      un?.()
    }
  }, [workspaceId])

  /** Cancel a generating result node — stops tracking and removes the node (server credits may still be spent) */
  const cancelNode = useCallback(
    (id: string) => {
      const values = graphRef.current.nodes[id]?.values
      const jobIds = (values?.jobIds as string[] | undefined) ?? []
      const single = values?.jobId as string | undefined
      for (const jobId of jobIds.length > 0 ? jobIds : single ? [single] : []) {
        runner?.cancel(jobId).catch((e) => console.warn('Cancel failed:', e))
      }
      dispatch({ type: 'node/remove', ids: [id] })
    },
    [runner],
  )

  // ── Gallery item drag-out — copy an item into a standalone asset node ──

  const startItemDrag = useCallback((nodeId: string, index: number, e: PointerEvent) => {
    const values = graphRef.current.nodes[nodeId]?.values
    const item = (values?.items as (GalleryItem | null)[] | undefined)?.[index]
    if (!item) return
    const p = { x: e.clientX, y: e.clientY }
    setItemDrag({ nodeId, index, item, start: p, cursor: p, active: false })
  }, [])

  useEffect(() => {
    if (!itemDrag) return
    const onMove = (e: globalThis.PointerEvent) => {
      const current = itemDragRef.current
      if (!current) return
      const cursor = { x: e.clientX, y: e.clientY }
      const active =
        current.active ||
        Math.hypot(cursor.x - current.start.x, cursor.y - current.start.y) > 4
      setItemDrag({ ...current, cursor, active })
    }
    const onUp = (e: globalThis.PointerEvent) => {
      const current = itemDragRef.current
      setItemDrag(null)
      if (!current?.active) return
      suppressItemClick.current = true
      // Dropping back onto the source gallery card cancels the extraction
      const over = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest?.('[data-node-id]') as HTMLElement | null
      if (over?.dataset.nodeId === current.nodeId) return
      const values = graphRef.current.nodes[current.nodeId]?.values
      if (!values) return
      const extracted = extractedItemValues(values, current.index)
      if (!extracted) return
      const src = graphRef.current.nodes[current.nodeId]!
      const world = toWorld(e.clientX, e.clientY)
      const id = `${src.ref}-${crypto.randomUUID().slice(0, 8)}`
      dispatch({
        type: 'node/add',
        node: {
          id,
          kind: 'asset',
          ref: src.ref,
          x: world.x - 104,
          y: world.y - 24,
          values: extracted,
        },
      })
      dispatch({ type: 'selection/set', ids: [id] })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [itemDrag !== null, toWorld]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectGalleryItem = useCallback((nodeId: string, index: number) => {
    if (suppressItemClick.current) {
      suppressItemClick.current = false
      return
    }
    const values = graphRef.current.nodes[nodeId]?.values
    if (!values) return
    const patch = selectItem(values, index)
    if (patch) dispatch({ type: 'node/patchValues', id: nodeId, patch })
  }, [])

  /** Export media of the selected asset nodes — currently opens in the browser; local saving is planned */
  const exportSelection = useCallback(() => {
    const g = graphRef.current
    for (const id of g.selection) {
      const gn = g.nodes[id]
      if (gn?.kind !== 'asset') continue
      const media = gn.values.media as { url?: string } | undefined
      if (media?.url) window.open(media.url, '_blank')
    }
  }, [])

  // ── Copy for agents — Cmd-C: short tokens (MCP resolves the context) / Shift-Cmd-C: full text (for external terminals) ──
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const copySelection = useCallback(
    (mode: 'token' | 'full' = 'token') => {
      const g = graphRef.current
      const ids = orderedSelection(g)
      if (ids.length === 0) return
      const text =
        mode === 'full'
          ? nodeReferenceText({ graph: g, catalog }, ids)
          : nodeReferenceTokens(g, ids)
      void writeClipboardText(text).then((ok) => {
        if (!ok) {
          console.warn('Clipboard write failed')
          return
        }
        setCopied(true)
        window.clearTimeout(copyTimer.current)
        copyTimer.current = window.setTimeout(() => setCopied(false), 900)
      })
    },
    [catalog],
  )

  /** Apply job status to the result node — shared by the push subscription and the resync on load */
  const applyJobUpdate = useCallback((u: JobUpdate) => {
    const node = graphRef.current.nodes[u.nodeId]
    // Only apply to nodes still waiting on generation — don't touch nodes already updated or changed by the user
    if (!node || node.values.generating !== true) return
    if (isBatchValues(node.values)) {
      const patch = mergeJobUpdate(node.values, u, node.ref)
      if (patch) dispatch({ type: 'node/patchValues', id: u.nodeId, patch })
      return
    }
    if (u.status === 'done') {
      const url = pickMediaUrl(u.urls, node.ref)
      dispatch({ type: 'node/setValue', id: u.nodeId, name: 'generating', value: false })
      dispatch({ type: 'node/setValue', id: u.nodeId, name: 'progressNote', value: undefined })
      dispatch({
        type: 'node/setValue',
        id: u.nodeId,
        name: 'media',
        value: url
          ? {
              name: resultName(url),
              url,
              mime: MIME_BY_KIND[node.ref] ?? 'image/png',
              // Attach the real path only when the chosen URL is the local cache — a remote URL must not carry an unrelated path
              localPath: url === u.localUrl ? u.localPath : undefined,
            }
          : undefined,
      })
      if (!url) {
        dispatch({
          type: 'node/setValue',
          id: u.nodeId,
          name: 'error',
          value: 'Result URL not found',
        })
      }
    } else if (u.status === 'failed') {
      dispatch({ type: 'node/setValue', id: u.nodeId, name: 'generating', value: false })
      dispatch({
        type: 'node/setValue',
        id: u.nodeId,
        name: 'error',
        value: u.message ?? 'Generation failed',
      })
    }
  }, [])

  // Subscribe to job status pushes + resync jobs that finished before subscribing (app restart, late tab open)
  useEffect(() => {
    if (!runner) return
    const unsubscribe = runner.subscribe(applyJobUpdate)
    runner
      .resync()
      .then((updates) => updates.forEach(applyJobUpdate))
      .catch((e) => console.warn('Job status reconciliation failed:', e))
    return unsubscribe
  }, [runner, applyJobUpdate])

  // ── Keyboard: Space pan / Delete remove / Cmd-C token copy, Shift-Cmd-C full-text copy / Cmd-D duplicate ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      if (e.code === 'Space') {
        e.preventDefault()
        setSpaceHeld(true)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removeSelection()
        return
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'c') {
        // Without a selection, defer to the browser's default copy (pass through without preventDefault)
        if (graphRef.current.selection.size === 0) return
        e.preventDefault()
        copySelection(e.shiftKey ? 'full' : 'token')
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelection()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [removeSelection, duplicateSelection, copySelection])

  // ── Pan / node drag in progress ──
  useEffect(() => {
    if (!panning && !nodeDrag.current) return
    const onMove = (e: globalThis.PointerEvent) => {
      if (panLast.current) {
        const dx = e.clientX - panLast.current.x
        const dy = e.clientY - panLast.current.y
        panLast.current = { x: e.clientX, y: e.clientY }
        setVp((v) => pan(v, dx, dy))
      } else if (nodeDrag.current) {
        const { ids, last } = nodeDrag.current
        const dx = (e.clientX - last.x) / vpRef.current.scale
        const dy = (e.clientY - last.y) / vpRef.current.scale
        nodeDrag.current = { ids, last: { x: e.clientX, y: e.clientY } }
        dispatch({ type: 'node/move', ids, dx, dy })
      }
    }
    const onUp = () => {
      panLast.current = null
      nodeDrag.current = null
      setPanning(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [panning])

  const beginNodeDrag = (id: string, e: PointerEvent) => {
    if (spaceHeld || isInteractive(e.target)) return
    // Block the native text-selection gesture — without this the drag flickers
    // selection highlights across the card (and form fields it passes over)
    e.preventDefault()
    window.getSelection()?.removeAllRanges()

    let sel: Set<string>
    if (e.shiftKey) {
      // Shift+click — add to/remove from the selection. If removed, don't start a drag
      if (graph.selection.has(id)) {
        dispatch({ type: 'selection/toggle', id })
        return
      }
      sel = new Set([...graph.selection, id])
    } else {
      // Grabbing a node that's part of the selection moves the whole selection
      sel = graph.selection.has(id) ? new Set(graph.selection) : new Set([id])
    }
    dispatch({ type: 'selection/set', ids: [...sel] })
    nodeDrag.current = { ids: [...sel], last: { x: e.clientX, y: e.clientY } }
    setPanning(true) // Activate the move listener (shared with panning)
  }

  /** Compute nodes overlapping the marquee rect (world coordinates) */
  const nodesInRect = useCallback(
    (start: Point, end: Point): Set<string> => {
      const rect = rectFromPoints(start, end)
      const hit = new Set<string>()
      const els = containerRef.current?.querySelectorAll('[data-node-id]') ?? []
      for (const el of els) {
        const r = el.getBoundingClientRect()
        const tl = toWorld(r.left, r.top)
        const br = toWorld(r.right, r.bottom)
        if (rectsIntersect(rect, rectFromPoints(tl, br))) {
          hit.add(el.getAttribute('data-node-id')!)
        }
      }
      return hit
    },
    [toWorld],
  )

  // ── Marquee selection in progress ──
  useEffect(() => {
    if (!marquee) return
    const onMove = (e: globalThis.PointerEvent) => {
      const m = marqueeRef.current
      if (!m) return
      const end = toWorld(e.clientX, e.clientY)
      setMarquee({ start: m.start, end })
      dispatch({ type: 'selection/set', ids: [...nodesInRect(m.start, end)] })
    }
    const onUp = () => setMarquee(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [marquee !== null, toWorld, nodesInRect])

  /** Ports eligible as snap targets during a drag — type-compatible input ports on other nodes */
  const collectCandidates = useCallback(
    (fromNode: string, fromType: PortValueType): SnapCandidate[] => {
      const els = containerRef.current?.querySelectorAll('[data-port][data-direction="in"]') ?? []
      const out: SnapCandidate[] = []
      for (const el of els) {
        const id = el.getAttribute('data-port')!
        const [nid, pname] = id.split(':')
        if (nid === fromNode) continue
        const type = inTypeOf(nid, pname)
        if (type && compatible(fromType, type)) {
          const r = el.getBoundingClientRect()
          out.push({ id, center: toWorld(r.left + r.width / 2, r.top + r.height / 2) })
        }
      }
      return out
    },
    [inTypeOf, toWorld],
  )

  // ── Edge drag: listen for move/end on window (releasing outside a port cancels) ──
  useEffect(() => {
    if (!drag) return
    const onMove = (e: globalThis.PointerEvent) =>
      setDrag((d) => {
        if (!d) return null
        const cursor = toWorld(e.clientX, e.clientY)
        const [fromNode] = d.from.split(':')
        const snapped = resolveSnap(
          cursor,
          collectCandidates(fromNode, d.fromType),
          d.snapped,
          1 / vpRef.current.scale,
        )
        return { ...d, cursor, snapped }
      })
    const onUp = () => {
      const current = dragRef.current
      if (current?.snapped) {
        const [nid, pname] = current.snapped.split(':')
        completeDragRef.current(nid, pname)
      }
      requestAnimationFrame(() => {
        if (dragRef.current) setDrag(null)
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag !== null, toWorld, collectCandidates])

  const startDrag = (nodeId: string, portName: string, e: PointerEvent) => {
    const cursor = toWorld(e.clientX, e.clientY)
    setSelectedEdge(null)

    if (portName === OUT_PORT) {
      const fromType = outTypeOf(nodeId)
      if (!fromType) return
      setDrag({ from: `${nodeId}:${portName}`, fromType, cursor, snapped: null })
      return
    }

    // Grabbing a connected input port detaches the edge back into drag state — release deletes it, dropping on another port moves it
    const attached = graph.edges.filter((ed) => ed.to === `${nodeId}:${portName}`).at(-1)
    if (!attached) return
    const [sourceNode] = attached.from.split(':')
    const fromType = outTypeOf(sourceNode)
    if (!fromType) return
    dispatch({ type: 'edge/remove', from: attached.from, to: attached.to })
    setDrag({ from: attached.from, fromType, cursor, snapped: null })
  }

  const completeDrag = (nodeId: string, portName: string) => {
    const current = dragRef.current
    if (!current) return
    const [fromNode] = current.from.split(':')
    const toType = inTypeOf(nodeId, portName)
    const ok =
      toType !== null &&
      canConnect(
        { direction: 'out', nodeId: fromNode, type: current.fromType },
        { direction: portName === OUT_PORT ? 'out' : 'in', nodeId, type: toType },
      )
    if (!ok) return // Rule violation — the drag persists and cancels when released outside a port
    dispatch({
      type: 'edge/connect',
      from: current.from,
      to: `${nodeId}:${portName}`,
      max: inMaxOf(nodeId, portName),
    })
    setDrag(null)
  }

  // Ref so window pointerup (snap connection) calls the latest completeDrag
  const completeDragRef = useRef(completeDrag)
  completeDragRef.current = completeDrag

  /** Top center of the selection area (world coordinates) — where the selection toolbar sits */
  const selectionAnchor = (): Point | null => {
    if (graph.selection.size === 0) return null
    let top = Infinity
    let left = Infinity
    let right = -Infinity
    for (const id of graph.selection) {
      const el = containerRef.current?.querySelector(`[data-node-id="${id}"]`)
      if (!el) continue
      const r = el.getBoundingClientRect()
      const tl = toWorld(r.left, r.top)
      const br = toWorld(r.right, r.bottom)
      top = Math.min(top, tl.y)
      left = Math.min(left, tl.x)
      right = Math.max(right, br.x)
    }
    if (!Number.isFinite(top)) return null
    return { x: (left + right) / 2, y: top }
  }

  const dragFromCenter = drag ? portCenter(drag.from) : null
  const selected = graph.edges.find((e) => edgeKey(e) === selectedEdge)
  const selectedGeom =
    selected &&
    (() => {
      const from = portCenter(selected.from)
      const to = portCenter(selected.to)
      return from && to ? edgeMidpoint(from, to) : null
    })()

  const dragFromProp = drag ? { nodeId: drag.from.split(':')[0], type: drag.fromType } : undefined
  const toolbarAnchor = !panning && !marquee && !drag ? selectionAnchor() : null
  const toolbar = toolbarSpec(graph, catalog)
  const { estimates, request: requestEstimate } = useCostEstimates(graph, catalog)

  return (
    <div
      ref={containerRef}
      className={styles.canvas}
      data-pan={panning && panLast.current ? 'active' : spaceHeld ? 'ready' : undefined}
      data-dragging={panning || marquee !== null || itemDrag?.active || undefined}
      onPointerDownCapture={(e) => {
        // Space pan / middle-click pan — intercepts before children (nodes, ports)
        if (spaceHeld || e.button === 1) {
          e.stopPropagation()
          e.preventDefault()
          panLast.current = { x: e.clientX, y: e.clientY }
          setPanning(true)
        }
      }}
      onPointerDown={(e) => {
        // Empty canvas: clear the selection + start a marquee selection
        if (e.target === e.currentTarget && !spaceHeld && e.button === 0) {
          setSelectedEdge(null)
          dispatch({ type: 'selection/clear' })
          const p = toWorld(e.clientX, e.clientY)
          setMarquee({ start: p, end: p })
        }
      }}
    >
      {/* Empty-canvas anchor — a quiet prompt in the abyss, never interactive */}
      {Object.keys(graph.nodes).length === 0 && (
        <div className={styles.emptyAnchor} aria-hidden>
          <span className={styles.emptyAnchorTitle}>drag a model from the library_</span>
          <span className={styles.emptyAnchorHint}>or ask the agent in the terminal</span>
        </div>
      )}

      <div
        className={styles.content}
        style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})` }}
      >
        <svg className={styles.edgeLayer}>
          {graph.edges.map((e) => {
            const from = portCenter(e.from)
            const to = portCenter(e.to)
            if (!from || !to) return null
            const key = edgeKey(e)
            const d = edgePath(from, to)
            return (
              <g key={key}>
                {/* Wide transparent hit area — no need to click the thin line precisely */}
                <path
                  className={styles.edgeHit}
                  d={d}
                  onPointerDown={(ev) => {
                    ev.stopPropagation()
                    setSelectedEdge((cur) => (cur === key ? null : key))
                  }}
                />
                <path className={styles.edge} data-selected={key === selectedEdge} d={d} />
              </g>
            )
          })}
          {drag &&
            dragFromCenter &&
            (() => {
              const snapCenter = drag.snapped ? portCenter(drag.snapped) : null
              return (
                <path
                  className={snapCenter ? styles.dragEdgeSnapped : styles.dragEdge}
                  d={edgePath(dragFromCenter, snapCenter ?? drag.cursor)}
                />
              )
            })()}
        </svg>

        {/* Highlight ring on the magnet-snapped port */}
        {drag?.snapped &&
          (() => {
            const c = portCenter(drag.snapped)
            return c ? (
              <span className={styles.snapRing} style={{ left: c.x, top: c.y }} aria-hidden />
            ) : null
          })()}

        {selected && selectedGeom && (
          <button
            type="button"
            className={styles.edgeDelete}
            style={{ left: selectedGeom.x, top: selectedGeom.y }}
            aria-label="Delete connection"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              dispatch({ type: 'edge/remove', from: selected.from, to: selected.to })
              setSelectedEdge(null)
            }}
          >
            ×
          </button>
        )}

        {/* Marquee selection box */}
        {marquee &&
          (() => {
            const r = rectFromPoints(marquee.start, marquee.end)
            return (
              <div
                className={styles.marquee}
                style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
                aria-hidden
              />
            )
          })()}

        {/* Selection toolbar — floats above the selection area */}
        {toolbarAnchor && (
          <div
            className={styles.selectionToolbar}
            style={{ left: toolbarAnchor.x, top: toolbarAnchor.y }}
          >
            <NodeToolbar
              actions={toolbar.actions}
              onCopy={() => copySelection('token')}
              copied={copied}
              onDuplicate={duplicateSelection}
              onDelete={removeSelection}
              onRun={runSelection}
              onExport={exportSelection}
            />
          </div>
        )}

        {Object.values(graph.nodes).map((gn) => {
          const common = {
            nodeId: gn.id,
            selected: graph.selection.has(gn.id),
            dragFrom: dragFromProp,
            onPortDown: (portName: string, e: PointerEvent) => startDrag(gn.id, portName, e),
            onPortUp: (portName: string) => completeDrag(gn.id, portName),
          }
          const model = modelOf(gn)
          return (
            <div
              key={gn.id}
              className={styles.node}
              data-node-id={gn.id}
              style={{ left: gn.x, top: gn.y }}
              onPointerDown={(e) => beginNodeDrag(gn.id, e)}
            >
              {gn.kind === 'asset' ? (
                <AssetNode
                  kind={gn.ref as AssetKind}
                  media={gn.values.media as MediaValue | undefined}
                  generating={gn.values.generating === true}
                  progressNote={gn.values.progressNote as string | undefined}
                  error={gn.values.error as string | undefined}
                  items={
                    Array.isArray(gn.values.items)
                      ? (gn.values.items as (GalleryItem | null)[])
                      : undefined
                  }
                  selectedIndex={gn.values.selected as number | undefined}
                  onSelectItem={(i) => selectGalleryItem(gn.id, i)}
                  onItemDragStart={(i, e) => startItemDrag(gn.id, i, e)}
                  hasInPort={gn.values.sourceNode !== undefined}
                  connectedIn={connectionsOf(graph, gn.id)[RESULT_IN_PORT]}
                  connectedOut={connectionsOf(graph, gn.id)[OUT_PORT]}
                  onCancel={gn.values.generating === true ? () => cancelNode(gn.id) : undefined}
                  width={gn.values.__w as number | undefined}
                  onResize={(w) =>
                    dispatch({ type: 'node/setValue', id: gn.id, name: '__w', value: w })
                  }
                  onMediaChange={(m) =>
                    dispatch({ type: 'node/setValue', id: gn.id, name: 'media', value: m })
                  }
                  {...common}
                />
              ) : model ? (
                <NodeCard
                  model={model}
                  status={(gn.values.__status as NodeStatus) ?? 'idle'}
                  estimate={estimates[gn.id]}
                  onEstimate={() => requestEstimate(gn.id)}
                  errorNote={
                    gn.values.__status === 'error'
                      ? (gn.values.__error as string | undefined)
                      : undefined
                  }
                  values={gn.values}
                  connections={connectionsOf(graph, gn.id)}
                  edgeItems={incomingByPort(graph, gn.id)}
                  onChange={(name, value) =>
                    dispatch({ type: 'node/setValue', id: gn.id, name, value })
                  }
                  onEdgeRemove={(portName, from) =>
                    dispatch({ type: 'edge/remove', from, to: `${gn.id}:${portName}` })
                  }
                  {...common}
                />
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Gallery item drag-out ghost — follows the cursor outside the world transform */}
      {itemDrag?.active &&
        (() => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (!rect) return null
          return (
            <div
              className={styles.itemGhost}
              style={{ left: itemDrag.cursor.x - rect.left - 36, top: itemDrag.cursor.y - rect.top - 36 }}
            >
              {itemDrag.item.mime.startsWith('video/') ? (
                <video src={itemDrag.item.url} muted playsInline preload="metadata" />
              ) : (
                <img src={itemDrag.item.url} alt="" />
              )}
            </div>
          )
        })()}

      {/* View controls — zoom out / scale / zoom in / reset */}
      <div className={styles.viewBar}>
        <button
          type="button"
          className={styles.viewButton}
          aria-label="Zoom out"
          onClick={() => setVp((v) => zoomAtViewCenter(v, containerRef.current, 1 / 1.2))}
        >
          −
        </button>
        <span className={styles.viewScale}>{Math.round(vp.scale * 100)}%</span>
        <button
          type="button"
          className={styles.viewButton}
          aria-label="Zoom in"
          onClick={() => setVp((v) => zoomAtViewCenter(v, containerRef.current, 1.2))}
        >
          +
        </button>
        <button
          type="button"
          className={styles.viewButton}
          aria-label="Reset to 100%"
          onClick={() => setVp(IDENTITY)}
        >
          ⌖
        </button>
      </div>
    </div>
  )
})

function zoomAtViewCenter(vp: Viewport, el: HTMLElement | null, factor: number): Viewport {
  if (!el) return vp
  const r = el.getBoundingClientRect()
  return zoomAt(vp, { x: r.width / 2, y: r.height / 2 }, factor)
}
