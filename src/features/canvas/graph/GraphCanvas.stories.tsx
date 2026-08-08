import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ModelSpec } from '../model-spec'
import models from '../mocks/models.json'
import { GraphCanvas } from './GraphCanvas'
import { buildGraph, type NodeDef } from './graph-build'
import type { GraphEdge } from './graph-state'

const catalog = models as ModelSpec[]

const story = (defs: NodeDef[], edges: GraphEdge[] = []) => ({
  catalog,
  initialGraph: buildGraph(catalog, defs, edges),
})

const meta = {
  title: 'Canvas/GraphCanvas',
  component: GraphCanvas,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof GraphCanvas>

export default meta
type Story = StoryObj<typeof meta>

/*
 * Grab and drag the image output port and a dashed line follows.
 * Type rule: an image output only plugs into an "input image" (image) port.
 * Delete = remove selection, Cmd-D = duplicate, selecting shows the action toolbar above.
 */
export const DragConnect: Story = {
  args: story([
    { id: 'a', model: 'nano_banana_2', x: 32, y: 48 },
    { id: 'b', model: 'cinematic_studio_video_v2', x: 480, y: 32 },
  ]),
}

/* Connection already established — image output → start frame slot (per-role slot fields) */
export const Connected: Story = {
  args: story(
    [
      { id: 'a', model: 'nano_banana_2', x: 32, y: 48 },
      { id: 'b', model: 'cinematic_studio_video_v2', x: 480, y: 32 },
    ],
    [{ from: 'a:__out', to: 'b:medias.start_image' }],
  ),
}

/* Asset node source — feeds an image asset into a generation node's media input */
export const AssetSource: Story = {
  args: story(
    [
      { id: 'img1', asset: 'image', x: 48, y: 64 },
      { id: 'vid1', asset: 'video', x: 48, y: 330 },
      { id: 'b', model: 'cinematic_studio_video_v2', x: 420, y: 48 },
    ],
    [{ from: 'img1:__out', to: 'b:medias.start_image' }],
  ),
}

/* Multi-reference input — outputs of two nodes stack as connection tiles in flux.2's reference image tile row */
export const MultiReference: Story = {
  args: story(
    [
      { id: 'a', model: 'nano_banana_2', x: 32, y: 48 },
      { id: 'c', model: 'seedream_v4_5', x: 32, y: 470 },
      { id: 'b', model: 'flux_2', x: 480, y: 200 },
    ],
    [
      { from: 'a:__out', to: 'b:medias' },
      { from: 'c:__out', to: 'b:medias' },
    ],
  ),
}
