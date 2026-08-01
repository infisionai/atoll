import { IconLink, IconUpload, IconWand } from '../../../shared/icons'
import { useRef, useState } from 'react'
import { Port, type PortConfig } from '../Port'
import type { FieldSpec } from '../form-spec'
import { VoiceField } from './VoiceField'
import styles from './FormField.module.css'

/** Media field item — result of a local file pick (replaced by a real upload at the Tauri stage) */
export interface MediaValue {
  name: string
  url: string
  mime: string
  /** Real path of the local cache file — used in the `File:` line of the agent reference text (node-reference) */
  localPath?: string
}

const ACCEPT: Record<string, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
}

/** Normalize a media field value to an array — accepts legacy single values too */
export function mediaItems(value: unknown): MediaValue[] {
  if (Array.isArray(value)) return value as MediaValue[]
  if (value) return [value as MediaValue]
  return []
}

interface FormFieldProps {
  field: FieldSpec
  value: unknown
  onChange: (name: string, value: unknown) => void
  /** Left input port (for graph connections) */
  port?: PortConfig
  /** Upstream sources connected to this field (media only — shown as connection tiles) */
  edgeItems?: string[]
  /** Remove a connection tile */
  onEdgeRemove?: (from: string) => void
  /** AI assist button for prompt-like fields (hidden when absent) */
  onAssist?: () => void
}

/** Renders the right control for the FieldSpec kind. No logic — decisions belong to form-spec.ts */
export function FormField({
  field,
  value,
  onChange,
  port,
  edgeItems,
  onEdgeRemove,
  onAssist,
}: FormFieldProps) {
  const set = (v: unknown) => onChange(field.name, v)

  return (
    <div className={styles.field}>
      {port && <Port direction="in" className={styles.portPos} {...port} />}
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={field.name}>
          {field.label}
        </label>
        {field.required && <span className={styles.required}>*</span>}
        {field.description && (
          <span className={styles.help} title={field.description}>
            ?
          </span>
        )}
        {onAssist && field.kind === 'textarea' && (
          <button type="button" className={styles.assist} title="AI assist" onClick={onAssist}>
            <IconWand className={styles.assistIcon} />
          </button>
        )}
      </div>
      <Control field={field} value={value} set={set} edgeItems={edgeItems} onEdgeRemove={onEdgeRemove} />
    </div>
  )
}

