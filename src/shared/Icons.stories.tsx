import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconClipboard,
  IconClose,
  IconTerminal,
  IconPause,
  IconStop,
  IconCube,
  IconVolume,
  IconVolumeMute,
  IconDots,
  IconDuplicate,
  IconFileExport,
  IconGear,
  IconHome,
  IconLink,
  IconLock,
  IconPin,
  IconPlay,
  IconPlus,
  IconSpinnerArc,
  IconTrash,
  IconUpload,
  IconWand,
} from './icons'

const CATALOG = [
  ['home', IconHome, 'Tab bar home'],
  ['gear', IconGear, 'Settings'],
  ['clipboard', IconClipboard, 'Copy to agent'],
  ['check', IconCheck, 'Copied / done'],
  ['duplicate', IconDuplicate, 'Duplicate'],
  ['pin', IconPin, 'Pin'],
  ['wand', IconWand, 'AI assist'],
  ['play', IconPlay, 'Run'],
  ['spinner-arc', IconSpinnerArc, 'Progress (rotation is applied at the call site)'],
  ['file-export', IconFileExport, 'Export'],
  ['trash', IconTrash, 'Delete'],
  ['upload', IconUpload, 'Upload / dropzone'],
  ['link', IconLink, 'Connected'],
  ['lock', IconLock, 'Locked when disconnected'],
  ['alert', IconAlert, 'Error / warning'],
  ['chevron-down', IconChevronDown, 'Expand'],
  ['dots', IconDots, 'Card menu'],
  ['plus', IconPlus, 'Add'],
  ['close', IconClose, 'Close'],
  ['terminal', IconTerminal, 'Terminal — agent console'],
  ['pause', IconPause, 'Pause'],
  ['stop', IconStop, 'Stop — end session'],
  ['cube', IconCube, '3D object'],
  ['volume', IconVolume, 'Volume'],
  ['volume-mute', IconVolumeMute, 'Muted'],
] as const

function IconBoard() {
  return (
    <div style={{ display: 'grid', gap: 24, maxWidth: 720 }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        Spec: 16×16 viewBox · stroke 1.4 · round cap/join · currentColor. Add new icons here
        first instead of creating inline SVGs.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        {CATALOG.map(([name, Icon, usage]) => (
          <div
            key={name}
            style={{
              display: 'grid',
              justifyItems: 'center',
              gap: 8,
              padding: 16,
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-surface)',
            }}
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', color: 'var(--text-primary)' }}>
              <Icon width={16} height={16} />
              <Icon width={24} height={24} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
              {name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{usage}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const meta = {
  title: 'Design/Icons',
  component: IconBoard,
} satisfies Meta<typeof IconBoard>

export default meta
type Story = StoryObj<typeof meta>

export const All: Story = {}
