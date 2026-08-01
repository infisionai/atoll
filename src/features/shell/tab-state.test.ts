import { describe, expect, it } from 'vitest'
import { HOME_TAB, initialTabs, tabReducer, type TabState } from './tab-state'

const s = (tabs: string[], active: string): TabState => ({ tabs, active })

describe('tab/open', () => {
  it('adds a new tab and activates it', () => {
    expect(tabReducer(initialTabs, { type: 'tab/open', id: 'a' })).toEqual(s(['a'], 'a'))
  })

  it('only switches the active tab when it is already open', () => {
    expect(tabReducer(s(['a', 'b'], 'a'), { type: 'tab/open', id: 'b' })).toEqual(s(['a', 'b'], 'b'))
  })
})

describe('tab/close', () => {
  it('keeps the active tab when closing an inactive one', () => {
    expect(tabReducer(s(['a', 'b'], 'a'), { type: 'tab/close', id: 'b' })).toEqual(s(['a'], 'a'))
  })

  it('moves to the right neighbor when closing the active tab', () => {
    expect(tabReducer(s(['a', 'b', 'c'], 'b'), { type: 'tab/close', id: 'b' })).toEqual(
      s(['a', 'c'], 'c'),
    )
  })

  it('falls back to the left neighbor when there is none on the right', () => {
    expect(tabReducer(s(['a', 'b'], 'b'), { type: 'tab/close', id: 'b' })).toEqual(s(['a'], 'a'))
  })

  it('returns to Home when the last tab closes', () => {
    expect(tabReducer(s(['a'], 'a'), { type: 'tab/close', id: 'a' })).toEqual(s([], HOME_TAB))
  })

  it('ignores closing a tab that does not exist', () => {
    const st = s(['a'], 'a')
    expect(tabReducer(st, { type: 'tab/close', id: 'x' })).toBe(st)
  })
})

describe('tab/activate', () => {
  it('only open tabs and Home can be activated', () => {
    expect(tabReducer(s(['a'], HOME_TAB), { type: 'tab/activate', id: 'a' }).active).toBe('a')
    expect(tabReducer(s(['a'], 'a'), { type: 'tab/activate', id: HOME_TAB }).active).toBe(HOME_TAB)
    const st = s(['a'], 'a')
    expect(tabReducer(st, { type: 'tab/activate', id: 'ghost' })).toBe(st)
  })
})
