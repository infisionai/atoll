import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { TerminalPanel, type TerminalHandle, type TerminalStatus } from './TerminalPanel'

const meta = {
  title: 'Terminal/TerminalPanel',
  component: TerminalPanel,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TerminalPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Demo that verifies rendering, theme, and input flow with a local echo — no PTY */
function EchoDemo({ status: initial }: { status: TerminalStatus }) {
  const handle = useRef<TerminalHandle>(null)
  const [width, setWidth] = useState(420)
  const [status, setStatus] = useState<TerminalStatus>(initial)
  const greeted = useRef(false)

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-canvas)' }}>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
        Canvas area (drag the left edge to resize)
      </div>
      <TerminalPanel
        ref={(h) => {
          handle.current = h
          if (h && !greeted.current) {
            greeted.current = true
            h.write('\x1b[38;2;47;201;190mAtoll\x1b[0m terminal demo — input is echoed as-is\r\n')
            h.write('$ ')
          }
        }}
        title="Claude Code"
        status={status}
        width={width}
        onWidthChange={setWidth}
        onInput={(d) => {
          // Local echo: on newline, redraw the prompt
          if (d === '\r') handle.current?.write('\r\n$ ')
          else if (d === '\x7f') handle.current?.write('\b \b')
          else handle.current?.write(d)
        }}
        onStartAgent={() => setStatus('running')}
        onClose={() => setStatus('exited')}
      />
    </div>
  )
}

export const Running: Story = {
  args: { title: 'Claude Code', status: 'running', width: 420 },
  render: () => <EchoDemo status="running" />,
}

export const Starting: Story = {
  args: { title: 'Claude Code', status: 'starting', width: 420 },
  render: () => <EchoDemo status="starting" />,
}

export const Exited: Story = {
  args: { title: 'Claude Code', status: 'exited', width: 420 },
  render: () => <EchoDemo status="exited" />,
}

/* Agent picker — the centered picker shown when there is no session */
export const AgentPicker: Story = {
  args: { status: 'exited', width: 420 },
  render: () => {
    function WithAgent() {
      const [width, setWidth] = useState(420)
      return (
        <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-canvas)' }}>
          <div style={{ flex: 1 }} />
          <TerminalPanel
            status="exited"
            agent="claude"
            onStartAgent={() => {}}
            onStop={() => {}}
            width={width}
            onWidthChange={setWidth}
          />
        </div>
      )
    }
    return <WithAgent />
  },
}
