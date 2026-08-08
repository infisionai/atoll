import { describe, expect, it } from 'vitest'
import type { JobUpdate } from '../../../ipc/runner'
import {
  expectedResultCount,
  extractedItemValues,
  initBatchValues,
  isBatchValues,
  mergeJobUpdate,
  pickMediaUrls,
  selectItem,
  stripBatchCountParams,
  type GalleryItem,
} from './gallery'

function update(partial: Partial<JobUpdate> & { jobId: string }): JobUpdate {
  return { nodeId: 'r1', workspaceId: 'w', status: 'done', urls: [], ...partial }
}

const A = 'https://cdn/a.png'
const B = 'https://cdn/b.png'
const C = 'https://cdn/c.png'

describe('expectedResultCount', () => {
  it('defaults to 1', () => {
    expect(expectedResultCount({})).toBe(1)
    expect(expectedResultCount({ count: 'auto' })).toBe(1)
    expect(expectedResultCount({ count: 0 })).toBe(1)
  })

  it('reads count/imageCount/image_count as number or numeric string', () => {
    expect(expectedResultCount({ count: '3' })).toBe(3)
    expect(expectedResultCount({ imageCount: 4 })).toBe(4)
    expect(expectedResultCount({ image_count: '2' })).toBe(2)
  })
})

describe('mergeJobUpdate — shape A (N jobs, one url each)', () => {
  const base = () => initBatchValues(['j1', 'j2', 'j3'], 3, 'm1', 'note')

  it('maps out-of-order arrivals to the right slots and tracks progress', () => {
    let values = base()
    const p1 = mergeJobUpdate(values, update({ jobId: 'j2', urls: [B] }), 'image')!
    values = { ...values, ...p1 }
    expect((values.items as GalleryItem[])[1].url).toBe(B)
    expect((values.items as (GalleryItem | null)[])[0]).toBeNull()
    expect(values.progressNote).toBe('1/3')
    expect(values.generating).toBe(true)
  })

  it('completes when all jobs settle, selecting the first arrived item', () => {
    let values = base()
    for (const [jobId, url] of [
      ['j2', B],
      ['j1', A],
      ['j3', C],
    ] as const) {
      values = { ...values, ...mergeJobUpdate(values, update({ jobId, urls: [url] }), 'image') }
    }
    expect(values.generating).toBe(false)
    expect(values.selected).toBe(0)
    expect((values.media as GalleryItem).url).toBe(A)
    expect((values.jobId as string)).toBe('j1')
  })

  it('is idempotent under duplicate delivery (push + resync)', () => {
    let values = base()
    const u = update({ jobId: 'j1', urls: [A] })
    values = { ...values, ...mergeJobUpdate(values, u, 'image') }
    values = { ...values, ...mergeJobUpdate(values, u, 'image') }
    expect(values.settled).toEqual(['j1'])
    expect(values.progressNote).toBe('1/3')
  })

  it('partial failure completes with the arrived items and keeps empty slots', () => {
    let values = base()
    values = { ...values, ...mergeJobUpdate(values, update({ jobId: 'j1', status: 'failed' }), 'image') }
    values = { ...values, ...mergeJobUpdate(values, update({ jobId: 'j2', urls: [B] }), 'image') }
    values = { ...values, ...mergeJobUpdate(values, update({ jobId: 'j3', urls: [C] }), 'image') }
    expect(values.generating).toBe(false)
    expect((values.items as (GalleryItem | null)[])[0]).toBeNull()
    expect(values.selected).toBe(1)
    expect((values.media as GalleryItem).url).toBe(B)
    expect(values.error).toBeUndefined()
  })

  it('all failed surfaces an error', () => {
    let values = initBatchValues(['j1', 'j2'], 2, 'm1', 'note')
    values = { ...values, ...mergeJobUpdate(values, update({ jobId: 'j1', status: 'failed' }), 'image') }
    values = {
      ...values,
      ...mergeJobUpdate(values, update({ jobId: 'j2', status: 'failed', message: 'boom' }), 'image'),
    }
    expect(values.generating).toBe(false)
    expect(values.error).toBe('boom')
  })

  it('ignores unknown jobs and running heartbeats', () => {
    const values = base()
    expect(mergeJobUpdate(values, update({ jobId: 'ghost', urls: [A] }), 'image')).toBeNull()
    expect(mergeJobUpdate(values, update({ jobId: 'j1', status: 'running' }), 'image')).toBeNull()
  })

  it('attaches localPath only to the item whose url is the local cache', () => {
    const values = initBatchValues(['j1'], 2, 'm1', 'note')
    // jobIds.length===1 with expected 2 is shape B, so use 2 jobs for shape A local test
    const values2 = initBatchValues(['j1', 'j2'], 2, 'm1', 'note')
    const local = 'asset://cache/j1.png'
    const patch = mergeJobUpdate(
      values2,
      update({ jobId: 'j1', urls: [local, A], localPath: '/cache/j1.png', localUrl: local }),
      'image',
    )!
    const item = (patch.items as GalleryItem[])[0]
    expect(item.url).toBe(local)
    expect(item.localPath).toBe('/cache/j1.png')
    expect(item.remoteUrl).toBe(A)
    void values
  })
})

