import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { GraphDoc } from '../../ipc/commands'
import { Dashboard } from './Dashboard'
import { SAMPLE_MEDIA } from './WorkspaceThumbnail.stories'
import type { WorkspaceMeta } from './WorkspaceCard'

const NOW = 1_753_500_000_000
const DAY = 86_400_000

const SAMPLE: WorkspaceMeta[] = [
  { id: 'w1', name: 'Culinary And Coastal Inspirations', updatedAt: NOW - 62 * DAY },
  { id: 'w2', name: 'Product color variants (Remix)', updatedAt: NOW - 29 * DAY },
  { id: 'w3', name: 'Emotional Isolation Video Concept', updatedAt: NOW - 95 * DAY },
  { id: 'w4', name: 'Untitled Space', updatedAt: NOW - 65 * DAY },
  { id: 'w5', name: 'Untitled Space', updatedAt: NOW - 100 * DAY },
]

/** Sample graphs for the card minimaps — w1 is a generation flow (with a result image), w2 is nodes only */
const GRAPHS: Record<string, GraphDoc> = {
  w1: {
    nodes: [
      { id: 'm1', kind: 'model', ref: 'nano_banana', x: 0, y: 40, values: {} },
      { id: 'r1', kind: 'asset', ref: 'image', x: 380, y: 60, values: { media: { name: 'Result', url: SAMPLE_MEDIA, mime: 'image/png' } } },
      { id: 'a1', kind: 'asset', ref: 'image', x: -280, y: 120, values: {} },
    ],
    edges: [
      { from: 'm1:__out', to: 'r1:__in' },
      { from: 'a1:__out', to: 'm1:medias' },
    ],
  },
  w2: {
    nodes: [
      { id: 'm1', kind: 'model', ref: 'x', x: 0, y: 0, values: {} },
      { id: 'a1', kind: 'asset', ref: 'image', x: 380, y: 80, values: {} },
    ],
    edges: [{ from: 'm1:__out', to: 'a1:__result' }],
  },
}

/** Interactive wrapper where the card actions (open, rename, duplicate, delete) actually work */
function Interactive({ initial }: { initial: WorkspaceMeta[] }) {
  const [list, setList] = useState(initial)
  return (
    <Dashboard
      workspaces={list}
      graphs={GRAPHS}
      now={NOW}
      onOpen={() => {}}
      onCreate={() =>
        setList((l) => [
          { id: `w${l.length + 1}-${NOW}`, name: 'Untitled Space', updatedAt: NOW },
          ...l,
        ])
      }
      onRename={(id, name) => setList((l) => l.map((w) => (w.id === id ? { ...w, name } : w)))}
      onDuplicate={(id) =>
        setList((l) => {
          const src = l.find((w) => w.id === id)
          return src
            ? [{ ...src, id: `${id}-copy-${l.length}`, name: `${src.name} (copy)`, updatedAt: NOW }, ...l]
            : l
        })
      }
      onDelete={(id) => setList((l) => l.filter((w) => w.id !== id))}
    />
  )
}

const meta = {
  title: 'Dashboard/Dashboard',
  component: Interactive,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Interactive>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { initial: SAMPLE } }

export const Empty: Story = { args: { initial: [] } }