function Control({
  field,
  value,
  set,
  edgeItems,
  onEdgeRemove,
}: {
  field: FieldSpec
  value: unknown
  set: (v: unknown) => void
  edgeItems?: string[]
  onEdgeRemove?: (from: string) => void
}) {
  switch (field.kind) {
    case 'textarea':
      return (
        <textarea
          id={field.name}
          className={styles.input}
          rows={4}
          value={(value as string) ?? ''}
          onChange={(e) => set(e.target.value)}
        />
      )
    case 'text':
      return (
        <input
          id={field.name}
          className={styles.input}
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => set(e.target.value)}
        />
      )
    case 'number':
      return (
        <input
          id={field.name}
          className={styles.input}
          type="number"
          min={field.min}
          max={field.max}
          value={(value as number) ?? ''}
          onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      )
    case 'slider': {
      const num = typeof value === 'number' ? value : (field.default as number) ?? field.min ?? 0
      const step = sliderStep(field.min ?? 0, field.max ?? 1)
      return (
        <div className={styles.sliderRow}>
          <input
            id={field.name}
            className={styles.slider}
            type="range"
            min={field.min}
            max={field.max}
            step={step}
            value={num}
            onChange={(e) => set(Number(e.target.value))}
          />
          <span className={styles.sliderValue}>{num}</span>
        </div>
      )
    }
    case 'segment':
      return (
        <div className={styles.segment} role="radiogroup">
          {field.options?.map((opt) => (
            <button
              key={opt}
              type="button"
              className={styles.segmentButton}
              data-selected={value === opt}
              onClick={() => set(value === opt ? undefined : opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )
    case 'select': {
      const hasValue = value !== undefined && value !== ''
      return (
        <div className={styles.selectWrap}>
          <select
            id={field.name}
            className={`${styles.input} ${styles.select}`}
            value={(value as string) ?? ''}
            onChange={(e) => set(e.target.value === '' ? undefined : e.target.value)}
          >
            <option value="">None</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {hasValue && (
            <button
              type="button"
              className={styles.clear}
              aria-label="Clear selection"
              onClick={() => set(undefined)}
            >
              ×
            </button>
          )}
          <span className={styles.chevron} aria-hidden>
            ⌄
          </span>
        </div>
      )
    }
    case 'toggle': {
      const on = value === true
      return (
        <button
          id={field.name}
          type="button"
          role="switch"
          aria-checked={on}
          className={styles.toggle}
          data-on={on}
          onClick={() => set(!on)}
        >
          <span className={styles.knob} />
        </button>
      )
    }
    case 'voice':
      return (
        <VoiceField
          id={field.name}
          value={value as string | undefined}
          onChange={(v) => set(v)}
        />
      )
    case 'media':
      return (
        <MediaField
          field={field}
          value={value}
          set={set}
          edgeItems={edgeItems}
          onEdgeRemove={onEdgeRemove}
        />
      )
    case 'tags': {
      const tags = Array.isArray(value) ? (value as string[]) : []
      return (
        <div>
          {tags.length > 0 && (
            <div className={styles.tags}>
              {tags.map((t, i) => (
                <span key={`${t}-${i}`} className={styles.tag}>
                  {t}
                  <button
                    type="button"
                    className={styles.tagRemove}
                    aria-label={`Remove ${t}`}
                    onClick={() => set(tags.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            id={field.name}
            className={styles.input}
            type="text"
            placeholder="Type and press Enter"
            onKeyDown={(e) => {
              const el = e.currentTarget
              if (e.key === 'Enter' && el.value.trim()) {
                set([...tags, el.value.trim()])
                el.value = ''
              }
            }}
          />
        </div>
      )
    }
  }
}

/** Step 1 for integer ranges, 0.05 for fractional ranges like 0–1 */
function sliderStep(min: number, max: number): number {
  return max - min <= 1 ? 0.05 : 1
}

/**
 * Media input — click to pick a file, or drag and drop one.
 * Connected upstream outputs (edgeItems) and local files appear mixed in the same place.
 * Multiple fields get a tile row ([+], thumbnails, connection tiles); single fields get one slot.
 */
function MediaField({
  field,
  value,
  set,
  edgeItems = [],
  onEdgeRemove,
}: {
  field: FieldSpec
  value: unknown
  set: (v: unknown) => void
  edgeItems?: string[]
  onEdgeRemove?: (from: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const items = mediaItems(value)

  const max = field.multiple ? (field.maxItems ?? Infinity) : 1
  const total = items.length + edgeItems.length
  const canAdd = total < max

  const addFiles = (files: FileList | File[]) => {
    const room = max - total
    const picked = [...files]
      .slice(0, Math.max(0, room))
      .map((f) => ({ name: f.name, url: URL.createObjectURL(f), mime: f.type }))
    if (picked.length > 0) set([...items, ...picked])
  }

  const removeAt = (i: number) => {
    const target = items[i]
    if (target?.url.startsWith('blob:')) URL.revokeObjectURL(target.url)
    const next = items.filter((_, j) => j !== i)
    set(next.length > 0 ? next : undefined)
  }

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(true)
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      addFiles(e.dataTransfer.files)
    },
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT[field.portType]}
      multiple={field.multiple}
      className={styles.mediaInput}
      onChange={(e) => {
        if (e.target.files) addFiles(e.target.files)
        e.target.value = ''
      }}
    />
  )

  // ── Multiple — tile row ──
  if (field.multiple) {
    return (
      <div>
        <div className={styles.tileRow} {...dropProps}>
          {edgeItems.map((from) => (
            <span key={from} className={styles.tileEdge} title={`Connected: ${from}`}>
              <LinkIcon />
              {onEdgeRemove && (
                <button
                  type="button"
                  className={styles.tileRemove}
                  aria-label={`Remove connection: ${from}`}
                  onClick={() => onEdgeRemove(from)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {items.map((m, i) => (
            <span key={`${m.url}-${i}`} className={styles.tile} title={m.name}>
              {m.mime.startsWith('video/') ? (
                <video className={styles.tileThumb} src={m.url} muted loop />
              ) : (
                <img className={styles.tileThumb} src={m.url} alt={m.name} />
              )}
              <button
                type="button"
                className={styles.tileRemove}
                aria-label={`Remove ${m.name}`}
                onClick={() => removeAt(i)}
              >
                ×
              </button>
            </span>
          ))}
          {canAdd && (
            <button
              type="button"
              className={styles.tileAdd}
              data-dragover={dragOver}
              aria-label="Add file"
              onClick={() => inputRef.current?.click()}
            >
              +
            </button>
          )}
        </div>
        {Number.isFinite(max) && (
          <span className={styles.tileCount}>
            {total}/{max}
          </span>
        )}
        {fileInput}
      </div>
    )
  }

  // ── Single — connection chip when a connection occupies the slot ──
  if (edgeItems.length > 0) {
    const from = edgeItems[0]
    return (
      <div className={styles.mediaPreview}>
        <div className={styles.mediaMeta}>
          <span className={styles.mediaEdgeChip}>
            <LinkIcon />
            <span className={styles.mediaName}>{from}</span>
          </span>
          {onEdgeRemove && (
            <button
              type="button"
              className={styles.mediaRemove}
              aria-label="Remove connection"
              onClick={() => onEdgeRemove(from)}
            >
              ×
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Single — preview when a file is present ──
  const media = items[0]
  if (media) {
    return (
      <div className={styles.mediaPreview}>
        {media.mime.startsWith('video/') ? (
          <video className={styles.mediaThumb} src={media.url} muted loop />
        ) : (
          <img className={styles.mediaThumb} src={media.url} alt={media.name} />
        )}
        <div className={styles.mediaMeta}>
          <span className={styles.mediaName}>{media.name}</span>
          <button
            type="button"
            className={styles.mediaRemove}
            aria-label="Remove file"
            onClick={() => removeAt(0)}
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  // ── Single — empty slot ──
  return (
    <>
      <button
        type="button"
        className={styles.mediaDrop}
        data-dragover={dragOver}
        onClick={() => inputRef.current?.click()}
        {...dropProps}
      >
        <IconUpload className={styles.mediaIcon} />
        <span>Connect an output or drop a file</span>
      </button>
      {fileInput}
    </>
  )
}

function LinkIcon() {
  return <IconLink className={styles.linkIcon} />
}
