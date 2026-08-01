import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusBadge } from './StatusBadge'

const meta = {
  title: 'Canvas/StatusBadge',
  component: StatusBadge,
} satisfies Meta<typeof StatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = { args: { status: 'idle' } }
export const Running: Story = { args: { status: 'running' } }
export const Done: Story = { args: { status: 'done' } }
export const ErrorState: Story = { args: { status: 'error' } }
