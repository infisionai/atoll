import type { PortValueType } from './graph/connect-rules'
import type { ModelSpec, ParamSpec } from './model-spec'

/** Parameter spec → form control decisions. All pure functions — unit test targets */

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'slider'
  | 'segment'
  | 'select'
  | 'toggle'
  | 'tags'
  | 'media'
  | 'voice'

export interface FieldSpec {
  name: string
  label: string
  kind: FieldKind
  required: boolean
  /** Value type that can flow into this field's input port. Scalar parameters are text */
  portType: PortValueType
  /** Whether to attach an input port — only prompts (text instructions) and media are connectable. Scalar attributes are false */
  connectable: boolean
  description?: string
  options?: string[]
  min?: number
  max?: number
  default?: unknown
  /** media only — accepts multiple items (tile row) */
  multiple?: boolean
  /** media only — maximum item count. Multiple with no value means unlimited */
  maxItems?: number
  /** media only — catalog role name (start_image, etc.) */
  role?: string
}

/** Maximum options to show as a segment (button row) — beyond this use a select */
const SEGMENT_MAX = 4

function isPromptLike(p: ParamSpec): boolean {
  return /prompt/i.test(p.name)
}

export function paramToField(p: ParamSpec): FieldSpec {
  const base = {
    name: p.name,
    label: p.name.replace(/_/g, ' '),
    required: p.required === 'required',
    portType: 'text' as const,
    connectable: isPromptLike(p),
    description: p.description,
    default: p.default,
  }

  switch (p.type) {
    case 'bool':
      return { ...base, kind: 'toggle' }
    case 'string_array':
      return { ...base, kind: 'tags' }
    case 'number':
      if (p.min !== undefined && p.max !== undefined) {
        return { ...base, kind: 'slider', min: p.min, max: p.max }
      }
      return { ...base, kind: 'number', min: p.min, max: p.max }
    case 'string':
      if (p.options && p.options.length > 0) {
        return {
          ...base,
          kind: p.options.length <= SEGMENT_MAX ? 'segment' : 'select',
          options: p.options,
        }
      }
      return { ...base, kind: isPromptLike(p) ? 'textarea' : 'text' }
  }
}

export interface FormSpec {
  /** Always-visible fields: prompt + required parameters + aspect ratio */
  basic: FieldSpec[]
  /** Optional parameters that go inside the Advanced Parameters fold */
  advanced: FieldSpec[]
}

/** Output types that take a prompt */
const PROMPT_OUTPUT_TYPES = ['image', 'video', 'audio', '3d']

/**
 * Model spec → form spec.
 * - The prompt is a tool-level input, not part of the catalog `parameters[]`, so when
 *   the model parameters have no prompt-like entry, inject a standard prompt field at the front.
 * - If the model has a prompt-like parameter, promote it to basic even when optional
 *   (the prompt must not hide inside Advanced).
 * - Aspect ratio (aspect_ratios) is a model-level attribute but is folded in as a form field.
 */
const ROLE_LABELS: Record<string, string> = {
  image: 'Input image',
  video: 'Input video',
  audio: 'Input audio',
  start_image: 'Start frame',
  end_image: 'End frame',
  input_video: 'Input video',
  input_audio: 'Input audio',
  image_references: 'Reference images',
  video_references: 'Reference videos',
  audio_references: 'Reference audio',
}

/** Derive the value type from the role name (video_references → video) */
function roleType(role: string, fallback: string): PortValueType {
  if (role.includes('video')) return 'video'
  if (role.includes('audio')) return 'audio'
  if (role.includes('image')) return 'image'
  return fallback === 'video' || fallback === 'audio' ? fallback : 'image'
}

export function buildFormSpec(model: ModelSpec): FormSpec {
  const fields = (model.parameters ?? []).map(paramToField)

  const promptLike = (f: FieldSpec) => /prompt/i.test(f.name)
  const basic = fields.filter((f) => f.required || promptLike(f))
  const advanced = fields.filter((f) => !f.required && !promptLike(f))

  // Main prompt injection — auxiliary prompts like negative_prompt/texture_prompt are
  // not the main prompt (tripo_3d once got a 422 because negative_prompt suppressed the injection).
  // 3D models with required media (image→3D, etc.) are promptless pipelines, so skip injection
  const hasMainPrompt = fields.some((f) => f.name === 'prompt')
  const skipFor3dMedia =
    model.output_type === '3d' && (model.medias ?? []).some((m) => m.required === true)
  if (!hasMainPrompt && !skipFor3dMedia && PROMPT_OUTPUT_TYPES.includes(model.output_type)) {
    basic.unshift({
      name: 'prompt',
      label: 'prompt',
      kind: 'textarea',
      required: true,
      portType: 'text',
      connectable: true,
      description: 'Generation instructions',
    })
  }

  // Media inputs — from the catalog medias[].
  // Multiple roles split into per-role slot fields (position matters for start_image / end_image).
  // Reference-style (_references) or max>1 means a multi-tile input.
  for (const media of model.medias ?? []) {
    const roles = media.roles?.length ? media.roles : ['image']
    const multiRole = roles.length > 1
    for (const role of roles) {
      const multiple = role.endsWith('_references') || (media.max ?? 1) > 1
      basic.push({
        name: multiRole ? `${media.name}.${role}` : media.name,
        label: ROLE_LABELS[role] ?? role.replace(/_/g, ' '),
        kind: 'media',
        required: media.required === true && !multiRole,
        portType: roleType(role, media.type),
        connectable: true,
        multiple,
        maxItems: multiple ? media.max : 1,
        role,
      })
    }
  }

  if (model.aspect_ratios && model.aspect_ratios.length > 0) {
    basic.push({
      name: 'aspect_ratio',
      label: 'Aspect ratio',
      kind: model.aspect_ratios.length <= SEGMENT_MAX ? 'segment' : 'select',
      required: false,
      portType: 'text',
      connectable: false,
      options: model.aspect_ratios,
    })
  }

  return { basic, advanced }
}

/** Port name → field spec */
export function fieldSpecOf(model: ModelSpec, portName: string): FieldSpec | null {
  const spec = buildFormSpec(model)
  return [...spec.basic, ...spec.advanced].find((f) => f.name === portName) ?? null
}

/** Port name → value type. The output port (__out) follows the model's output_type */
export function portTypeOf(model: ModelSpec, portName: string): PortValueType | null {
  if (portName === '__out') {
    const t = model.output_type
    return t === 'image' || t === 'video' || t === 'audio' || t === '3d' ? t : null
  }
  return fieldSpecOf(model, portName)?.portType ?? null
}

/** Maximum connections/items a port can accept */
export function maxItemsOf(model: ModelSpec, portName: string): number {
  const field = fieldSpecOf(model, portName)
  if (!field || field.kind !== 'media') return 1
  if (!field.multiple) return 1
  return field.maxItems ?? Infinity
}

/** Initial form values: only fields with an explicit default are filled */
export function initialValues(spec: FormSpec): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const f of [...spec.basic, ...spec.advanced]) {
    if (f.default !== undefined) values[f.name] = f.default
  }
  return values
}
