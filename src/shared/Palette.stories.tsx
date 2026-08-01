import type { Meta, StoryObj } from '@storybook/react-vite'

/** Only token names are listed — the actual colors come from the CSS variables in global.css */
const GROUPS: Array<{ title: string; tokens: Array<[name: string, usage: string]> }> = [
  {
    title: 'Surfaces — deep sea',
    tokens: [
      ['--bg-canvas', 'Canvas background'],
      ['--bg-surface', 'Nodes and panels'],
      ['--bg-surface-raised', 'Floating elements (menus, toolbars)'],
      ['--bg-input', 'Input field interior'],
    ],
  },
  {
    title: 'Borders',
    tokens: [
      ['--border-default', 'Default border'],
      ['--border-focus', 'Focus border (= lagoon)'],
    ],
  },
  {
    title: 'Text — sea foam',
    tokens: [
      ['--text-primary', 'Body text'],
      ['--text-secondary', 'Secondary description'],
      ['--text-muted', 'Disabled and hints'],
    ],
  },
  {
    title: 'Accent — lagoon · coral',
    tokens: [
      ['--accent', 'Primary accent: selection, run, links'],
      ['--accent-strong', 'Brighter accent step (hover, etc.)'],
      ['--accent-coral', 'Secondary accent: destructive actions and warnings only'],
    ],
  },
  {
    title: 'Status',
    tokens: [
      ['--status-idle', 'Idle'],
      ['--status-running', 'Generating'],
      ['--status-done', 'Done'],
      ['--status-error', 'Error'],
    ],
  },
  {
    title: 'Interaction',
    tokens: [
      ['--bg-hover', 'Hover background'],
      ['--bg-selected', 'Selected background (lagoon 12%)'],
      ['--text-on-accent', 'Text on lagoon'],
    ],
  },
  {
    title: 'Depth and light',
    tokens: [
      ['--shadow-raised', 'Shadow for floating elements'],
      ['--glow-accent', 'Glow for live signals'],
    ],
  },
]

function Swatch({ token, usage }: { token: string; usage: string }) {
  const isDepth = token.startsWith('--shadow') || token.startsWith('--glow')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 56,
          height: 40,
          borderRadius: 8,
          background: isDepth ? 'var(--bg-surface-raised)' : `var(${token})`,
          boxShadow: isDepth ? `var(${token})` : undefined,
          border: '1px solid var(--border-default)',
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{token}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{usage}</div>
      </div>
    </div>
  )
}

function PaletteBoard() {
  return (
    <div style={{ display: 'grid', gap: 28, maxWidth: 480 }}>
      {GROUPS.map((g) => (
        <section key={g.title} style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {g.title}
          </h3>
          {g.tokens.map(([token, usage]) => (
            <Swatch key={token} token={token} usage={usage} />
          ))}
        </section>
      ))}
    </div>
  )
}

const meta = {
  title: 'Design/Palette',
  component: PaletteBoard,
} satisfies Meta<typeof PaletteBoard>

export default meta
type Story = StoryObj<typeof meta>

export const All: Story = {}
