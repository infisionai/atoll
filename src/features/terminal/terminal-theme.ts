import type { ITheme } from '@xterm/xterm'

/**
 * Xterm theme — derived from global.css tokens so it visually matches the app.
 * CSS variables are read at mount time (Xterm cannot use CSS variables directly).
 */
export function atollTerminalTheme(el: HTMLElement): ITheme {
  const css = getComputedStyle(el)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback

  const bg = v('--bg-canvas', '#0c1519')
  const fg = v('--text-primary', '#eaf4f4')
  const accent = v('--accent', '#2fc9be')
  const accentStrong = v('--accent-strong', '#7be8de')
  const coral = v('--accent-coral', '#ff7a66')
  const muted = v('--text-muted', '#5d7079')

  return {
    background: bg,
    foreground: fg,
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: accent + '44',
    black: bg,
    brightBlack: muted,
    red: coral,
    brightRed: coral,
    green: accent,
    brightGreen: accentStrong,
    yellow: '#e8c268',
    brightYellow: '#f2d488',
    blue: '#6aa8d8',
    brightBlue: '#8fc2ea',
    magenta: '#b48ead',
    brightMagenta: '#c9a6c4',
    cyan: accentStrong,
    brightCyan: accentStrong,
    white: fg,
    brightWhite: '#ffffff',
  }
}
