import { describe, expect, it } from 'vitest'
import { toolbarSpec } from './toolbar-actions'
import type { GraphNode, GraphState } from './graph-state'
import type { ModelSpec } from '../model-spec'

const CATALOG = [{ id: 'nano_banana' } as ModelSpec]

function state(nodes: Partial<GraphNode>[], selection: string[]): GraphState {
  const rec: Record<string, GraphNode> = {}
  for (const n of nodes) {
    const full = { id: 'n', kind: 'asset', ref: 'image', x: 0, y: 0, values: {}, ...n } as GraphNode
    rec[full.id] = full
  }
  return { nodes: rec, edges: [], selection: new Set(selection) }
}

describe('toolbarSpec', () => {
  it('no selection, no actions', () => {
    expect(toolbarSpec(state([], []), CATALOG).actions).toEqual([])
  })

  it('generation (model) node — duplicate, run, delete; no export', () => {
    const s = state([{ id: 'm', kind: 'model', ref: 'nano_banana' }], ['m'])
    const spec = toolbarSpec(s, CATALOG)
    expect(spec.actions).toEqual(['copy', 'duplicate', 'run', 'delete'])
    expect(spec.runDisabled).toBe(false)
  })

  it('edit nodes only — run visible but disabled', () => {
    const s = state([{ id: 'e', kind: 'edit', ref: 'upscale' }], ['e'])
    const spec = toolbarSpec(s, CATALOG)
    expect(spec.actions).toEqual(['copy', 'duplicate', 'run', 'delete'])
    expect(spec.runDisabled).toBe(true)
  })

  it('empty asset node — duplicate and delete only', () => {
    const s = state([{ id: 'a' }], ['a'])
    expect(toolbarSpec(s, CATALOG).actions).toEqual(['copy', 'duplicate', 'delete'])
  })

  it('asset node with media — export added', () => {
    const s = state([{ id: 'a', values: { media: { url: 'https://x/y.png' } } }], ['a'])
    expect(toolbarSpec(s, CATALOG).actions).toEqual(['copy', 'duplicate', 'export', 'delete'])
  })

  it('multi-select is a union — model + result asset gives both run and export', () => {
    const s = state(
      [
        { id: 'm', kind: 'model', ref: 'nano_banana' },
        { id: 'a', values: { media: { url: 'https://x/y.png' } } },
      ],
      ['m', 'a'],
    )
    const spec = toolbarSpec(s, CATALOG)
    expect(spec.actions).toEqual(['copy', 'duplicate', 'run', 'export', 'delete'])
    expect(spec.runDisabled).toBe(false)
  })

  it('models not in the catalog are not runnable', () => {
    const s = state([{ id: 'm', kind: 'model', ref: 'ghost' }], ['m'])
    expect(toolbarSpec(s, CATALOG).actions).toEqual(['copy', 'duplicate', 'delete'])
  })
})
