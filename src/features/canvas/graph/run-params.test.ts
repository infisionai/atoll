import { describe, expect, it } from 'vitest'
import { buildRunParams } from './run-params'
import type { GraphNode, GraphState } from './graph-state'
import type { ModelSpec } from '../model-spec'

/** Minimal model with prompt (required) + aspect_ratio (optional) + an image input */
const MODEL = {
  id: 'test_model',
  name: 'Test',
  output_type: 'image',
  provider_name: 'Test',
  description: '',
  aspect_ratios: ['1:1', '16:9'],
  parameters: [
    { name: 'prompt', type: 'string', required: 'required', description: 'Generation instructions' },
    { name: 'aspect_ratio', type: 'string', required: 'optional', description: '' },
  ],
  medias: [{ name: 'input_image', type: 'image', roles: ['image'], required: false, max: 1 }],
  tags: [],
} as unknown as ModelSpec

function state(nodes: GraphNode[], edges: GraphState['edges'] = []): GraphState {
  return {
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    edges,
    selection: new Set(),
  }
}

const modelNode = (values: Record<string, unknown>): GraphNode => ({
  id: 'm1',
  kind: 'model',
  ref: 'test_model',
  x: 0,
  y: 0,
  values,
})

describe('buildRunParams', () => {
  it('reports empty required scalars as missing', () => {
    const n = modelNode({})
    const r = buildRunParams(state([n]), n, MODEL)
    expect(r.missing).toContain('prompt')
  })

  it('only filled scalars go into params (empty strings and media excluded)', () => {
    const n = modelNode({ prompt: 'lighthouse', aspect_ratio: '', __status: 'idle' })
    const r = buildRunParams(state([n]), n, MODEL)
    expect(r.missing).toEqual([])
    expect(r.params.model).toBe('test_model')
    expect(r.params.prompt).toBe('lighthouse')
    expect(r.params).not.toHaveProperty('aspect_ratio')
  })

  it('upstream results (jobId) go into medias', () => {
    const n = modelNode({ prompt: 'lighthouse' })
    const upstream: GraphNode = {
      id: 'r1',
      kind: 'asset',
      ref: 'image',
      x: 0,
      y: 0,
      values: { jobId: 'job-123' },
    }
    const g = state([n, upstream], [{ from: 'r1:__out', to: 'm1:input_image' }])
    const r = buildRunParams(g, n, MODEL)
    expect(r.params.medias).toEqual([{ value: 'job-123', role: 'image' }])
  })

  it('upstream without jobId (local file) is excluded from medias', () => {
    const n = modelNode({ prompt: 'lighthouse' })
    const upstream: GraphNode = {
      id: 'a1',
      kind: 'asset',
      ref: 'image',
      x: 0,
      y: 0,
      values: { media: { url: 'blob:x' } },
    }
    const g = state([n, upstream], [{ from: 'a1:__out', to: 'm1:input_image' }])
    const r = buildRunParams(g, n, MODEL)
    expect(r.params).not.toHaveProperty('medias')
  })

  it('selected gallery item rides along as the media url (remoteUrl first)', () => {
    const n = modelNode({ prompt: 'lighthouse' })
    const upstream: GraphNode = {
      id: 'r1',
      kind: 'asset',
      ref: 'image',
      x: 0,
      y: 0,
      values: {
        jobId: 'job-2',
        media: { url: 'asset://cache/job-2.png', remoteUrl: 'https://cdn/b.png' },
      },
    }
    const g = state([n, upstream], [{ from: 'r1:__out', to: 'm1:input_image' }])
    const r = buildRunParams(g, n, MODEL)
    expect(r.params.medias).toEqual([{ value: 'job-2', role: 'image', url: 'https://cdn/b.png' }])
  })

  it('non-https media urls (blob/asset) are not forwarded', () => {
    const n = modelNode({ prompt: 'lighthouse' })
    const upstream: GraphNode = {
      id: 'r1',
      kind: 'asset',
      ref: 'image',
      x: 0,
      y: 0,
      values: { jobId: 'job-3', media: { url: 'blob:local' } },
    }
    const g = state([n, upstream], [{ from: 'r1:__out', to: 'm1:input_image' }])
    const r = buildRunParams(g, n, MODEL)
    expect(r.params.medias).toEqual([{ value: 'job-3', role: 'image' }])
  })
})
