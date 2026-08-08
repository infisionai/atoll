import type { Meta, StoryObj } from '@storybook/react-vite'
import { NewSpaceDialog } from './NewSpaceDialog'

const meta = {
  title: 'Dashboard/NewSpaceDialog',
  component: NewSpaceDialog,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof NewSpaceDialog>

export default meta
type Story = StoryObj<typeof meta>

/* Default name pre-selected — Enter confirms as-is, typing replaces it */
export const Default: Story = {
  args: {
    onConfirm: () => new Promise((r) => setTimeout(r, 1200)),
    onCancel: () => {},
  },
}
