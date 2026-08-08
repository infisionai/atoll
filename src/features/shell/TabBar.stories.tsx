import { useReducer } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { TabBar } from './TabBar'
import { HOME_TAB, SETTINGS_TAB, initialTabs, tabReducer, type TabState } from './tab-state'

const NAMES: Record<string, string> = {
  w1: 'Cinematic Promo',
  w2: 'Product color variants',
  w3: 'Untitled Space',
}

function Interactive({ initial }: { initial: TabState }) {
  const [state, dispatch] = useReducer(tabReducer, initial)
  return (
    <div style={{ minHeight: 220, background: 'var(--bg-canvas)' }}>
      <TabBar
        state={state}
        names={NAMES}
        onActivate={(id) => dispatch({ type: 'tab/activate', id })}
        onClose={(id) => dispatch({ type: 'tab/close', id })}
        onNew={() => {
          const id = `w${Object.keys(NAMES).length + state.tabs.length + 1}`
          NAMES[id] = 'Untitled Space'
          dispatch({ type: 'tab/open', id })
        }}
      />
      <div style={{ padding: 24, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        Active tab: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
          {state.active === HOME_TAB ? 'Home (Dashboard)' : (NAMES[state.active] ?? state.active)}
        </span>
      </div>
    </div>
  )
}

const meta = {
  title: 'Shell/TabBar',
  component: Interactive,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Interactive>

export default meta
type Story = StoryObj<typeof meta>

export const MultipleTabs: Story = {
  args: { initial: { tabs: ['w1', 'w2', 'w3'], active: 'w2' } },
}

export const HomeOnly: Story = {
  args: { initial: initialTabs },
}

/* Settings opens as its own closable tab — gear icon + fixed label */
export const WithSettingsTab: Story = {
  args: { initial: { tabs: ['w1', SETTINGS_TAB], active: SETTINGS_TAB } },
}
