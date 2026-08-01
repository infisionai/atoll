import { buildFormSpec } from '../form-spec'
import type { ModelSpec } from '../model-spec'
import { incomingByPort, type GraphNode, type GraphState } from './graph-state'

/** Shared parameter collection for run/estimate — runNode and the get_cost estimate must see the same values */
export interface RunParams {
  params: Record<string, unknown>
  /** Names of empty required scalar fields — any present blocks running/estimating */
  missing: string[]
}

export function buildRunParams(state: GraphState, node: GraphNode, model: ModelSpec): RunParams {
  const spec = buildFormSpec(model)
  const allFields = [...spec.basic, ...spec.advanced]

  const missing = allFields
    .filter((f) => f.required && f.kind !== 'media' && !node.values[f.name])
    .map((f) => f.name)

  // Scalar values only (media and internal keys excluded)
  const params: Record<string, unknown> = { model: node.ref }
  for (const f of allFields) {
    if (f.kind === 'media') continue
    const v = node.values[f.name]
    if (v !== undefined && v !== '') params[f.name] = v
  }

  // Upstream generation results (job_id) → medias
  const medias: Array<{ value: string; role: string }> = []
  const incoming = incomingByPort(state, node.id)
  for (const f of allFields.filter((f) => f.kind === 'media')) {
    for (const from of incoming[f.name] ?? []) {
      const src = state.nodes[from.split(':')[0]]
      const jobId = src?.values.jobId as string | undefined
      if (jobId) medias.push({ value: jobId, role: f.role ?? 'image' })
    }
  }
  if (medias.length > 0) params.medias = medias

  return { params, missing }
}
