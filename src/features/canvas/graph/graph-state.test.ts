import { describe, expect, it } from 'vitest'
import {
  connectionsOf,
  emptyGraph,
  graphReducer,
  incomingByPort,
  type GraphNode,
  type GraphState,
} from './graph-state'

const node = (id: string, x = 0, y = 0): GraphNode => ({
  id,
  kind: 'model',
  ref: 'nano_banana_2',
  x,
  y,
  values: {},
})

const base: GraphState = {
  nodes: { a: node('a'), b: node('b', 100, 50) },
  edges: [{ from: 'a:__out', to: 'b:prompt' }],
  selection: new Set(['a']),
}

describe('node actions', () => {
  it('add — adds a node', () => {
    const s = graphReducer(emptyGraph, { type: 'node/add', node: node('x') })
    expect(s.nodes.x.id).toBe('x')
  })

  it('move — moves multiple nodes by the same delta', () => {
    const s = graphReducer(base, { type: 'node/move', ids: ['a', 'b'], dx: 10, dy: -5 })
    expect(s.nodes.a).toMatchObject({ x: 10, y: -5 })
    expect(s.nodes.b).toMatchObject({ x: 110, y: 45 })
  })

  it('remove — removes the node together with its edges and selection', () => {
    const s = graphReducer(base, { type: 'node/remove', ids: ['a'] })
    expect(s.nodes.a).toBeUndefined()
    expect(s.edges).toHaveLength(0) // a:__out edge removed in cascade
    expect(s.selection.has('a')).toBe(false)
  })

  it('setValue — updates only the values of that node', () => {
    const s = graphReducer(base, { type: 'node/setValue', id: 'a', name: 'prompt', value: 'sky' })
    expect(s.nodes.a.values).toEqual({ prompt: 'sky' })
    expect(s.nodes.b.values).toEqual({})
  })
})

describe('edge actions', () => {
  it('connect — adds an edge', () => {
    const s = graphReducer(base, { type: 'edge/connect', from: 'b:__out', to: 'a:medias', max: 1 })
    expect(s.edges).toHaveLength(2)
  })

  it('connect — ignores duplicates from the same source', () => {
    const s = graphReducer(base, { type: 'edge/connect', from: 'a:__out', to: 'b:prompt', max: 5 })
    expect(s.edges).toHaveLength(1)
  })

  it('connect — ignores connections exceeding the target port max', () => {
    const s = graphReducer(base, { type: 'edge/connect', from: 'b:__out', to: 'b:prompt', max: 1 })
    expect(s.edges).toHaveLength(1)
  })

  it('remove — removes exactly that edge', () => {
    const s = graphReducer(base, { type: 'edge/remove', from: 'a:__out', to: 'b:prompt' })
    expect(s.edges).toHaveLength(0)
  })
})

describe('selection actions', () => {
  it('set / toggle / clear', () => {
    let s = graphReducer(base, { type: 'selection/set', ids: ['a', 'b'] })
    expect([...s.selection].sort()).toEqual(['a', 'b'])
    s = graphReducer(s, { type: 'selection/toggle', id: 'a' })
    expect([...s.selection]).toEqual(['b'])
    s = graphReducer(s, { type: 'selection/toggle', id: 'a' })
    expect(s.selection.has('a')).toBe(true)
    s = graphReducer(s, { type: 'selection/clear' })
    expect(s.selection.size).toBe(0)
  })
})

describe('derived queries', () => {
  it('incomingByPort — source list per port', () => {
    expect(incomingByPort(base, 'b')).toEqual({ prompt: ['a:__out'] })
  })

  it('connectionsOf — output and input port connection state', () => {
    expect(connectionsOf(base, 'a')).toEqual({ __out: true })
    expect(connectionsOf(base, 'b')).toEqual({ prompt: true })
  })
})
