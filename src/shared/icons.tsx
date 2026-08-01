import type { SVGProps } from 'react'

/**
 * Icon set — gathers scattered inline SVGs into one place.
 * Spec: 16×16 viewbox, stroke 1.4, round cap/join, currentColor.
 * Size is set via className (CSS) or the width/height props.
 * Full catalog: the icons page in Storybook
 */

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

/** Home (tab bar) */
export function IconHome(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8.5 8 4l5 4.5M4.5 7.5V13h7V7.5" />
    </Svg>
  )
}

/** Settings — center circle + 8-way spokes */
export function IconGear(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 1.5v2.1M8 12.4v2.1M1.5 8h2.1M12.4 8h2.1M3.4 3.4l1.5 1.5M11.1 11.1l1.5 1.5M12.6 3.4l-1.5 1.5M4.9 11.1l-1.5 1.5" />
    </Svg>
  )
}

/** Duplicate */
export function IconDuplicate(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="5" width="8" height="8" rx="1.5" />
      <path d="M11 3H4.5A1.5 1.5 0 0 0 3 4.5V11" />
    </Svg>
  )
}

/** Pin */
export function IconPin(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 2h4l.5 4.5L13 9H3l2.5-2.5L6 2ZM8 9v5" />
    </Svg>
  )
}

/** AI assist (magic wand) */
export function IconWand(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.5 2.5l3 3L5 14H2v-3l8.5-8.5ZM3.5 3l1 1M13 9.5l.8.8M6 1.8l.5 1.2" />
    </Svg>
  )
}

/** Run (play) — filled */
export function IconPlay(p: IconProps) {
  return (
    <Svg stroke="none" {...p}>
      <path d="M5 3.5v9l8-4.5-8-4.5Z" fill="currentColor" />
    </Svg>
  )
}

/** Progress spinner arc — animation belongs to the call site */
export function IconSpinnerArc(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="5.5" strokeWidth={1.5} strokeDasharray="26" strokeDashoffset="18" />
    </Svg>
  )
}

/** Export (file) */
export function IconFileExport(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6L9 2Z" />
      <path d="M9 2v4h4" />
    </Svg>
  )
}

/** Copy to agent (clipboard) */
export function IconClipboard(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3" width="9" height="11" rx="1.5" />
      <path d="M6 3.5V2.5h4v1M6 7h4M6 9.5h4" />
    </Svg>
  )
}

/** Done check */
export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8.5 6.5 12 13 4.5" />
    </Svg>
  )
}

/** Delete (trash) */
export function IconTrash(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 4.5h10M6.5 4V3h3v1M5 4.5l.5 8h5l.5-8" strokeWidth={1.5} />
    </Svg>
  )
}

/** Upload */
export function IconUpload(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 10V3M8 3L5.5 5.5M8 3l2.5 2.5M3 10.5V12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 12v-1.5" />
    </Svg>
  )
}

/** Connect (link) */
export function IconLink(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.5 9.5l3-3M5 11l-1 1a2.1 2.1 0 0 1-3-3l2.5-2.5a2.1 2.1 0 0 1 3 0M11 5l1-1a2.1 2.1 0 0 1 3 3l-2.5 2.5a2.1 2.1 0 0 1-3 0" />
    </Svg>
  )
}

/** Lock (padlock) */
export function IconLock(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 7V5.5a3.5 3.5 0 0 1 7 0V7M3.5 7h9v6h-9V7Z" />
    </Svg>
  )
}

/** Warning triangle */
export function IconAlert(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 2 14.5 13.5h-13L8 2Zm0 4.2v3.6M8 11.6v.1" />
    </Svg>
  )
}

/** Chevron down */
export function IconChevronDown(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 6.5 8 10.5l4-4" />
    </Svg>
  )
}

/** Three vertical dots (card menu) */
export function IconDots(p: IconProps) {
  return (
    <Svg stroke="none" {...p}>
      <circle cx="8" cy="3.5" r="1.15" fill="currentColor" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1.15" fill="currentColor" />
    </Svg>
  )
}

/** Plus */
export function IconPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  )
}

/** Close (×) */
export function IconClose(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  )
}

/** Stop (end session) — filled square */
export function IconStop(p: IconProps) {
  return (
    <Svg stroke="none" {...p}>
      <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
    </Svg>
  )
}

/** Pause */
export function IconPause(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth="1.8" />
    </Svg>
  )
}

/** 3D cube */
export function IconCube(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 1.8 14 5v6L8 14.2 2 11V5l6-3.2Z" />
      <path d="M2 5l6 3.2L14 5M8 8.2v6" />
    </Svg>
  )
}

/** Volume — speaker + sound waves */
export function IconVolume(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 6.5h2.2L8 3.8v8.4L4.7 9.5H2.5v-3Z" />
      <path d="M10.2 5.8a3 3 0 0 1 0 4.4M12 4a5.5 5.5 0 0 1 0 8" />
    </Svg>
  )
}

/** Mute — speaker + × */
export function IconVolumeMute(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 6.5h2.2L8 3.8v8.4L4.7 9.5H2.5v-3Z" />
      <path d="M10.3 6.3l3.4 3.4M13.7 6.3l-3.4 3.4" />
    </Svg>
  )
}

/** Terminal — prompt chevron + cursor line */
export function IconTerminal(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
      <path d="M4.5 6.5 7 8.5l-2.5 2M8.5 10.5H12" />
    </Svg>
  )
}
