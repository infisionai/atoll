import type { Meta, StoryObj } from '@storybook/react-vite'
import { BusyButton } from './BusyButton'
import { Spinner } from './Spinner'

function SpinnerBoard() {
  const delay = (ms: number) => () => new Promise((r) => setTimeout(r, ms))
  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
    minWidth: 84,
  }
  return (
    <div style={{ display: 'grid', gap: 28, maxWidth: 520 }}>
      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Sizes</h3>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', color: 'var(--text-primary)' }}>
          <Spinner size={12} />
          <Spinner size={14} />
          <Spinner size={18} />
          <Spinner size={24} />
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
          BusyButton — spinner from click until completion (rule: no async buttons without feedback)
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <BusyButton style={buttonStyle} onClick={delay(1500)}>
            Refresh balance
          </BusyButton>
          <BusyButton style={buttonStyle} onClick={delay(2500)}>
            Disconnect
          </BusyButton>
        </div>
      </section>
    </div>
  )
}

const meta = {
  title: 'Design/Spinner',
  component: SpinnerBoard,
} satisfies Meta<typeof SpinnerBoard>

export default meta
type Story = StoryObj<typeof meta>

export const All: Story = {}
