import { describe, expect, it } from 'vitest'
import { buildFormSpec, initialValues, maxItemsOf, paramToField, portTypeOf } from './form-spec'
import type { ModelSpec, ParamSpec } from './model-spec'
import models from './mocks/models.json'

const p = (over: Partial<ParamSpec>): ParamSpec => ({
  name: 'x',
  required: 'optional',
  type: 'string',
  ...over,
})

describe('paramToField — control selection', () => {
  it('bool → toggle', () => {
    expect(paramToField(p({ type: 'bool' })).kind).toBe('toggle')
  })

  it('string_array → tags', () => {
    expect(paramToField(p({ type: 'string_array' })).kind).toBe('tags')
  })

  it('number with min/max → slider, otherwise number', () => {
    expect(paramToField(p({ type: 'number', min: 0, max: 1 })).kind).toBe('slider')
    expect(paramToField(p({ type: 'number', min: 0 })).kind).toBe('number')
    expect(paramToField(p({ type: 'number' })).kind).toBe('number')
  })

  it('options with 4 or fewer entries → segment, more → select', () => {
    expect(paramToField(p({ options: ['a', 'b', 'c', 'd'] })).kind).toBe('segment')
    expect(paramToField(p({ options: ['a', 'b', 'c', 'd', 'e'] })).kind).toBe('select')
  })

  it('free string with a prompt-like name → textarea, others → text', () => {
    expect(paramToField(p({ name: 'prompt' })).kind).toBe('textarea')
    expect(paramToField(p({ name: 'negative_prompt' })).kind).toBe('textarea')
    expect(paramToField(p({ name: 'preset_name' })).kind).toBe('text')
  })

  it('converts the required notation to boolean', () => {
    expect(paramToField(p({ required: 'required' })).required).toBe(true)
    expect(paramToField(p({ required: 'optional' })).required).toBe(false)
  })
})

describe('buildFormSpec — placement', () => {
  const model: ModelSpec = {
    id: 'm',
    name: 'M',
    output_type: 'image',
    parameters: [
      p({ name: 'prompt', required: 'required' }),
      p({ name: 'seed', type: 'number' }),
    ],
    aspect_ratios: ['1:1', '16:9'],
  }

  it('splits required into basic and optional into advanced', () => {
    const spec = buildFormSpec(model)
    expect(spec.basic.map((f) => f.name)).toContain('prompt')
    expect(spec.advanced.map((f) => f.name)).toContain('seed')
  })

  it('puts an aspect ratio field into basic when aspect_ratios exists', () => {
    const spec = buildFormSpec(model)
    const ratio = spec.basic.find((f) => f.name === 'aspect_ratio')
    expect(ratio?.options).toEqual(['1:1', '16:9'])
  })

  it('only fields with a default enter the initial values', () => {
    const spec = buildFormSpec({
      ...model,
      parameters: [p({ name: 'resolution', default: '1k' }), p({ name: 'seed', type: 'number' })],
    })
    expect(initialValues(spec)).toEqual({ resolution: '1k' })
  })
})

describe('buildFormSpec — prompt handling', () => {
  const base: ModelSpec = { id: 'm', name: 'M', output_type: 'image' }

  it('injects a standard prompt at the front for image/video models without a prompt parameter', () => {
    const spec = buildFormSpec({ ...base, parameters: [p({ name: 'resolution' })] })
    expect(spec.basic[0]).toMatchObject({ name: 'prompt', kind: 'textarea', required: true })
  })

  it('does not inject a prompt when the model declares its own required textarea (TTS text)', () => {
    const spec = buildFormSpec({
      ...base,
      output_type: 'audio',
      parameters: [
        p({ name: 'text', required: 'required', format: 'textarea' }),
        p({ name: 'voice_id', required: 'required', options: ['a', 'b', 'c', 'd', 'e'] }),
      ],
    })
    const names = spec.basic.map((f) => f.name)
    expect(names).not.toContain('prompt')
    expect(spec.basic[0]).toMatchObject({ name: 'text', kind: 'textarea', required: true })
  })

  it('a required textarea is connectable like a prompt', () => {
    expect(
      paramToField(p({ name: 'text', required: 'required', format: 'textarea' })).connectable,
    ).toBe(true)
    expect(paramToField(p({ name: 'text', format: 'textarea' })).connectable).toBe(false)
  })

  it('an optional textarea does not block the main prompt injection', () => {
    const spec = buildFormSpec({
      ...base,
      parameters: [p({ name: 'notes', format: 'textarea' })],
    })
    expect(spec.basic[0]).toMatchObject({ name: 'prompt', required: true })
  })

  it('does not inject a duplicate when a main prompt parameter exists', () => {
    const spec = buildFormSpec({
      ...base,
      parameters: [p({ name: 'prompt', required: 'required' })],
    })
    expect(spec.basic.filter((f) => f.name === 'prompt')).toHaveLength(1)
  })

  it('auxiliary prompts (negative etc.) are promoted to basic but do not block the main injection', () => {
    const spec = buildFormSpec({
      ...base,
      parameters: [p({ name: 'negative_prompt', required: 'optional' })],
    })
    const names = spec.basic.map((f) => f.name)
    expect(names[0]).toBe('prompt')
    expect(names).toContain('negative_prompt')
    expect(spec.advanced).toHaveLength(0)
  })
})

