/**
 * Voice preset registry + preview.
 *
 * The real Higgsfield voice sample audio isn't available over MCP (to be replaced once
 * sample URLs are obtained), so for now the browser's built-in speech synthesis
 * (speechSynthesis) demonstrates the tonal differences between presets.
 * No network or credit usage.
 */

export interface VoicePreset {
  id: string
  /** Gender label (as shown in the Higgsfield picker) */
  gender: 'Female' | 'Male'
  /** Preview synthesis parameters — imitates the tonal differences between presets */
  pitch: number
  rate: number
}

export const VOICE_PRESETS: VoicePreset[] = [
  { id: 'EMILY', gender: 'Female', pitch: 1.3, rate: 1.0 },
  { id: 'JOHN', gender: 'Male', pitch: 0.8, rate: 0.95 },
  { id: 'NAOMI', gender: 'Female', pitch: 1.15, rate: 1.1 },
  { id: 'CALLUM', gender: 'Male', pitch: 0.7, rate: 0.9 },
  { id: 'ONYX', gender: 'Female', pitch: 0.95, rate: 0.85 },
  { id: 'BRAM', gender: 'Male', pitch: 0.6, rate: 1.0 },
  { id: 'PIXIE', gender: 'Female', pitch: 1.5, rate: 1.15 },
  { id: 'GRANT', gender: 'Male', pitch: 0.85, rate: 1.05 },
]

export const voicePresetOf = (id: string): VoicePreset | undefined =>
  VOICE_PRESETS.find((v) => v.id === id)

const SAMPLE_TEXT = 'Hello, this is an Atoll voice preview.'

/** Play a preview — calls onEnd on finish or failure. Any previous playback stops automatically */
export function previewVoice(preset: VoicePreset, onEnd: () => void): void {
  if (!('speechSynthesis' in window)) {
    onEnd()
    return
  }
  stopPreview()
  const u = new SpeechSynthesisUtterance(SAMPLE_TEXT)
  u.lang = 'en-US'
  u.pitch = preset.pitch
  u.rate = preset.rate
  u.onend = () => onEnd()
  u.onerror = () => onEnd()
  window.speechSynthesis.speak(u)
}

export function stopPreview(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
