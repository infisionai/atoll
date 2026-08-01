import type { Meta, StoryObj } from '@storybook/react-vite'

/**
 * Design foundations — a catalog for visually checking the non-color base systems.
 * Every value originates from a global.css token. Do not improvise spacing/sizes/motion not listed here.
 */

const box: React.CSSProperties = { display: 'grid', gap: 10 }
const h: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary)',
  fontWeight: 600,
}
const label: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-muted)',
  minWidth: 150,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={box}>
      <h3 style={h}>{title}</h3>
      {children}
    </section>
  )
}

/* ── Spacing ── */
function SpacingScale() {
  const steps = [1, 2, 3, 4, 6, 8, 10, 12]
  return (
    <Section title="Spacing — multiples of --spacing (0.25rem) only">
      {steps.map((n) => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={label}>
            spacing × {n} = {n * 4}px
          </span>
          <span
            style={{
              width: `calc(var(--spacing) * ${n})`,
              height: 14,
              background: 'var(--accent)',
              borderRadius: 2,
              opacity: 0.85,
            }}
          />
        </div>
      ))}
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Prefer the --space-1~5 aliases (4/8/12/16/24px) for component gaps
      </p>
    </Section>
  )
}

/* ── Type scale ── */
function TypeScale() {
  const tokens = ['--text-xs', '--text-sm', '--text-base', '--text-lg', '--text-xl', '--text-2xl', '--text-4xl']
  return (
    <Section title="Type — Tailwind scale × --font-scale (0.92). Default is --text-xs">
      {tokens.map((t) => (
        <div key={t} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={label}>{t}</span>
          <span style={{ fontSize: `var(${t})`, color: 'var(--text-primary)' }}>
            Deep-sea control room Atoll 1234
          </span>
        </div>
      ))}
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Numbers, coordinates, credits, and IDs must use --font-mono
      </p>
    </Section>
  )
}

/* ── Display face + text hierarchy rules ── */
function DisplayAndHierarchy() {
  return (
    <Section title="Display face — the console identity. Exactly ONE display moment in the app">
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-4xl)',
          fontWeight: 'var(--font-weight-semibold)' as never,
          letterSpacing: 'var(--tracking-tight)',
          color: 'var(--text-primary)',
        }}
      >
        workspaces_
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        --font-display (= the mono, used large) · pair with --tracking-tight. Never for body text.
      </p>
      <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Aspect Ratio</span>
          <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-xs)', marginLeft: 12 }}>16:9</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Form hierarchy rule: labels are --text-muted, values are --text-primary — a form must never
          read as one gray mass. (Three text levels only; no fourth.)
        </p>
      </div>
    </Section>
  )
}

/* ── Corner radius ── */
function RadiusScale() {
  const tokens = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-2xl']
  return (
    <Section title="Corners — md for controls, xl for node cards">
      <div style={{ display: 'flex', gap: 12 }}>
        {tokens.map((t) => (
          <div key={t} style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
            <span
              style={{
                width: 56,
                height: 40,
                background: 'var(--bg-surface-raised)',
                border: '1px solid var(--border-default)',
                borderRadius: `var(${t})`,
              }}
            />
            <span style={{ ...label, minWidth: 0 }}>{t.replace('--radius-', '')}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ── Layout rules ── */
function LayoutRules() {
  const rules: Array<[string, string]> = [
    ['--layout-page-padding', 'Page (dashboard) horizontal padding — 40px'],
    ['--grid-card-min', 'Card grid minimum width — auto-fill minmax(15rem, 1fr)'],
    ['--node-width-asset', 'Asset node width — 208px'],
    ['--node-width-op', 'Edit/audio op node width — 240px'],
    ['--node-width-model', 'Generation (model) node width — 300px'],
  ]
  return (
    <Section title="Layout — position only with these tokens. New nodes use one of the three standard widths">
      {rules.map(([t, desc]) => (
        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ ...label, minWidth: 190 }}>{t}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{desc}</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 6 }}>
        {(['asset', 'op', 'model'] as const).map((k) => (
          <div key={k} style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
            <span
              style={{
                width: `calc(var(--node-width-${k}) / 2)`,
                height: 34,
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
              }}
            />
            <span style={{ ...label, minWidth: 0 }}>{k} (shown at 1/2)</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ── Motion ── */
function MotionRules() {
  return (
    <Section title="Motion — reactions are 0.15s ease-out; sustained motion only expresses aliveness">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={label}>--default-transition-*</span>
        <span className="motion-demo" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          hover reaction 0.15s / cubic-bezier(0.4, 0, 0.2, 1)
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={label}>--animate-pulse</span>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--status-running)',
            animation: 'var(--animate-pulse)',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Breathing while generating</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={label}>--animate-shimmer</span>
        <span
          style={{
            width: 120,
            height: 14,
            borderRadius: 4,
            background:
              'linear-gradient(100deg, var(--bg-input) 40%, var(--bg-surface-raised) 50%, var(--bg-input) 60%)',
            backgroundSize: '200% 100%',
            animation: 'var(--animate-shimmer)',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Skeleton while awaiting results</span>
      </div>
    </Section>
  )
}

function FoundationsBoard() {
  return (
    <div style={{ display: 'grid', gap: 36, maxWidth: 640 }}>
      <SpacingScale />
      <TypeScale />
      <DisplayAndHierarchy />
      <RadiusScale />
      <LayoutRules />
      <MotionRules />
    </div>
  )
}

const meta = {
  title: 'Design/Foundations',
  component: FoundationsBoard,
} satisfies Meta<typeof FoundationsBoard>

export default meta
type Story = StoryObj<typeof meta>

export const All: Story = {}
