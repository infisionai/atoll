import { IconAlert, IconPlay } from '../../shared/icons'
import type { PointerEvent } from 'react'
import type { GalleryItem } from './graph/gallery'
import styles from './GalleryGrid.module.css'

interface GalleryGridProps {
  /** Slot-indexed batch results — null slots are pending (generating) or failed (settled) */
  items: (GalleryItem | null)[]
  /** Batch still collecting — empty slots render as shimmer skeletons instead of failed tiles */
  generating?: boolean
  /** Index feeding the OUT port — exactly one tile glows */
  selectedIndex?: number
  onSelect?: (index: number) => void
  /** Drag an item out of the gallery — the canvas turns the drop into a standalone asset node */
  onItemDragStart?: (index: number, e: PointerEvent) => void
}

/** Batch result gallery — square tile grid inside an asset node card */
export function GalleryGrid({
  items,
  generating,
  selectedIndex,
  onSelect,
  onItemDragStart,
}: GalleryGridProps) {
  return (
    <div className={styles.grid} role="listbox" aria-label="Generated results">
      {items.map((item, i) =>
        item ? (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={i === selectedIndex}
            className={styles.tile}
            data-selected={i === selectedIndex}
            title={`${item.name} — drag out to extract`}
            onClick={() => onSelect?.(i)}
            onPointerDown={(e) => onItemDragStart?.(i, e)}
          >
            {item.mime.startsWith('video/') ? (
              <>
                <video className={styles.thumb} src={item.url} preload="metadata" muted playsInline />
                <span className={styles.playGlyph} aria-hidden>
                  <IconPlay width={12} height={12} />
                </span>
              </>
            ) : (
              <img className={styles.thumb} src={item.url} alt={item.name} draggable={false} />
            )}
          </button>
        ) : generating ? (
          <div key={i} className={styles.pending} aria-label="Generating" />
        ) : (
          <div key={i} className={styles.failed} aria-label="Failed" title="This result failed">
            <IconAlert width={13} height={13} />
          </div>
        ),
      )}
    </div>
  )
}
