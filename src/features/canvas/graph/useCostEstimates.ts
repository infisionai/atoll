import { useCallback, useEffect, useRef, useState } from 'react'
import { ipc } from '../../../ipc/commands'
import type { ModelSpec } from '../model-spec'
import { buildRunParams } from './run-params'
import type { GraphState } from './graph-state'

/** Per-node estimate state — number (credits) | loading | none (not fetched, value changed, or error) */
export type CostEstimate = number | 'loading' | undefined

/**
 * Pre-run estimates — calls the get_cost preflight only when the user clicks the $ badge.
 * No automatic refetching. When node values change, only the stale estimate is cleared
 * (the price may have changed)
 */
export function useCostEstimates(graph: GraphState, catalog: ModelSpec[]) {
  const [estimates, setEstimates] = useState<Record<string, CostEstimate>>({})
  /** Parameter signature at the time the estimate was computed — a mismatch invalidates it */
  const signatures = useRef<Record<string, string>>({})
  const graphRef = useRef(graph)
  graphRef.current = graph

  // Drop stale estimates for changed or removed nodes (no network calls)
  useEffect(() => {
    const stale: string[] = []
    for (const [id, sig] of Object.entries(signatures.current)) {
      const node = graph.nodes[id]
      const model = node?.kind === 'model' ? catalog.find((m) => m.id === node.ref) : undefined
      if (!node || !model) {
        stale.push(id)
        continue
      }
      const { params, missing } = buildRunParams(graph, node, model)
      if (missing.length > 0 || JSON.stringify(params) !== sig) stale.push(id)
    }
    if (stale.length > 0) {
      for (const id of stale) delete signatures.current[id]
      setEstimates((prev) => {
        const next = { ...prev }
        for (const id of stale) delete next[id]
        return next
      })
    }
  }, [graph, catalog])

  /** $ badge click — fetch the estimate for that node */
  const request = useCallback(
    (nodeId: string) => {
      const g = graphRef.current
      const node = g.nodes[nodeId]
      const model = node?.kind === 'model' ? catalog.find((m) => m.id === node.ref) : undefined
      if (!node || !model) return
      if (model.supports_estimate === false) return
      const kind = model.output_type
      if (kind !== 'image' && kind !== 'video' && kind !== 'audio' && kind !== '3d') return

      const { params, missing } = buildRunParams(g, node, model)
      if (missing.length > 0) return

      const signature = JSON.stringify(params)
      signatures.current[nodeId] = signature
      setEstimates((prev) => ({ ...prev, [nodeId]: 'loading' }))
      void ipc.estimateCost(kind, params, model.provider).then(
        (credits) => {
          if (signatures.current[nodeId] !== signature) return
          setEstimates((prev) => ({ ...prev, [nodeId]: credits }))
        },
        (e) => {
          // Unsupported providers just quietly clear the badge (marker from commands.rs)
          if (!String(e).includes('estimate-unsupported')) console.warn('Estimate fetch failed:', e)
          if (signatures.current[nodeId] !== signature) return
          delete signatures.current[nodeId]
          setEstimates((prev) => ({ ...prev, [nodeId]: undefined }))
        },
      )
    },
    [catalog],
  )

  return { estimates, request }
}