describe('port types', () => {
  const model: ModelSpec = {
    id: 'm',
    name: 'M',
    output_type: 'video',
    parameters: [p({ name: 'prompt', required: 'required' })],
    medias: [{ name: 'medias', type: 'image', roles: ['start_image'] }],
  }

  it('scalar parameters have port type text', () => {
    const spec = buildFormSpec(model)
    expect(spec.basic.find((f) => f.name === 'prompt')?.portType).toBe('text')
  })

  it('media input fields come from medias[] and port types follow the media kind', () => {
    const spec = buildFormSpec(model)
    const media = spec.basic.find((f) => f.name === 'medias')
    expect(media?.kind).toBe('media')
    expect(media?.portType).toBe('image')
  })

  it('the output port (__out) type is the model output_type', () => {
    expect(portTypeOf(model, '__out')).toBe('video')
    expect(portTypeOf(model, 'prompt')).toBe('text')
    expect(portTypeOf(model, 'medias')).toBe('image')
    expect(portTypeOf(model, 'no_such_port')).toBeNull()
  })
})

describe('port attachability (connectable)', () => {
  const model: ModelSpec = {
    id: 'm',
    name: 'M',
    output_type: 'video',
    parameters: [
      p({ name: 'prompt', required: 'required' }),
      p({ name: 'resolution', options: ['480p', '720p'] }),
      p({ name: 'duration', type: 'number', min: 1, max: 10 }),
    ],
    medias: [{ name: 'medias', type: 'image', roles: ['start_image'] }],
    aspect_ratios: ['16:9', '9:16'],
  }

  it('only prompt and media are connectable', () => {
    const spec = buildFormSpec(model)
    const flag = (name: string) =>
      [...spec.basic, ...spec.advanced].find((f) => f.name === name)?.connectable
    expect(flag('prompt')).toBe(true)
    expect(flag('medias')).toBe(true)
    expect(flag('resolution')).toBe(false) // Scalar attribute — no output to plug in
    expect(flag('duration')).toBe(false)
    expect(flag('aspect_ratio')).toBe(false)
  })
})

describe('multi media inputs', () => {
  const base: ModelSpec = { id: 'm', name: 'M', output_type: 'image' }

  it('reference-style (_references) roles are multi tile inputs (unlimited without max)', () => {
    const spec = buildFormSpec({
      ...base,
      medias: [{ name: 'medias', type: 'image', roles: ['image_references'] }],
    })
    const f = spec.basic.find((x) => x.name === 'medias')
    expect(f?.multiple).toBe(true)
    expect(f?.maxItems).toBeUndefined()
    expect(f?.label).toBe('Reference images')
  })

  it('even the image role is multi when max>1', () => {
    const model: ModelSpec = {
      ...base,
      medias: [{ name: 'medias', type: 'image', roles: ['image'], max: 14 }],
    }
    const f = buildFormSpec(model).basic.find((x) => x.name === 'medias')
    expect(f?.multiple).toBe(true)
    expect(f?.maxItems).toBe(14)
    expect(maxItemsOf(model, 'medias')).toBe(14)
  })

  it('multiple roles split into per-role slot fields (one each)', () => {
    const model: ModelSpec = {
      ...base,
      output_type: 'video',
      medias: [{ name: 'medias', type: 'image', roles: ['image', 'start_image', 'end_image'] }],
    }
    const spec = buildFormSpec(model)
    const names = spec.basic.filter((f) => f.kind === 'media').map((f) => f.name)
    expect(names).toEqual(['medias.image', 'medias.start_image', 'medias.end_image'])
    const start = spec.basic.find((f) => f.name === 'medias.start_image')
    expect(start?.label).toBe('Start frame')
    expect(start?.multiple).toBe(false)
    expect(maxItemsOf(model, 'medias.start_image')).toBe(1)
  })

  it('the video_references role has port type video', () => {
    const spec = buildFormSpec({
      ...base,
      medias: [{ name: 'medias', type: 'video', roles: ['video_references'] }],
    })
    expect(spec.basic.find((x) => x.name === 'medias')?.portType).toBe('video')
  })

  it('non-media ports have maxItems 1', () => {
    expect(maxItemsOf({ ...base, parameters: [p({ name: 'prompt' })] }, 'prompt')).toBe(1)
  })
})

describe('real-catalog compatibility', () => {
  it('builds a form spec for all 83 catalog models', () => {
    for (const m of models as ModelSpec[]) {
      const spec = buildFormSpec(m)
      for (const f of [...spec.basic, ...spec.advanced]) {
        expect(f.kind).toBeTruthy()
        expect(f.name).toBeTruthy()
      }
    }
  })

  it('injects a required prompt for text→3D (no media) (guards the tripo_3d 422 regression)', () => {
    const model = {
      id: 'tripo_3d',
      output_type: '3d',
      parameters: [{ name: 'negative_prompt', type: 'string', required: 'optional' }],
      medias: [],
    } as unknown as ModelSpec
    const spec = buildFormSpec(model)
    const prompt = spec.basic.find((f) => f.name === 'prompt')
    expect(prompt).toBeDefined()
    expect(prompt!.required).toBe(true)
  })

  it('does not inject a prompt for 3D with required media (image→3D)', () => {
    const model = {
      id: 'image_to_3d',
      output_type: '3d',
      parameters: [],
      medias: [{ name: 'medias', type: 'image', roles: ['image'], required: true, max: 1 }],
    } as unknown as ModelSpec
    const spec = buildFormSpec(model)
    expect(spec.basic.some((f) => f.name === 'prompt')).toBe(false)
  })
})
