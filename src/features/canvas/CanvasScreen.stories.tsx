import type { Meta, StoryObj } from '@storybook/react-vite'
import { CanvasScreen } from './CanvasScreen'
import { buildGraph } from './graph/graph-build'
import { buildProviders, flattenCatalog } from './library/providers'
import type { ModelSpec } from './model-spec'
import models from './mocks/models.json'

const providers = buildProviders(models as ModelSpec[])
const catalog = flattenCatalog(providers)

const meta = {
  title: 'Canvas/CanvasScreen',
  component: CanvasScreen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CanvasScreen>

export default meta
type Story = StoryObj<typeof meta>

/* Empty canvas — click a basic node or model in the sidebar to add it */
export const EmptyCanvas: Story = {
  args: { providers },
}

/* Canvas with work in progress */
export const Working: Story = {
  args: {
    providers,
    initialGraph: buildGraph(
      catalog,
      [
        { id: 'src', asset: 'image', x: 60, y: 140 },
        { id: 'gen', model: 'nano_banana_2', x: 360, y: 80 },
      ],
      [{ from: 'src:__out', to: 'gen:medias' }],
    ),
  },
}

/* Unconnected — the model catalog is locked until the MCP is connected */
export const Disconnected: Story = {
  args: {
    providers: providers.map((p) => ({ ...p, connected: false })),
    onOpenSettings: () => {},
  },
}
