import { IconPlay } from '../../../shared/icons'
import { useEffect, useState } from 'react'
import { previewVoice, stopPreview, VOICE_PRESETS, voicePresetOf } from './voices'
import styles from './VoiceField.module.css'

interface VoiceFieldProps {
  id?: string
  value: string | undefined
  onChange: (value: string) => void
}

/**
 * Voice picker — not a select but an entity picker with previews (Higgsfield Audio pattern).
 * Collapsed: selected voice + play. Expanded: a grid of preset cards.
 */
export function VoiceField({ id, value, onChange }: VoiceFieldProps) {
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)

  // Stop playback on unmount
  useEffect(() => () => stopPreview(), [])

  const togglePlay = (voiceId: string) => {
    if (playing === voiceId) {
      stopPreview()
      setPlaying(null)
      return
    }
    const preset = voicePresetOf(voiceId)
    if (!preset) return
    setPlaying(voiceId)
    previewVoice(preset, () => setPlaying((cur) => (cur === voiceId ? null : cur)))
  }

  const selected = voicePresetOf(value ?? '') ?? VOICE_PRESETS[0]

  return (
    <div className={styles.field}>
      <div className={styles.selectedRow}>
        <PlayButton
          playing={playing === selected.id}
          label={`Preview ${selected.id}`}
          onClick={() => togglePlay(selected.id)}
        />
        <span className={styles.name}>{selected.id}</span>
        <span className={styles.gender}>{selected.gender}</span>
        <button
          type="button"
          id={id}
          className={styles.expand}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Collapse' : 'Change'}
          <span className={styles.chevron} data-open={open} aria-hidden>
            ⌄
          </span>
        </button>
      </div>

      {open && (
        <div className={styles.grid} role="listbox" aria-label="Voice presets">
          {VOICE_PRESETS.map((v) => (
            <div
              key={v.id}
              role="option"
              aria-selected={v.id === selected.id}
              className={styles.card}
              data-selected={v.id === selected.id}
              onClick={() => {
                onChange(v.id)
                setOpen(false)
              }}
            >
              <PlayButton
                playing={playing === v.id}
                label={`Preview ${v.id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  togglePlay(v.id)
                }}
              />
              <span className={styles.cardName}>{v.id}</span>
              <span className={styles.gender}>{v.gender}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PlayButton({
  playing,
  label,
  onClick,
}: {
  playing: boolean
  label: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      className={styles.play}
      data-playing={playing}
      aria-label={playing ? 'Stop' : label}
      onClick={onClick}
    >
      {playing ? (
        // Playing — a live signal: equalizer bars
        <span className={styles.eq} aria-hidden>
          <span />
          <span />
          <span />
        </span>
      ) : (
        <IconPlay className={styles.playIcon} />
      )}
    </button>
  )
}
