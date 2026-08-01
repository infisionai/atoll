import { IconLink } from '../../shared/icons'
import { type PointerEvent } from 'react'
import { FormField, type MediaValue } from './fields/FormField'
import { compatible, type PortValueType } from './graph/connect-rules'
import { EDIT_OPS, type EditOpId } from './graph/edit-ops'
import { Port } from './Port'
import { StatusBadge, type NodeStatus } from './StatusBadge'
import styles from './EditNode.module.css'

/** Input port name (single) */
export const EDIT_IN_PORT = 'input'

interface EditNodeProps {
  op: EditOpId
  status: NodeStatus
  values: Record<string, unknown>
  selected?: boolean
  nodeId?: string
  /** Upstream source connected to the input port (max 1) */
  inputFrom?: string
  connectedOut?: boolean
  dragFrom?: { nodeId: string; type: PortValueType }
  /** Preview of the finished result */
  result?: MediaValue
  onChange: (name: string, value: unknown) => void
  onEdgeRemove?: (from: string) => void
  onPortDown?: (portName: string, e: PointerEvent) => void
  onPortUp?: (portName: string) => void
}

/**
 * Edit node — applies an edit operation (upscale, background removal, outpaint) to one media input and outputs it.
 * Editing tools translated into node-graph grammar: lineage is kept, re-runs and chaining work.
 */
export function EditNode({
  op,
  status,
  values,
  selected,
  nodeId,
  inputFrom,
  connectedOut,
  dragFrom,
  result,
  onChange,
  onEdgeRemove,
  onPortDown,
  onPortUp,
}: EditNodeProps) {
  const spec = EDIT_OPS[op]

  const inputConnectable =
    spec.input !== null &&
    dragFrom !== undefined &&
    dragFrom.nodeId !== nodeId &&
    compatible(dragFrom.type, spec.input)

  return (
    <article className={styles.card} data-selected={selected}>
      <header className={styles.header}>
        <StatusBadge status={status} />
        {/* Confirmed credits as ⚡N (Higgsfield Audio pattern), otherwise the cost-characteristics text */}
        <span className={styles.cost} data-credits={spec.credits !== undefined}>
          {spec.credits !== undefined ? `⚡ ${spec.credits}` : spec.costNote}
        </span>
      </header>

      <div className={styles.titleRow}>
        <h3 className={styles.title}>{spec.name}</h3>
        <span className={styles.tool}>{spec.mcpTool}</span>
        {spec.input !== null && (
          <Port
            direction="in"
            className={styles.inPortPos}
            id={nodeId ? `${nodeId}:${EDIT_IN_PORT}` : undefined}
            connected={inputFrom !== undefined}
            candidate={inputConnectable}
            dimmed={dragFrom !== undefined && !inputConnectable}
            onPointerDown={onPortDown ? (e) => onPortDown(EDIT_IN_PORT, e) : undefined}
            onPointerUp={onPortUp ? () => onPortUp(EDIT_IN_PORT) : undefined}
          />
        )}
        <Port
          direction="out"
          className={styles.outPortPos}
          id={nodeId ? `${nodeId}:__out` : undefined}
          connected={connectedOut}
          dimmed={dragFrom !== undefined}
          onPointerDown={onPortDown ? (e) => onPortDown('__out', e) : undefined}
          onPointerUp={onPortUp ? () => onPortUp('__out') : undefined}
        />
      </div>

      <div className={styles.body}>
        {spec.input === null ? null : inputFrom ? (
          <div className={styles.inputChip}>
            <IconLink className={styles.linkIcon} />
            <span className={styles.inputName}>{inputFrom}</span>
            {onEdgeRemove && (
              <button
                type="button"
                className={styles.inputRemove}
                aria-label="Remove connection"
                onClick={() => onEdgeRemove(inputFrom)}
              >
                ×
              </button>
            )}
          </div>
        ) : (
          <div className={styles.inputHint}>
            Connect {spec.input === 'audio' ? 'audio' : spec.input === 'video' ? 'video' : 'an image'} to
            the input port
          </div>
        )}

        {spec.fields.map((f) => (
          <FormField key={f.name} field={f} value={values[f.name]} onChange={onChange} />
        ))}

        {result && (
          <div className={styles.result}>
            <img className={styles.resultThumb} src={result.url} alt={result.name} />
            <span className={styles.resultName}>{result.name}</span>
          </div>
        )}
      </div>
    </article>
  )
}
