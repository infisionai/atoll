import type { Meta, StoryObj } from '@storybook/react-vite'
import { WorkspaceThumbnail } from './WorkspaceThumbnail'

/** Sample media for stories (no external dependencies) */
export const SAMPLE_MEDIA =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c1519"/><stop offset="1" stop-color="#2fc9be"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`,
  )

const meta = {
  title: 'Dashboard/WorkspaceThumbnail',
  component: WorkspaceThumbnail,
  // SAMPLE_MEDIA is shared fixture data, not a story — CSF must skip it
  excludeStories: ['SAMPLE_MEDIA'],
  decorators: [
    (Story) => (
      <div
        style={{
          width: 288,
          aspectRatio: '16 / 10',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WorkspaceThumbnail>

export default meta
type Story = StoryObj<typeof meta>

export const EmptyCanvas: Story = { args: { doc: null } }

export const NodesOnly: Story = {
  args: {
    doc: {
      nodes: [
        { id: 'a', kind: 'asset', ref: 'image', x: 0, y: 120, values: {} },
        { id: 'm', kind: 'model', ref: 'x', x: 320, y: 0, values: {} },
        { id: 'r', kind: 'asset', ref: 'image', x: 740, y: 160, values: {} },
      ],
      edges: [
        { from: 'a:__out', to: 'm:medias' },
        { from: 'm:__out', to: 'r:__result' },
      ],
    },
  },
}

export const WithResultImage: Story = {
  args: {
    doc: {
      nodes: [
        { id: 'm', kind: 'model', ref: 'x', x: 0, y: 20, values: {} },
        {
          id: 'r',
          kind: 'asset',
          ref: 'image',
          x: 380,
          y: 40,
          values: { media: { name: 'Result', url: SAMPLE_MEDIA, mime: 'image/png' } },
        },
      ],
      edges: [{ from: 'm:__out', to: 'r:__in' }],
    },
  },
}
