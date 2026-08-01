import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { IconClose, IconStop } from '../../shared/icons'
import { AGENT_PROFILES, type AgentId } from './agent-profiles'
import { HANGUL, setupKoreanIme, type KoreanIme } from './korean-ime'
import { atollTerminalTheme } from './terminal-theme'
import styles from './TerminalPanel.module.css'

export type TerminalStatus = 'starting' | 'running' | 'exited'

const STATUS_LABEL: Record<TerminalStatus, string> = {
  starting: 'Starting',
  running: 'Running',
  exited: 'Exited',
}

/** Handle for external code (the PTY bridge) to write output into the terminal */
export interface TerminalHandle {
  write: (data: string | Uint8Array) => void
  clear: () => void
}

interface TerminalPanelProps {
  /** Session name — displayed when no agent is selected */
  title?: string
  status: TerminalStatus
  /** Current agent — for the header label */
  agent?: AgentId
  /** When there is no session (exited), start with an agent from the centered picker */
  onStartAgent?: (agent: AgentId) => void
  /** User keystrokes (forwarded to PTY stdin) */
  onInput?: (data: string) => void
  /** Viewport size change (forwarded as a PTY resize) */
  onResize?: (cols: number, rows: number) => void
  /** Stop the running session — used before switching agents */
  onStop?: () => void
  onClose?: () => void
  /** Panel width (px) — owned by the parent */
  width: number
  onWidthChange?: (width: number) => void
}

const MIN_WIDTH = 320
const MAX_WIDTH = 800

/** Detects WKWebView (Tauri macOS / Safari) — not needed on Chromium, where composition events work correctly */
const IS_WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)

/** Terminal panel docked to the right of the canvas — rendered with Xterm.js. PTY wiring is kept separate via the handle and callbacks */
export const TerminalPanel = forwardRef<TerminalHandle, TerminalPanelProps>(function TerminalPanel(
  { title, status, agent, onStartAgent, onInput, onResize, onStop, onClose, width, onWidthChange },
  handleRef,
) {
  const mountRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const inputRef = useRef(onInput)
  inputRef.current = onInput
  const resizeRef = useRef(onResize)
  resizeRef.current = onResize

  useImperativeHandle(handleRef, () => ({
    write: (data) => termRef.current?.write(data),
    clear: () => termRef.current?.clear(),
  }))

  // Create the Xterm instance — once per mount
  useEffect(() => {
    const el = mountRef.current!
    const term = new Terminal({
      fontFamily: getComputedStyle(el).getPropertyValue('--font-mono').trim() || 'monospace',
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      theme: atollTerminalTheme(el),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()

    // Korean IME — WKWebView delivers the composition via input events instead of composition
    // events (see korean-ime.ts). Hold the syllable being composed as pending, and drop the
    // broken jamo coming through onData
    let ime: KoreanIme | null = null
    let previewEl: HTMLDivElement | null = null
    if (IS_WEBKIT) {
      previewEl = document.createElement('div')
      previewEl.className = styles.imePreview
      document.body.appendChild(previewEl)
      ime = setupKoreanIme(term, { writePty: (d) => inputRef.current?.(d), previewEl })
      term.onData((data) => {
        const code = data.charCodeAt(0)
        const isControl =
          data.length === 0 || code < 0x20 || code === 0x7f || data.startsWith('\x1b')
        // Single Hangul characters (jamo/syllables) leaked by xterm during composition are owned by the IME machine — drop them
        if (!isControl && data.length === 1 && HANGUL.test(data)) return
        ime!.commitPending()
        inputRef.current?.(data)
        ime!.render()
      })
    } else {
      term.onData((d) => inputRef.current?.(d))
    }

    term.onResize(({ cols, rows }) => resizeRef.current?.(cols, rows))
    termRef.current = term
    fitRef.current = fit
    return () => {
      ime?.dispose()
      previewEl?.remove()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  // Panel width / container size changes → refit
  useEffect(() => {
    const el = mountRef.current
    if (!el) return
    const observer = new ResizeObserver(() => fitRef.current?.fit())
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Drag-resize on the left edge
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX)))
      onWidthChange?.(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <aside className={styles.panel} style={{ width }} aria-label="Agent terminal">
      <div className={styles.resizeHandle} onPointerDown={startResize} />

      <header className={styles.header}>
        <span className={styles.statusDot} data-status={status} />
        <span className={styles.title}>
          {AGENT_PROFILES.find((p) => p.id === agent)?.label ?? title}
        </span>
        <span className={styles.statusLabel}>{STATUS_LABEL[status]}</span>
        <div className={styles.actions}>
          {status === 'running' && onStop && (
            <button
              type="button"
              className={styles.action}
              title="End session — you can switch agents afterwards"
              onClick={onStop}
            >
              <IconStop width={13} height={13} />
            </button>
          )}
          {onClose && (
            <button type="button" className={styles.action} title="Close panel" onClick={onClose}>
              <IconClose width={13} height={13} />
            </button>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <div ref={mountRef} className={styles.terminal} />
        {status === 'exited' && onStartAgent && (
          <div className={styles.pickerOverlay}>
            <div className={styles.picker}>
              <span className={styles.pickerTitle}>Pick an agent to start a session</span>
              {AGENT_PROFILES.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={styles.pickerItem}
                  onClick={() => onStartAgent(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
})
