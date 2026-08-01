import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { AssetNode, type AssetKind } from './AssetNode'
import type { MediaValue } from './fields/FormField'

/** Sample image for stories — lagoon gradient SVG (no external dependency) */
const SAMPLE_IMAGE: MediaValue = {
  name: 'lagoon_sample.svg',
  mime: 'image/svg+xml',
  url:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%230c1519"/><stop offset="0.6" stop-color="%232fc9be"/><stop offset="1" stop-color="%237be8de"/></linearGradient></defs><rect width="400" height="240" fill="url(%23g)"/></svg>`.replace(
        /%23/g,
        '#',
      ),
    ),
}

function Interactive({ kind, initial }: { kind: AssetKind; initial?: MediaValue }) {
  const [media, setMedia] = useState<MediaValue | undefined>(initial)
  return <AssetNode kind={kind} media={media} onMediaChange={setMedia} />
}

const meta = {
  title: 'Canvas/AssetNode',
  component: Interactive,
} satisfies Meta<typeof Interactive>

export default meta
type Story = StoryObj<typeof meta>

export const EmptyImage: Story = { args: { kind: 'image' } }

/* Resize — adjust width by dragging the bottom-right handle (handle shows on hover/select, turns lagoon when grabbed) */
export const Resize: Story = {
  args: { kind: 'image', initial: SAMPLE_IMAGE },
  render: () => {
    function Resizable() {
      const [width, setWidth] = useState<number | undefined>(undefined)
      return (
        <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
          <AssetNode
            kind="image"
            media={SAMPLE_IMAGE}
            width={width}
            onResize={setWidth}
            onMediaChange={() => {}}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {width ? `${Math.round(width)}px` : 'Default width (208px) — drag the bottom-right handle'}
          </span>
        </div>
      )
    }
    return <Resizable />
  },
}

export const FilledImage: Story = { args: { kind: 'image', initial: SAMPLE_IMAGE } }

export const EmptyVideo: Story = { args: { kind: 'video' } }

/* Audio result — playback bar (play/seek/time) */
export const Audio: Story = {
  args: { kind: 'audio' },
  render: () => (
    <AssetNode
      kind="audio"
      media={{
        name: 'voiceover.mp3',
        mime: 'audio/mpeg',
        // Silent 0.1s wav — no external dependency
        url:
          'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=',
      }}
      onMediaChange={() => {}}
    />
  ),
}

/* 3D result — three.js orbit viewer (lagoon cube sample, drag to rotate) */
export const ThreeD: Story = {
  args: { kind: '3d' },
  render: () => (
    <AssetNode
      kind="3d"
      media={{
        name: 'sample_cube.glb',
        mime: 'model/gltf-binary',
        url: 'data:model/gltf-binary;base64,Z2xURgIAAACEBQAA4AIAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAifSwic2NlbmUiOjAsInNjZW5lcyI6W3sibm9kZXMiOlswXX1dLCJub2RlcyI6W3sibWVzaCI6MH1dLCJtZXNoZXMiOlt7InByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjAsIk5PUk1BTCI6MX0sImluZGljZXMiOjIsIm1hdGVyaWFsIjowfV19XSwibWF0ZXJpYWxzIjpbeyJwYnJNZXRhbGxpY1JvdWdobmVzcyI6eyJiYXNlQ29sb3JGYWN0b3IiOlswLjE4LDAuNzksMC43NSwxLjBdLCJtZXRhbGxpY0ZhY3RvciI6MC4xLCJyb3VnaG5lc3NGYWN0b3IiOjAuNn19XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6NjQ4fV0sImJ1ZmZlclZpZXdzIjpbeyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjAsImJ5dGVMZW5ndGgiOjI4OH0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjI4OCwiYnl0ZUxlbmd0aCI6Mjg4fSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6NTc2LCJieXRlTGVuZ3RoIjo3Mn1dLCJhY2Nlc3NvcnMiOlt7ImJ1ZmZlclZpZXciOjAsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwidHlwZSI6IlZFQzMiLCJtaW4iOlstMC41LC0wLjUsLTAuNV0sIm1heCI6WzAuNSwwLjUsMC41XX0seyJidWZmZXJWaWV3IjoxLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsInR5cGUiOiJWRUMzIn0seyJidWZmZXJWaWV3IjoyLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MzYsInR5cGUiOiJTQ0FMQVIifV19ICAgiAIAAEJJTgAAAAC/AAAAvwAAAD8AAAA/AAAAvwAAAD8AAAA/AAAAPwAAAD8AAAC/AAAAPwAAAD8AAAA/AAAAvwAAAL8AAAC/AAAAvwAAAL8AAAC/AAAAPwAAAL8AAAA/AAAAPwAAAL8AAAA/AAAAvwAAAD8AAAA/AAAAvwAAAL8AAAA/AAAAPwAAAL8AAAA/AAAAPwAAAD8AAAC/AAAAvwAAAL8AAAC/AAAAvwAAAD8AAAC/AAAAPwAAAD8AAAC/AAAAPwAAAL8AAAC/AAAAPwAAAD8AAAA/AAAAPwAAAD8AAAA/AAAAPwAAAL8AAAC/AAAAPwAAAL8AAAC/AAAAvwAAAL8AAAA/AAAAvwAAAL8AAAA/AAAAvwAAAD8AAAC/AAAAvwAAAD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAEAAgAAAAIAAwAEAAUABgAEAAYABwAIAAkACgAIAAoACwAMAA0ADgAMAA4ADwAQABEAEgAQABIAEwAUABUAFgAUABYAFwA=',
      }}
      onMediaChange={() => {}}
    />
  ),
}

/* 3D load failure — file card fallback */
export const ThreeDFallback: Story = {
  args: { kind: '3d' },
  render: () => (
    <AssetNode
      kind="3d"
      media={{ name: 'broken.glb', mime: 'model/gltf-binary', url: '#' }}
      onMediaChange={() => {}}
    />
  ),
}

export const Selected: Story = {
  args: { kind: 'image', initial: SAMPLE_IMAGE },
  render: (args) => (
    <AssetNode kind={args.kind} media={args.initial} selected connectedOut onMediaChange={() => {}} />
  ),
}

/* Generation result forming — shimmer skeleton + generating badge + cancel */
export const Generating: Story = {
  args: { kind: 'video' },
  render: () => (
    <AssetNode
      kind="video"
      generating
      progressNote="About 2 min · Cinema Studio Video"
      onCancel={() => {}}
      onMediaChange={() => {}}
    />
  ),
}

/* Generation failure — coral signal + reason */
export const Failed: Story = {
  args: { kind: 'image' },
  render: () => (
    <AssetNode
      kind="image"
      error="Insufficient credits. Please check your balance."
      onMediaChange={() => {}}
    />
  ),
}