describe('mergeJobUpdate — shape B (one job, N urls)', () => {
  it('spreads kind-matching urls across slots and completes at once', () => {
    const values = initBatchValues(['j1'], 3, 'm1', 'note')
    const patch = mergeJobUpdate(
      values,
      update({ jobId: 'j1', urls: [A, 'https://cdn/skip.txt', B, C] }),
      'image',
    )!
    const items = patch.items as GalleryItem[]
    expect(items.map((i) => i.url)).toEqual([A, B, C])
    expect(patch.generating).toBe(false)
    expect(patch.selected).toBe(0)
    expect((patch.media as GalleryItem).url).toBe(A)
  })

  it('failure completes with an error', () => {
    const values = initBatchValues(['j1'], 4, 'm1', 'note')
    const patch = mergeJobUpdate(
      values,
      update({ jobId: 'j1', status: 'failed', message: 'moderation' }),
      'image',
    )!
    expect(patch.generating).toBe(false)
    expect(patch.error).toBe('moderation')
  })
})

describe('pickMediaUrls', () => {
  it('filters by kind and respects the limit', () => {
    expect(pickMediaUrls([A, 'https://cdn/v.mp4', B], 'image', 2)).toEqual([A, B])
    expect(pickMediaUrls([A, B], 'image', 1)).toEqual([A])
  })

  it('falls back to the first url when nothing matches', () => {
    expect(pickMediaUrls(['https://cdn/opaque'], 'image', 3)).toEqual(['https://cdn/opaque'])
  })
})

describe('selectItem / extractedItemValues', () => {
  const values = {
    jobIds: ['j1', 'j2'],
    jobId: 'j1',
    items: [
      { name: 'a.png', url: A, mime: 'image/png', jobId: 'j1' },
      { name: 'b.png', url: B, mime: 'image/png', jobId: 'j2' },
    ] as GalleryItem[],
    selected: 0,
    media: { name: 'a.png', url: A, mime: 'image/png' },
  }

  it('selectItem updates the mirrors', () => {
    const patch = selectItem(values, 1)!
    expect(patch.selected).toBe(1)
    expect((patch.media as GalleryItem).url).toBe(B)
    expect(patch.jobId).toBe('j2')
  })

  it('selectItem rejects empty slots', () => {
    expect(selectItem({ ...values, items: [null, null] }, 0)).toBeNull()
  })

  it('extractedItemValues copies the item without gallery bookkeeping', () => {
    const extracted = extractedItemValues(values, 1)!
    expect((extracted.media as GalleryItem).url).toBe(B)
    expect(extracted.jobId).toBe('j2')
    expect(extracted.sourceNode).toBeUndefined()
    expect(extracted.items).toBeUndefined()
  })
})

describe('isBatchValues', () => {
  it('detects batch bookkeeping', () => {
    expect(isBatchValues({ jobIds: ['j1'] })).toBe(true)
    expect(isBatchValues({ jobId: 'j1' })).toBe(false)
  })
})

describe('stripBatchCountParams', () => {
  it('removes every count variant and keeps the rest', () => {
    expect(
      stripBatchCountParams({ prompt: 'p', count: 3, imageCount: 2, image_count: '4' }),
    ).toEqual({ prompt: 'p' })
  })
})
