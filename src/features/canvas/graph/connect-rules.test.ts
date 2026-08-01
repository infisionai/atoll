import { describe, expect, it } from 'vitest'
import { canConnect, compatible, type PortRef } from './connect-rules'

const out = (nodeId: string, type: PortRef['type']): PortRef => ({ direction: 'out', nodeId, type })
const inp = (nodeId: string, type: PortRef['type']): PortRef => ({ direction: 'in', nodeId, type })

describe('compatible — value types', () => {
  it('only identical types flow', () => {
    expect(compatible('text', 'text')).toBe(true)
    expect(compatible('image', 'image')).toBe(true)
    expect(compatible('image', 'text')).toBe(false)
    expect(compatible('text', 'video')).toBe(false)
  })
})

describe('canConnect — direction and target', () => {
  it('only out → in is allowed', () => {
    expect(canConnect(out('a', 'image'), inp('b', 'image'))).toBe(true)
    expect(canConnect(out('a', 'image'), out('b', 'image'))).toBe(false)
    expect(canConnect(inp('a', 'image'), inp('b', 'image'))).toBe(false)
    expect(canConnect(inp('a', 'image'), out('b', 'image'))).toBe(false)
  })

  it('cannot connect to its own node', () => {
    expect(canConnect(out('a', 'image'), inp('a', 'image'))).toBe(false)
  })

  it('mismatched types fail even with the right direction', () => {
    expect(canConnect(out('a', 'image'), inp('b', 'text'))).toBe(false)
  })
})
