import { IconLock } from '../../../shared/icons'
import { useMemo, useState } from 'react'
import type { NodeDef } from '../graph/graph-build'
import { EDIT_OPS, type EditOpId } from '../graph/edit-ops'
import type { ProviderCatalog, ProviderId } from './providers'
import styles from './LibrarySidebar.module.css'

type AddDef = Omit<NodeDef, 'id' | 'x' | 'y'>

interface LibrarySidebarProps {
  /** Per-provider catalogs — switched via tabs */
  providers: ProviderCatalog[]
  onAdd: (def: AddDef) => void
  /** "Go connect" for an unconnected provider — opens the settings screen */
  onOpenSettings?: () => void
}

const OUTPUT_LABEL: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  '3d': '3D',
}

const TYPE_FILTERS = ['All', 'Image', 'Video', 'Audio', '3D'] as const
type TypeFilter = (typeof TYPE_FILTERS)[number]

const BASIC_NODES: Array<{ label: string; def: AddDef }> = [
  { label: 'Image asset', def: { asset: 'image' } },
  { label: 'Video asset', def: { asset: 'video' } },
]

const OP_NODES: Array<{ id: EditOpId }> = [
  { id: 'upscale' },
  { id: 'remove_background' },
  { id: 'outpaint' },
  { id: 'voiceover' },
  { id: 'change_voice' },
  { id: 'translate_voice' },
]

/**
 * Library sidebar —
 * search basic nodes (assets, edit ops) and the model catalog, then add them to the canvas.
 * Price and duration on model cards are placeholders to be filled in later.
 */
export function LibrarySidebar({ providers, onAdd, onOpenSettings }: LibrarySidebarProps) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All')
  const [activeProvider, setActiveProvider] = useState<ProviderId>(
    providers.find((p) => p.connected)?.id ?? providers[0]?.id ?? 'higgsfield',
  )

  const active = providers.find((p) => p.id === activeProvider)
  const catalog = useMemo(() => active?.models ?? [], [active])

  // Supported outputs vary per provider — only expose filters for kinds actually in the catalog
  const availableFilters = useMemo<TypeFilter[]>(() => {
    const present = new Set(catalog.map((m) => OUTPUT_LABEL[m.output_type]))
    return TYPE_FILTERS.filter((t) => t === 'All' || present.has(t))
  }, [catalog])
  const effectiveFilter = availableFilters.includes(typeFilter) ? typeFilter : 'All'

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter((m) => {
      if (effectiveFilter !== 'All' && OUTPUT_LABEL[m.output_type] !== effectiveFilter) return false
      if (!q) return true
      return [m.name, m.id, m.provider_name, m.description, ...(m.tags ?? [])]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q))
    })
  }, [catalog, query, effectiveFilter])

  return (
    <aside className={styles.sidebar} aria-label="Node library">
      <section className={styles.section}>
        <h3 className={styles.heading}>Basic nodes</h3>
        <div className={styles.basicGrid}>
          {BASIC_NODES.map((b) => (
            <button
              key={b.label}
              type="button"
              className={styles.basicItem}
              onClick={() => onAdd(b.def)}
            >
              {b.label}
            </button>
          ))}
          {OP_NODES.map(({ id }) => (
            <button
              key={id}
              type="button"
              className={styles.basicItem}
              onClick={() => onAdd({ edit: id })}
            >
              {EDIT_OPS[id].name}
            </button>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.modelsSection}`}>
        <h3 className={styles.heading}>Models</h3>

        {/* Provider tabs — one catalog per MCP. Unconnected providers are dimmed */}
        <div className={styles.providerTabs} role="tablist" aria-label="MCP Provider">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activeProvider === p.id}
              className={styles.providerTab}
              data-active={activeProvider === p.id}
              title={p.connected ? p.name : `${p.name} — not connected`}
              onClick={() => setActiveProvider(p.id)}
            >
              <span className={styles.providerDot} data-connected={p.connected} aria-hidden />
              {p.name}
            </button>
          ))}
        </div>

        {/* Unconnected provider — catalog locked (usable after connecting the MCP) */}
        {active && !active.connected ? (
          <div className={styles.locked}>
            <IconLock className={styles.lockIcon} />
            <p className={styles.lockedText}>
              Connect {active.name}
              <br />
              to use its models
            </p>
            {onOpenSettings && (
              <button type="button" className={styles.lockedCta} onClick={onOpenSettings}>
                Go to connect
              </button>
            )}
          </div>
        ) : (
          <>
        <input
          type="search"
          className={styles.search}
          placeholder="Search models"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.filters} role="radiogroup" aria-label="Output type">
          {availableFilters.map((t) => (
            <button
              key={t}
              type="button"
              className={styles.filter}
              data-active={effectiveFilter === t}
              onClick={() => setTypeFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={styles.modelList}>
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              className={styles.modelCard}
              onClick={() => onAdd({ model: m.id })}
            >
              <div className={styles.modelTop}>
                <span className={styles.modelName}>{m.name}</span>
                {/* Price/duration placeholder — to be filled from catalog/pricing data */}
                <span className={styles.modelCost}>— cr</span>
              </div>
              <div className={styles.modelMeta}>
                <span className={styles.modelProvider}>{m.provider_name}</span>
                <span className={styles.modelType}>{OUTPUT_LABEL[m.output_type] ?? m.output_type}</span>
              </div>
              {m.description && <p className={styles.modelDesc}>{m.description}</p>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className={styles.emptyHint}>No models match "{query}".</p>
          )}
        </div>
          </>
        )}
      </section>
    </aside>
  )
}
