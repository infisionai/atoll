import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { NodeCard } from './NodeCard'
import { NodeToolbar } from './NodeToolbar'
import { buildFormSpec, initialValues } from './form-spec'
import type { ModelSpec } from './model-spec'
import type { NodeStatus } from './StatusBadge'
import models from './mocks/models.json'

const catalog = models as ModelSpec[]
const byId = (id: string): ModelSpec => {
  const m = catalog.find((x) => x.id === id)
  if (!m) throw new Error(`Model not in mocks: ${id}`)
  return m
}

/** Interactive wrapper verifying form auto-generation with real catalog models */
function Interactive({
  model,
  status = 'idle',
  connections,
}: {
  model: ModelSpec
  status?: NodeStatus
  connections?: Record<string, boolean>
}) {
  const [values, setValues] = useState(() => initialValues(buildFormSpec(model)))
  return (
    <NodeCard
      model={model}
      status={status}
      values={values}
      connections={connections}
      onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
      onAssist={() => {}}
    />
  )
}

const meta = {
  title: 'Canvas/NodeCard',
  component: Interactive,
} satisfies Meta<typeof Interactive>

export default meta
type Story = StoryObj<typeof meta>

/* Segment (resolution) + ratio select — a simple image model */
export const NanoBanana: Story = {
  args: { model: byId('nano_banana_2') },
}

/* Slider (cfg_scale), toggle, prompt — a video model with varied parameters */
export const CinematicVideo: Story = {
  args: { model: byId('cinematic_studio_video_v2') },
}

/* Edge cases like number ranges and tag arrays — a 3D model */
export const ImageTo3D: Story = {
  args: { model: byId('image_to_3d') },
}

/* Run failure — badge + reason under the header (coral) */
export const ErrorState: Story = {
  args: { model: byId('nano_banana_2') },
  render: (args) => (
    <NodeCard
      model={args.model}
      status="error"
      errorNote="Missing required inputs: prompt"
      values={initialValues(buildFormSpec(args.model))}
      onChange={() => {}}
    />
  ),
}

export const Generating: Story = {
  args: { model: byId('nano_banana_2'), status: 'running' },
}

/* Prompt port connected to upstream */
export const Connected: Story = {
  args: {
    model: byId('cinematic_studio_video_v2'),
    connections: { prompt: true, __out: true },
  },
}

/* When selected: the action toolbar floats above the node */
export const Selected: Story = {
  args: { model: byId('nano_banana_2') },
  render: (args) => (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
      <NodeToolbar
        actions={['duplicate', 'run', 'delete']}
        onDuplicate={() => {}}
        onRun={() => {}}
        onDelete={() => {}}
      />
      <NodeCard
        model={args.model}
        status="idle"
        values={initialValues(buildFormSpec(args.model))}
        selected
        onChange={() => {}}
      />
    </div>
  ),
}
