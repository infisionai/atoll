import { describe, expect, it } from 'vitest'
import { imeStep } from './korean-ime'

describe('imeStep — WKWebView Hangul composition state transitions', () => {
  it('composition replacement (insertReplacementText) swaps the pending syllable', () => {
    expect(imeStep('', 'insertText', 'ㅎ')).toEqual({ pending: 'ㅎ', commit: undefined })
    expect(imeStep('ㅎ', 'insertReplacementText', '하')).toEqual({ pending: '하' })
    expect(imeStep('하', 'insertReplacementText', '한')).toEqual({ pending: '한' })
  })

  it('starting a new syllable (insertText) commits the previous one', () => {
    expect(imeStep('한', 'insertText', 'ㄱ')).toEqual({ pending: 'ㄱ', commit: '한' })
  })

  it('non-Hangul data leaves the state untouched (space and Latin input are handled by onData)', () => {
    expect(imeStep('한', 'insertText', ' ')).toEqual({ pending: '한' })
    expect(imeStep('한', 'insertText', 'a')).toEqual({ pending: '한' })
    expect(imeStep('한', 'deleteContentBackward', '')).toEqual({ pending: '한' })
  })

  it('other types such as backspace decomposition also apply the new composition value', () => {
    expect(imeStep('한', 'deleteContentBackward', '하')).toEqual({ pending: '하' })
  })

  it('full "한글" sequence', () => {
    let pending = ''
    const committed: string[] = []
    const feed = (t: string, d: string) => {
      const r = imeStep(pending, t, d)
      if (r.commit) committed.push(r.commit)
      pending = r.pending
    }
    feed('insertText', 'ㅎ')
    feed('insertReplacementText', '하')
    feed('insertReplacementText', '한')
    feed('insertText', 'ㄱ') // '한' is finalized
    feed('insertReplacementText', '그')
    feed('insertReplacementText', '글')
    expect(committed).toEqual(['한'])
    expect(pending).toBe('글') // Finalized via commitPending on a terminating character/control key
  })
})
