import type { FieldSpec } from '../form-spec'
import type { PortValueType } from './connect-rules'

/**
 * Edit-op node specs — three image edits + three audio ops.
 * (Optional) media input → parameters → one media output.
 */

export type EditOpId =
  | 'upscale'
  | 'remove_background'
  | 'outpaint'
  | 'voiceover'
  | 'change_voice'
  | 'translate_voice'

export interface EditOpSpec {
  id: EditOpId
  name: string
  /** Higgsfield MCP tool name (marked with a question mark when unverified) */
  mcpTool: string
  /** Input media type — null means a source-style op with no input port (voiceover) */
  input: PortValueType | null
  output: PortValueType
  /** Cost characteristics — a "Uses N credits" style note. Actual credit values are fetched later */
  costNote: string
  /** Confirmed credits — shown as ⚡N when present */
  credits?: number
  fields: FieldSpec[]
}

export const EDIT_OPS: Record<EditOpId, EditOpSpec> = {
  upscale: {
    id: 'upscale',
    name: 'Upscale',
    mcpTool: 'upscale_image',
    input: 'image',
    output: 'image',
    costNote: 'Pre-run estimate',
    fields: [
      {
        name: 'scale',
        label: 'Scale',
        kind: 'segment',
        required: false,
        portType: 'text',
        connectable: false,
        options: ['2x', '4x'],
        default: '2x',
        description: 'Output resolution = source × scale',
      },
      {
        name: 'provider',
        label: 'Engine',
        kind: 'segment',
        required: false,
        portType: 'text',
        connectable: false,
        options: ['bytedance', 'topaz'],
        default: 'bytedance',
        description: 'Supported resolutions vary by engine',
      },
    ],
  },
  remove_background: {
    id: 'remove_background',
    name: 'Remove Background',
    mcpTool: 'remove_background',
    input: 'image',
    output: 'image',
    costNote: 'Charged immediately · no estimate',
    fields: [],
  },
  outpaint: {
    id: 'outpaint',
    name: 'Expand',
    mcpTool: 'outpaint_image',
    input: 'image',
    output: 'image',
    costNote: 'Pre-run estimate',
    fields: [
      {
        name: 'aspect_ratio',
        label: 'Aspect ratio',
        kind: 'segment',
        required: false,
        portType: 'text',
        connectable: false,
        options: ['1:1', '4:3', '3:4', '16:9', '9:16'],
        description: 'Expands the canvas to this aspect ratio',
      },
    ],
  },

  // ── Three audio ops ──

  voiceover: {
    id: 'voiceover',
    name: 'Voiceover',
    mcpTool: 'text2speech_v2',
    input: null, // Source-style — creates speech from text
    output: 'audio',
    costNote: 'Varies by model',
    fields: [
      {
        name: 'prompt',
        label: 'Script',
        kind: 'textarea',
        required: true,
        portType: 'text',
        connectable: true,
        description: 'Text to read aloud',
      },
      {
        name: 'voice',
        label: 'Voice',
        kind: 'voice',
        required: false,
        portType: 'text',
        connectable: false,
        default: 'EMILY',
        description: 'Voice preset — preview supported',
      },
      {
        name: 'engine',
        label: 'Engine',
        kind: 'select',
        required: false,
        portType: 'text',
        connectable: false,
        options: ['Eleven v3', 'Seed Audio 1.0', 'Qwen Audio 3.0', 'MiniMax Speech 2.8 HD', 'Seed Speech', 'VibeVoice'],
        default: 'Eleven v3',
      },
    ],
  },
  change_voice: {
    id: 'change_voice',
    name: 'Change Voice',
    mcpTool: 'change_voice(?)',
    input: 'audio',
    output: 'audio',
    costNote: 'Fixed',
    credits: 2,
    fields: [
      {
        name: 'voice',
        label: 'Voice',
        kind: 'voice',
        required: false,
        portType: 'text',
        connectable: false,
        default: 'EMILY',
      },
    ],
  },
  translate_voice: {
    id: 'translate_voice',
    name: 'Translate Voice',
    mcpTool: 'translate_voice(?)',
    input: 'audio',
    output: 'audio',
    costNote: 'Fixed',
    credits: 45,
    fields: [
      {
        name: 'language',
        label: 'Language',
        kind: 'select',
        required: false,
        portType: 'text',
        connectable: false,
        options: ['ENGLISH', 'KOREAN', 'JAPANESE', 'SPANISH', 'FRENCH', 'GERMAN', 'CHINESE'],
        default: 'ENGLISH',
      },
    ],
  },
}

/** Initial values for fields with an explicit default */
export function editInitialValues(op: EditOpId): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const f of EDIT_OPS[op].fields) {
    if (f.default !== undefined) values[f.name] = f.default
  }
  return values
}
