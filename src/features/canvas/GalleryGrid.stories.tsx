import type { Meta, StoryObj } from '@storybook/react-vite'
import { GalleryGrid } from './GalleryGrid'
import type { GalleryItem } from './graph/gallery'

const img = (seed: number): GalleryItem => ({
  name: `result-${seed}.png`,
  url:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="hsl(${seed * 47}, 35%, 22%)"/><text x="80" y="88" text-anchor="middle" fill="#eaf4f4" font-family="monospace" font-size="28">${seed}</text></svg>`,
    ),
  mime: 'image/png',
  jobId: `job-${seed}`,
})

const meta = {
  title: 'Canvas/GalleryGrid',
  component: GalleryGrid,
  decorators: [
    (Story) => (
      <div style={{ width: 300, padding: 16, background: 'var(--bg-surface)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GalleryGrid>

export default meta
type Story = StoryObj<typeof meta>

/* All results arrived — first item selected (feeds the OUT port) */
export const Complete: Story = {
  args: { items: [img(1), img(2), img(3), img(4)], selectedIndex: 0 },
}

/* Mid-generation — arrived items mixed with shimmer skeleton slots */
export const PartiallyArrived: Story = {
  args: { items: [img(1), null, img(3), null], generating: true },
}

/* One job failed — settled empty slot goes quiet, not shouting */
export const WithFailedSlot: Story = {
  args: { items: [img(1), null, img(3)], selectedIndex: 2 },
}

/* Later selection — the glow moves with the OUT-port feed */
export const ThirdSelected: Story = {
  args: { items: [img(1), img(2), img(3)], selectedIndex: 2 },
}
