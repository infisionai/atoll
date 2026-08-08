import { describe, expect, it } from 'vitest'
import type { GraphNode, GraphState } from './graph-state'
import type { ModelSpec } from '../model-spec'
import {
  describeNode,
  nodeReferenceText,
  nodeReferenceTokens,
  orderedSelection,
} from './node-reference'

const catalog: ModelSpec[] = [
  { id: 'nano_banana_2', name: 'Nano Banana 2', output_type: 'image' },
  { id: 'kling-v2.5', name: 'Kling 2.5', output_type: 'video' },
]

const node = (partial: Partial<GraphNode> & { id: string }): GraphNode => ({
  kind: 'model',
  ref: 'nano_banana_2',
  x: 0,
  y: 0,
  values: {},
  ...partial,
})

const graph = (nodes: GraphNode[], edges: GraphState['edges'] = []): GraphState => ({
  nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
  edges,
  selection: new Set(),
})

const ctx = (g: GraphState) => ({ graph: g, catalog })

describe('describeNode — model', () => {
  it('builds model name, ref, prompt, and options lines', () => {
    const g = graph([
      node({
        id: 'm1',
        values: { prompt: 'lighthouse', aspect_ratio: '16:9', __status: 'running', generating: true },
      }),
    ])
    expect(describeNode(ctx(g), 'm1')).toEqual([
      '@atoll:node/m1 — Nano Banana 2 node (nano_banana_2)',
      'Prompt: "lighthouse"',
      'Options: aspect_ratio=16:9',
    ])
  })

  it('uses the ref as-is when not in the catalog', () => {
    const g = graph([node({ id: 'm1', ref: 'unknown-model' })])
    expect(describeNode(ctx(g), 'm1')[0]).toBe('@atoll:node/m1 — unknown-model node')
  })

  it('truncates prompts at 200 chars with …', () => {
    const g = graph([node({ id: 'm1', values: { prompt: 'a'.repeat(250) } })])
    const line = describeNode(ctx(g), 'm1')[1]
    expect(line).toBe(`Prompt: "${'a'.repeat(200)}…"`)
  })
})

describe('describeNode — asset (result)', () => {
  const source = node({ id: 'src', ref: 'kling-v2.5', values: { prompt: 'coral reef drone shot' } })

  it('images with localPath get a File line without hint and no URL line', () => {
    const g = graph([
      node({ id: 'src', values: { prompt: 'lighthouse' } }),
      node({
        id: 'r1',
        kind: 'asset',
        ref: 'image',
        values: {
          sourceNode: 'src',
          media: { url: 'asset://x.png', localPath: '/tmp/x.png', mime: 'image/png' },
        },
      }),
    ])
    const lines = describeNode(ctx(g), 'r1')
    expect(lines[0]).toBe('@atoll:node/r1 — image result · Nano Banana 2')
    expect(lines).toContain('File: /tmp/x.png')
    expect(lines.join('\n')).not.toContain('URL:')
  })

  it('videos get the cannot-open hint on the File line', () => {
    const g = graph([
      source,
      node({
        id: 'r1',
        kind: 'asset',
        ref: 'video',
        values: { sourceNode: 'src', media: { url: 'asset://v.mp4', localPath: '/tmp/v.mp4' } },
      }),
    ])
    const lines = describeNode(ctx(g), 'r1')
    expect(lines[0]).toBe('@atoll:node/r1 — video result · Kling 2.5')
    expect(lines).toContain('Prompt: "coral reef drone shot"')
    expect(lines).toContain('File: /tmp/v.mp4  (video — cannot be opened directly; path reference only)')
  })

  it('falls back to a URL line without localPath', () => {
    const g = graph([
      node({
        id: 'r1',
        kind: 'asset',
        ref: 'image',
        values: { media: { url: 'https://cdn/x.png' } },
      }),
    ])
    const lines = describeNode(ctx(g), 'r1')
    expect(lines[0]).toBe('@atoll:node/r1 — uploaded image asset')
    expect(lines).toContain('URL: https://cdn/x.png')
  })

  it('emits no blob:/data: URLs — meaningless outside the webview or too long', () => {
    for (const url of ['blob:abc', 'data:image/svg+xml;utf8,x']) {
      const g = graph([
        node({ id: 'r1', kind: 'asset', ref: 'image', values: { media: { url } } }),
      ])
      expect(describeNode(ctx(g), 'r1')).toEqual(['@atoll:node/r1 — uploaded image asset'])
    }
  })

  it('while generating, only a status line and no File line', () => {
    const g = graph([
      source,
      node({
        id: 'r1',
        kind: 'asset',
        ref: 'video',
        values: { sourceNode: 'src', generating: true, jobId: 'j1' },
      }),
    ])
    const lines = describeNode(ctx(g), 'r1')
    expect(lines[0]).toBe('@atoll:node/r1 — generating video · Kling 2.5')
    expect(lines).toContain('Status: generating')
    expect(lines.join('\n')).not.toContain('File:')
  })

  it('on failure: Status: failed — message', () => {
    const g = graph([
      node({
        id: 'r1',
        kind: 'asset',
        ref: 'image',
        values: { error: 'insufficient credits' },
      }),
    ])
    expect(describeNode(ctx(g), 'r1')).toContain('Status: failed — insufficient credits')
  })

  it('empty asset without media or source', () => {
    const g = graph([node({ id: 'a1', kind: 'asset', ref: '3d', values: {} })])
    expect(describeNode(ctx(g), 'a1')).toEqual(['@atoll:node/a1 — empty 3D asset'])
  })
})

describe('orderedSelection · nodeReferenceText', () => {
  it('sorts by (y, x, id) regardless of selection insertion order', () => {
    const g: GraphState = {
      ...graph([node({ id: 'b', x: 0, y: 100 }), node({ id: 'a', x: 50, y: 0 })]),
      selection: new Set(['b', 'a']),
    }
    expect(orderedSelection(g)).toEqual(['a', 'b'])
  })

  it('multi-select gets a header + blank-line separators', () => {
    const g = graph([node({ id: 'a' }), node({ id: 'b', ref: 'kling-v2.5' })])
    const text = nodeReferenceText(ctx(g), ['a', 'b'])
    expect(text.startsWith('2 Atoll nodes:\n\n')).toBe(true)
    expect(text).toContain('\n\n@atoll:node/b — Kling 2.5 node (kling-v2.5)')
  })

  it('single select is just the block without a header', () => {
    const g = graph([node({ id: 'a' })])
    expect(nodeReferenceText(ctx(g), ['a'])).toBe(
      '@atoll:node/a — Nano Banana 2 node (nano_banana_2)',
    )
  })

  it('token mode — space-separated tokens only, skipping missing nodes', () => {
    const g = graph([node({ id: 'a' }), node({ id: 'b' })])
    expect(nodeReferenceTokens(g, ['a', 'ghost', 'b'])).toBe('@atoll:node/a @atoll:node/b')
  })

  it('skips missing node ids', () => {
    const g = graph([node({ id: 'a' })])
    expect(nodeReferenceText(ctx(g), ['ghost', 'a'])).toBe(
      '@atoll:node/a — Nano Banana 2 node (nano_banana_2)',
    )
  })
})
