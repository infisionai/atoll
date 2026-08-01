/* korean-ime.ts — Korean IME state machine for macOS WKWebView.
 *
 * WKWebView does not fire DOM composition events for the Korean IME; instead it delivers the
 * composition via `input` events (insertText / insertReplacementText) on xterm's helper textarea.
 * Since xterm relies on composition events, we drive the PTY ourselves: hold the syllable being
 * composed in `pending`, and commit it when a new syllable starts, on a terminating character,
 * or on a control key.
 * The preview (previewEl) is display-only — it never writes to the PTY/xterm buffer, so it is
 * safe even in fullscreen TUIs. */
import type { Terminal } from '@xterm/xterm'

// Hangul ranges: Jamo, Compatibility Jamo, Syllables, Jamo Extended-A/-B
export const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힣ힰ-퟿]/

/** Pure state transition — how a single input event changes pending and what it commits */
export function imeStep(
  pending: string,
  inputType: string,
  data: string,
): { pending: string; commit?: string } {
  if (!HANGUL.test(data)) return { pending }
  if (inputType === 'insertText') {
    // A new input cell starts — the previously composed syllable is finalized
    return { pending: data, commit: pending || undefined }
  }
  // insertReplacementText/insertCompositionText: in-composition replacement (아→안→…)
  // Other types (backspace decomposition, etc.) also carry the new composition value as data
  return { pending: data }
}

export interface KoreanIme {
  commitPending(): void
  render(): void
  dispose(): void
}

/** Wires the IME machine into an xterm instance. `writePty` sends finalized syllables to the PTY */
export function setupKoreanIme(
  term: Terminal,
  opts: { writePty: (d: string) => void; previewEl: HTMLDivElement },
): KoreanIme {
  // xterm's hidden textarea — it follows the cursor cell, so its screen rect is the cursor position
  const ta = term.textarea
  const el = opts.previewEl

  let pending = '' // Syllable being composed — held until commit

  function commitPending() {
    if (pending) {
      opts.writePty(pending)
      pending = ''
    }
  }

  // In-composition preview — WKWebView has no compositionend, so nothing shows on screen
  // until the PTY echo. We draw it ourselves at the cursor position (textarea rect)
  function render() {
    if (!ta || !pending) {
      el.style.display = 'none'
      return
    }
    const r = ta.getBoundingClientRect()
    el.textContent = pending
    el.style.left = `${r.left}px`
    el.style.top = `${r.top}px`
    el.style.height = `${r.height}px`
    el.style.lineHeight = `${r.height}px`
    el.style.display = 'block'
  }

  // The PTY echo of the just-committed character moves the cursor — reposition the preview on every render
  const renderDisp = term.onRender(() => render())

  const onInput = (e: Event) => {
    const ie = e as InputEvent
    const next = imeStep(pending, ie.inputType, ie.data ?? '')
    if (next.commit) opts.writePty(next.commit)
    pending = next.pending
    render()
  }

  if (ta) ta.addEventListener('input', onInput)

  return {
    commitPending,
    render,
    dispose() {
      renderDisp.dispose()
      if (ta) ta.removeEventListener('input', onInput)
    },
  }
}
