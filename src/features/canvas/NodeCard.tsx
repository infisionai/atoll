import { useMemo, useState, type PointerEvent } from 'react'
import { FormField } from './fields/FormField'
import { buildFormSpec } from './form-spec'
import { compatible, type PortValueType } from './graph/connect-rules'
import type { ModelSpec } from './model-spec'
import { Port } from './Port'
import { StatusBadge, type NodeStatus } from './StatusBadge'
import { IconSpinnerArc } from '../../shared/icons'
import styles from './NodeCard.module.css'

/** Credit display — integers as-is, decimals to two places */
function formatCredits(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** Field name of the output port */
export const OUT_PORT = '__out'

/** MCP provider display names — makes which account/credits get spent visible right on the node */
const MCP_PROVIDER_LABEL: Record<string, string> = {
  higgsfield: 'Higgsfield',
  magnific: 'Magnific',
  kling: 'Kling',
  elevenlabs: 'ElevenLabs',
}

interface NodeCardProps {
  model: ModelSpec
  status: NodeStatus
  values: Record<string, unknown>
  selected?: boolean
  /** Pre-run estimate — get_cost preflight result (credits). 'loading' means the lookup is in flight */
  estimate?: number | 'loading'
  /** $ badge click — fetch an estimate (free). Display-only when absent */
  onEstimate?: () => void
  /** Run failure reason — shown under the header when status is error */
  errorNote?: string
  /** Node identifier in the graph — used for port DOM lookup (`data-port`) */
  nodeId?: string
  /** Field name → whether upstream is connected (output port under the OUT_PORT key) */
  connections?: Record<string, boolean>
  /** Field name → connected upstream sources (shown as media tiles/chips) */
  edgeItems?: Record<string, string[]>
  /** Port drag in progress — only type-compatible input ports glow as candidates, the rest dim */
  dragFrom?: { nodeId: string; type: PortValueType }
  onChange: (name: string, value: unknown) => void
  /** Remove a media field's connection tile */
  onEdgeRemove?: (portName: string, from: string) => void
  /** Drag start on a port (portName: field name or OUT_PORT) */
  onPortDown?: (portName: string, e: PointerEvent) => void
  /** Drag end over a port */
  onPortUp?: (portName: string) => void
  /** AI assist for prompt-like fields (Claude Code integration planned) */
  onAssist?: (fieldName: string) => void
}

/** Generation node card — auto-generates the form from the model spec */
export function NodeCard({
  model,
  status,
  values,
  selected,
  estimate,
  onEstimate,
  errorNote,
  nodeId,
  connections,
  edgeItems,
  dragFrom,
  onChange,
  onEdgeRemove,
  onPortDown,
  onPortUp,
  onAssist,
}: NodeCardProps) {
  const spec = useMemo(() => buildFormSpec(model), [model])
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const portConfig = (portName: string, portType: PortValueType) => {
    // While dragging, connection rules split candidates from ineligible ports. Output ports are always ineligible during a drag
    const connectable =
      dragFrom !== undefined &&
      portName !== OUT_PORT &&
      dragFrom.nodeId !== nodeId &&
      compatible(dragFrom.type, portType)
    const count = edgeItems?.[portName]?.length ?? 0
    return {
      id: nodeId ? `${nodeId}:${portName}` : undefined,
      connected: connections?.[portName] || count > 0,
      candidate: connectable,
      dimmed: dragFrom !== undefined && !connectable,
      count,
      onPointerDown: onPortDown ? (e: PointerEvent) => onPortDown(portName, e) : undefined,
      onPointerUp: onPortUp ? () => onPortUp(portName) : undefined,
    }
  }

  const renderField = (f: (typeof spec.basic)[number]) => (
    <FormField
      key={f.name}
      field={f}
      value={values[f.name]}
      onChange={onChange}
      port={f.connectable ? portConfig(f.name, f.portType) : undefined}
      edgeItems={edgeItems?.[f.name]}
      onEdgeRemove={onEdgeRemove ? (from) => onEdgeRemove(f.name, from) : undefined}
      onAssist={onAssist ? () => onAssist(f.name) : undefined}
    />
  )

  const outType: PortValueType =
    model.output_type === 'image' ||
    model.output_type === 'video' ||
    model.output_type === 'audio' ||
    model.output_type === '3d'
      ? model.output_type
      : 'image'

  return (
    <article className={styles.card} data-selected={selected}>
      <header className={styles.header}>
        <StatusBadge status={status} />
        <span className={styles.mcpProvider} title="MCP Provider">
          {MCP_PROVIDER_LABEL[model.provider ?? 'higgsfield'] ?? model.provider}
        </span>
        {estimate === 'loading' ? (
          <span className={`${styles.cost} ${styles.costLoading}`} title="Fetching estimate">
            <IconSpinnerArc width={11} height={11} />
          </span>
        ) : typeof estimate === 'number' ? (
          <button
            type="button"
            className={`${styles.cost} ${styles.costKnown}`}
            title="Pre-run estimate — click to check again"
            onClick={onEstimate}
          >
            ⚡ {formatCredits(estimate)} cr
          </button>
        ) : (
          <button
            type="button"
            className={styles.cost}
            title="Check pre-run estimate — uses no credits (required inputs needed)"
            onClick={onEstimate}
            disabled={!onEstimate}
          >
            $
          </button>
        )}
      </header>

      {errorNote && <p className={styles.errorNote}>{errorNote}</p>}

      <div className={styles.titleRow}>
        <h3 className={styles.title}>{model.name}</h3>
        <span className={styles.provider}>{model.provider_name}</span>
        <Port direction="out" className={styles.outPortPos} {...portConfig(OUT_PORT, outType)} />
      </div>

      <div className={styles.body}>
        {spec.basic.map(renderField)}

        {spec.advanced.length > 0 && (
          <>
            <button
              type="button"
              className={styles.advancedToggle}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              <span className={styles.advancedDash} aria-hidden />
              Advanced Parameters ({spec.advanced.length})
              <span className={styles.advancedChevron} data-open={advancedOpen} aria-hidden>
                ⌄
              </span>
              <span className={styles.advancedDash} aria-hidden />
            </button>
            {advancedOpen && spec.advanced.map(renderField)}
          </>
        )}
      </div>
    </article>
  )
}
