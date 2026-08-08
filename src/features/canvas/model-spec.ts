/** Model spec of the Higgsfield catalog (catalog.json) — shape verified against the live server */

export type ParamType = 'string' | 'number' | 'bool' | 'string_array'

export interface ParamOption {
  label: string
  value: string
}

export interface ParamSpec {
  name: string
  required: 'required' | 'optional'
  type: ParamType
  description?: string
  default?: unknown
  options?: Array<string | ParamOption>
  min?: number
  max?: number
  format?: string
  pattern?: string
  nullable?: boolean
}

export interface MediaSpec {
  name: string
  type: string
  roles?: string[]
  /** Provider wire input names — e.g. image_1..image_7 */
  provider_inputs?: string[]
  /** Minimum input count — defaults to 1 when required=true */
  min?: number
  /** Maximum input count — absent means unlimited for reference-style, otherwise 1 */
  max?: number
  required?: boolean
}

export interface ModelSpec {
  id: string
  name: string
  /** Owning MCP provider id (higgsfield | magnific …) — defaults to higgsfield when omitted */
  provider?: string
  provider_name?: string
  /** Provider-specific generation tool and canonical model ID — preserved for the dynamic catalog */
  provider_tool?: string
  provider_model?: string
  /** When false, the frontend doesn't call the estimate IPC */
  supports_estimate?: boolean
  /** The count param is app-level fan-out (N parallel submits) — the provider has no native batch */
  client_batch?: boolean
  /** Unit displayed beside a local/provider estimate; existing providers default to cr */
  estimate_unit?: string
  description?: string
  output_type: 'image' | 'video' | 'audio' | '3d' | string
  parameters?: ParamSpec[]
  medias?: MediaSpec[]
  aspect_ratios?: string[]
  tags?: string[]
}
