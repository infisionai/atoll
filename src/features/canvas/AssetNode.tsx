import {
  IconAlert,
  IconCube,
  IconFileExport,
  IconPause,
  IconPlay,
  IconUpload,
  IconVolume,
  IconVolumeMute,
} from '../../shared/icons'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Port } from './Port'
import { StatusBadge } from './StatusBadge'
import { ModelViewer } from './ModelViewer'
import { GalleryGrid } from './GalleryGrid'
import type { MediaValue } from './fields/FormField'
import type { GalleryItem } from './graph/gallery'
import type { PortValueType } from './graph/connect-rules'
import styles from './AssetNode.module.css'

export type AssetKind = 'image' | 'video' | 'audio' | '3d'

/** Input port of a generation-result node — marks the connection to the generating model */
export const RESULT_IN_PORT = '__in'

const KIND_LABEL: Record<AssetKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  '3d': '3D',
}
const KIND_ACCEPT: Record<AssetKind, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  '3d': '.glb,.gltf',
}

interface AssetNodeProps {
  kind: AssetKind
  media?: MediaValue
  selected?: boolean
  /** Generation result in progress — skeleton + generating badge */
  generating?: boolean
  /** Supplementary progress info (e.g. "about 2 min · Seedance 2.0") */
  progressNote?: string
  /** Generation failure reason — its presence shows the failure UI */
  error?: string
  /** Node identifier in the graph — used to look up port DOM */
  nodeId?: string
  /** Whether the output port is connected */
  connectedOut?: boolean
  /** Generation-result node — shows an input port on the left (connection to the generating node) */
  hasInPort?: boolean
  /** Whether the input port is connected */
  connectedIn?: boolean
  /** Port drag in progress — asset output ports aren't drag targets, so they dim */
  dragFrom?: { nodeId: string; type: PortValueType }
  /** Node width (px) — changed via resize. Falls back to the standard width token */
  width?: number
  /** Change width by dragging the bottom-right handle — no handle is shown without it */
  onResize?: (width: number) => void
  onMediaChange: (media: MediaValue | undefined) => void
  onCancel?: () => void
  onPortDown?: (portName: string, e: PointerEvent) => void
  onPortUp?: (portName: string) => void
  /** Batch (gallery) result — present means this node renders the tile grid instead of a single preview */
  items?: (GalleryItem | null)[]
  /** Gallery selection — the item feeding the OUT port */
  selectedIndex?: number
  onSelectItem?: (index: number) => void
  /** Drag a gallery item out — the canvas extracts it into a standalone node */
  onItemDragStart?: (index: number, e: PointerEvent) => void
}

/** Resize width limits — a range that keeps canvas density intact */
export const ASSET_MIN_WIDTH = 160
export const ASSET_MAX_WIDTH = 560

/** Video preview — first frame + play button, no autoplay. Only what's clicked plays, with sound */
function VideoPreview({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }
  return (
    <>
      <video
        ref={ref}
        className={styles.thumb}
        src={url}
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => {
          // WKWebView doesn't paint a frame before playback — seek slightly to force the first frame
          e.currentTarget.currentTime = 0.01
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted)
          setVolume(e.currentTarget.volume)
        }}
        onClick={toggle}
      />
      {!playing && (
        <button type="button" className={styles.playOverlay} aria-label="Play" onClick={toggle}>
          <IconPlay width={16} height={16} />
        </button>
      )}
      <div className={styles.videoControls}>
        <button
          type="button"
          className={styles.muteButton}
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={muted}
          onClick={() => {
            const v = ref.current
            if (v) v.muted = !v.muted
          }}
        >
          {muted || volume === 0 ? (
            <IconVolumeMute width={13} height={13} />
          ) : (
            <IconVolume width={13} height={13} />
          )}
        </button>
        <input
          type="range"
          className={styles.volume}
          aria-label="Volume"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const v = ref.current
            if (!v) return
            const next = Number(e.target.value)
            v.volume = next
            v.muted = next === 0
          }}
        />
      </div>
    </>
  )
}

