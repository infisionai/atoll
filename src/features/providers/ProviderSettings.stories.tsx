import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ProviderStatus } from '../canvas/library/providers'
import { BalanceChips } from './BalanceChips'
import { ProviderSettings } from './ProviderSettings'

const INITIAL: ProviderStatus[] = [
  {
    id: 'higgsfield',
    name: 'Higgsfield',
    state: 'connected',
    account: 'creator@example.com',
    balance: 62.0,
  },
  {
    id: 'magnific',
    name: 'Magnific',
    state: 'disconnected',
    description: 'Spaces-style upscaling · images',
  },
  { id: 'kling', name: 'Kling', state: 'expired' },
  { id: 'elevenlabs', name: 'ElevenLabs', state: 'disconnected', authKind: 'api_key' },
]

/** Interactive wrapper where connect/disconnect/refresh actually work (OAuth simulated with a 1.2s delay) */
function Interactive({
  initial,
  connectErrors,
}: {
  initial: ProviderStatus[]
  connectErrors?: Record<string, string>
}) {
  const [providers, setProviders] = useState(initial)

  const patch = (id: string, p: Partial<ProviderStatus>) =>
    setProviders((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const connect = (id: string) => {
    patch(id, { state: 'connecting' })
    setTimeout(
      () => patch(id, { state: 'connected', account: 'creator@example.com', balance: 100 }),
      1200,
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 16 }}>
        <BalanceChips
          providers={providers}
          onRefresh={async (id) => {
            await new Promise((r) => setTimeout(r, 900))
            patch(id, {
              balance: Math.max(0, (providers.find((p) => p.id === id)?.balance ?? 0) - 2),
            })
          }}
          onOpenSettings={(id) => connect(id)}
        />
      </div>
      <ProviderSettings
        providers={providers}
        connectErrors={connectErrors}
        onConnect={connect}
        onSetApiKey={async () => {}}
        onDisconnect={async (id) => {
          await new Promise((r) => setTimeout(r, 900))
          patch(id, { state: 'disconnected', account: undefined, balance: undefined })
        }}
        onRefreshBalance={async (id) => {
          await new Promise((r) => setTimeout(r, 900))
          patch(id, {
            balance: Math.max(0, (providers.find((p) => p.id === id)?.balance ?? 0) - 2),
          })
        }}
        onBuyCredits={() => {}}
      />
    </div>
  )
}

const meta = {
  title: 'Settings/ProviderConnections',
  component: Interactive,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Interactive>

export default meta
type Story = StoryObj<typeof meta>

/* All four states at a glance — connected (with balance), disconnected, expired. The connect button simulates the OAuth flow */
export const Default: Story = { args: { initial: INITIAL } }

/* Connected but usage-restricted — balance lookup blocked by a premium gate */
export const PremiumOnlyNotice: Story = {
  args: {
    initial: [
      INITIAL[0],
      {
        id: 'magnific',
        name: 'Magnific',
        state: 'connected',
        account: 'creator@example.com',
        notice: 'Magnific MCP is available on premium plans only — upgrade your plan to use it',
      },
      INITIAL[2],
    ],
  },
}

/* API-key validation failed — the reason stays visible on the card, the typed key is kept */
export const KeyValidationError: Story = {
  args: {
    initial: INITIAL,
    connectErrors: {
      elevenlabs:
        'eleven-key-permissions: the API key is missing required permissions — create a key with User read (balance) and Voices read access',
    },
  },
}

export const AllDisconnected: Story = {
  args: {
    initial: INITIAL.map((p) => ({
      ...p,
      state: 'disconnected' as const,
      account: undefined,
      balance: undefined,
    })),
  },
}
