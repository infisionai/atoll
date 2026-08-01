import type { GraphDoc } from '../../ipc/commands'
import { thumbnailLayout } from './thumbnail'
import styles from './WorkspaceThumbnail.module.css'

const VIEW_W = 160
const VIEW_H = 100

interface WorkspaceThumbnailProps {
  /** Workspace graph — renders as an empty canvas when missing or empty */
  doc?: GraphDoc | null
}

/** Dashboard card thumbnail — draws the graph as a minimap SVG (not an actual screenshot) */
export function WorkspaceThumbnail({ doc }: WorkspaceThumbnailProps) {
  const layout = thumbnailLayout(doc, VIEW_W, VIEW_H)
  if (!layout) return <div className={styles.frame} />

  return (
    <div className={styles.frame}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {layout.edges.map((e, i) => {
          const dx = Math.max(6, (e.x2 - e.x1) / 2)
          return (
            <path
              key={i}
              className={styles.edge}
              d={`M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`}
            />
          )
        })}
        {layout.nodes.map((n) =>
          n.mediaUrl ? (
            <g key={n.id}>
              <clipPath id={`thumb-clip-${n.id}`}>
                <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={2} />
              </clipPath>
              <image
                href={n.mediaUrl}
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#thumb-clip-${n.id})`}
              />
              <rect className={styles.node} x={n.x} y={n.y} width={n.w} height={n.h} rx={2} fill="none" />
            </g>
          ) : (
            <rect
              key={n.id}
              className={styles.node}
              data-kind={n.kind}
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx={2}
            />
          ),
        )}
      </svg>
    </div>
  )
}