/** Seconds → m:ss */
function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Audio playback bar — play/pause + seeking + time */
function AudioPreview({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const toggle = () => {
    const a = ref.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }
  return (
    <div className={styles.audioBar}>
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <button
        type="button"
        className={styles.audioPlay}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={toggle}
      >
        {playing ? <IconPause width={13} height={13} /> : <IconPlay width={13} height={13} />}
      </button>
      <input
        type="range"
        className={styles.volume}
        aria-label="Seek"
        min={0}
        max={duration || 1}
        step={0.1}
        value={time}
        onChange={(e) => {
          const a = ref.current
          if (a) a.currentTime = Number(e.target.value)
        }}
      />
      <span className={styles.audioTime}>
        {formatTime(time)}/{formatTime(duration)}
      </span>
    </div>
  )
}

/** 3D media — try the viewer, fall back to a file card on failure */
function ModelPreview({ media }: { media: MediaValue }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <FileCard media={media} />
  return (
    <div className={styles.modelWrap}>
      <ModelViewer url={media.url} onError={() => setFailed(true)} />
      <button
        type="button"
        className={styles.fileOpen}
        style={{ position: 'absolute', left: 6, bottom: 6 }}
        title="Open file"
        onClick={() => window.open(media.url, '_blank')}
      >
        <IconFileExport width={13} height={13} />
      </button>
    </div>
  )
}

/** Files that can't be previewed (3D, etc.) — download card */
function FileCard({ media }: { media: MediaValue }) {
  return (
    <div className={styles.fileCard}>
      <IconCube className={styles.fileIcon} width={22} height={22} />
      <span className={styles.fileName}>{media.name}</span>
      <button
        type="button"
        className={styles.fileOpen}
        title="Open file"
        onClick={() => window.open(media.url, '_blank')}
      >
        <IconFileExport width={13} height={13} />
      </button>
    </div>
  )
}

/** Asset node — a source node that holds an image/video file and supplies it via the output port */
export function AssetNode({
  kind,
  media,
  selected,
  generating,
  progressNote,
  error,
  nodeId,
  connectedOut,
  hasInPort,
  connectedIn,
  dragFrom,
  width,
  onResize,
  onMediaChange,
  onCancel,
  onPortDown,
  onPortUp,
  items,
  selectedIndex,
  onSelectItem,
  onItemDragStart,
}: AssetNodeProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [resizing, setResizing] = useState(false)
  const cardRef = useRef<HTMLElement>(null)

  // The arrival moment — the emotional peak of the app. When generating settles
  // into media, the card takes one glow breath and the result fades into place
  const wasGenerating = useRef(!!generating)
  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    const was = wasGenerating.current
    wasGenerating.current = !!generating
    if (was && !generating && media) {
      setArrived(true)
      const t = window.setTimeout(() => setArrived(false), 1400)
      return () => window.clearTimeout(t)
    }
  }, [generating, media])

  const startResize = (e: PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = width ?? cardRef.current?.getBoundingClientRect().width ?? 208
    setResizing(true)
    const onMove = (ev: globalThis.PointerEvent) => {
      // Aspect-locked scaling — dragging diagonally/vertically still grows naturally via the dominant-axis delta
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy
      const next = Math.min(ASSET_MAX_WIDTH, Math.max(ASSET_MIN_WIDTH, startWidth + delta))
      onResize?.(next)
    }
    const onUp = () => {
      setResizing(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const pick = (file: File | undefined) => {
    if (!file) return
    if (media?.url.startsWith('blob:')) URL.revokeObjectURL(media.url)
    onMediaChange({ name: file.name, url: URL.createObjectURL(file), mime: file.type })
  }

  const remove = () => {
    if (media?.url.startsWith('blob:')) URL.revokeObjectURL(media.url)
    onMediaChange(undefined)
  }

  return (
    <article
      ref={cardRef}
      className={styles.card}
      data-selected={selected}
      data-status={error ? 'error' : generating ? 'generating' : undefined}
      data-arrived={arrived || undefined}
      style={width !== undefined ? { width } : undefined}
    >
      <header className={styles.header}>
        <span className={styles.kind}>{KIND_LABEL[kind]}</span>
        {!generating && !error && media && <span className={styles.filename}>{media.name}</span>}
        {generating && <StatusBadge status="running" />}
        {error && <StatusBadge status="error" />}
      </header>

      {error ? (
        <div className={styles.errorBox}>
          <IconAlert className={styles.errorIcon} />
          <p className={styles.errorMessage}>{error}</p>
        </div>
      ) : items ? (
        <>
          <GalleryGrid
            items={items}
            generating={generating}
            selectedIndex={selectedIndex}
            onSelect={onSelectItem}
            onItemDragStart={onItemDragStart}
          />
          {generating && onCancel && (
            <div className={styles.galleryFooter}>
              <span className={styles.progressNote}>{progressNote ?? 'Generating…'}</span>
              <button
                type="button"
                className={styles.cancel}
                title="Stops tracking and removes the node — a generation already submitted may still use credits"
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
          )}
        </>
      ) : generating ? (
        <div className={styles.skeleton}>
          <span className={styles.progressNote}>{progressNote ?? 'Generating…'}</span>
          {onCancel && (
            <button
              type="button"
              className={styles.cancel}
              title="Stops tracking and removes the node — a generation already submitted may still use credits"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      ) : media ? (
        <div className={styles.preview}>
          {media.mime.startsWith('video/') ? (
            <VideoPreview url={media.url} />
          ) : media.mime.startsWith('audio/') ? (
            <AudioPreview url={media.url} />
          ) : media.mime.startsWith('image/') ? (
            <img
              key={media.url}
              className={styles.thumb}
              src={media.url}
              alt={media.name}
              ref={(el) => {
                // Cached images may never fire onLoad — show immediately if complete
                if (el?.complete) el.dataset.loaded = 'true'
              }}
              onLoad={(e) => {
                e.currentTarget.dataset.loaded = 'true'
              }}
            />
          ) : media.mime.startsWith('model/') || /\.(glb|gltf)(\?|$)/i.test(media.url) ? (
            <ModelPreview media={media} />
          ) : (
            <FileCard media={media} />
          )}
          <button type="button" className={styles.remove} aria-label="Remove file" onClick={remove}>
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.drop}
          data-dragover={dragOver}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            pick(e.dataTransfer.files[0])
          }}
        >
          <IconUpload className={styles.dropIcon} />
          <span>
            Drop {KIND_LABEL[kind].toLowerCase()} file or
            <br />
            click to select
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={KIND_ACCEPT[kind]}
        className={styles.input}
        onChange={(e) => {
          pick(e.target.files?.[0] ?? undefined)
          e.target.value = ''
        }}
      />

      {hasInPort && (
        <Port
          direction="in"
          className={styles.inPortPos}
          id={nodeId ? `${nodeId}:${RESULT_IN_PORT}` : undefined}
          connected={connectedIn}
        />
      )}

      {onResize && !generating && (
        <div
          className={styles.resizeHandle}
          data-resize
          data-active={resizing}
          title="Resize"
          onPointerDown={startResize}
        >
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
            <path
              d="M9 1L1 9M9 5L5 9"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
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
    </article>
  )
}
