import type { Meta, StoryObj } from '@storybook/react-vite'
import { NodeToolbar } from './NodeToolbar'

const noop = () => {}
const handlers = {
  onCopy: noop,
  onDuplicate: noop,
  onRun: noop,
  onExport: noop,
  onDelete: noop,
}

const meta = {
  title: 'Canvas/NodeToolbar',
  component: NodeToolbar,
  args: handlers,
} satisfies Meta<typeof NodeToolbar>

export default meta
type Story = StoryObj<typeof meta>

/* Generation (model) node selected — copy, duplicate, run, delete */
export const ModelNode: Story = {
  args: { actions: ['copy', 'duplicate', 'run', 'delete'] },
}

/* Only edit nodes selected — run visible but disabled (run not wired up yet) */
export const EditNode: Story = {
  args: { actions: ['copy', 'duplicate', 'run', 'delete'], runDisabled: true },
}

/* Empty asset node — copy, duplicate, delete only */
export const AssetNode: Story = {
  args: { actions: ['copy', 'duplicate', 'delete'] },
}

/* Asset node holding a result — export added */
export const ResultNode: Story = {
  args: { actions: ['copy', 'duplicate', 'export', 'delete'] },
}

/* Multi-select union — model + result asset */
export const MultiSelect: Story = {
  args: { actions: ['copy', 'duplicate', 'run', 'export', 'delete'] },
}

/* Running — the play button turns into a spinner and disables */
export const Running: Story = {
  args: { actions: ['copy', 'duplicate', 'run', 'delete'], running: true },
}

/* Right after copying for an agent — the clipboard icon briefly turns into a check */
export const Copied: Story = {
  args: { actions: ['copy', 'duplicate', 'export', 'delete'], copied: true },
}
