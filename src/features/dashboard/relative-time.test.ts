import { describe, expect, it } from 'vitest'
import { relativeTime } from './relative-time'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('relativeTime', () => {
  const now = 1_000_000_000_000

  it('returns "just now" under one minute', () => {
    expect(relativeTime(now - 30_000, now)).toBe('just now')
  })

  it('steps down through minute, hour, day, month, and year units', () => {
    expect(relativeTime(now - 5 * MIN, now)).toBe('5m ago')
    expect(relativeTime(now - 3 * HOUR, now)).toBe('3h ago')
    expect(relativeTime(now - 29 * DAY, now)).toBe('29d ago')
    expect(relativeTime(now - 65 * DAY, now)).toBe('2mo ago')
    expect(relativeTime(now - 400 * DAY, now)).toBe('1y ago')
  })
})
