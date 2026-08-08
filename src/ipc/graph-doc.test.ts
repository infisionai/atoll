import { describe, expect, it } from 'vitest'
import { fromGraphDoc, toGraphDoc } from './graph-doc'
import type { GraphDoc } from './commands'
import type { GraphNode } from '../features/canvas/graph/graph-state'

function node(partial: Partial<GraphNode> & { id: string }): GraphNode {
  return { kind: 'asset', ref: 'image', x: 0, y: 0, values: {}, ...partial } as GraphNode
}

describe('fromGraphDoc', () => {
  it('round-trips model and asset nodes with edges', () => {
    const doc: GraphDoc = {
      nodes: [node({ id: 'a' }), node({ id: 'm', kind: 'model', ref: 'nano_banana_2' })],
      edges: [{ from: 'a:__out', to: 'm:medias.start_image' }],
    }
    const state = fromGraphDoc(doc)
    expect(Object.keys(state.nodes)).toEqual(['a', 'm'])
    expect(state.edges).toHaveLength(1)
    expect(toGraphDoc(state)).toEqual(doc)
  })

  it('drops unknown-kind nodes from old saves (removed edit ops) and their edges', () => {
    const doc: GraphDoc = {
      nodes: [
        node({ id: 'a' }),
        { ...node({ id: 'e' }), kind: 'edit', ref: 'upscale' } as unknown as GraphNode,
      ],
      edges: [
        { from: 'a:__out', to: 'e:input' },
        { from: 'e:__out', to: 'a:__result' },
      ],
    }
    const state = fromGraphDoc(doc)
    expect(Object.keys(state.nodes)).toEqual(['a'])
    expect(state.edges).toEqual([])
  })
})
