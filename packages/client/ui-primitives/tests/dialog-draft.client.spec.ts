// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearDialogDraft, readDialogDraft, writeDialogDraft } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('dialog draft persistence', () => {
  it('round-trips a whole value under the shared prefix', () => {
    expect(readDialogDraft('spec.round', { path: '/default' })).toEqual({ path: '/default' })
    writeDialogDraft('spec.round', { path: '/tmp/x', showHidden: true })
    expect(readDialogDraft<{ path: string; showHidden: boolean }>('spec.round', { path: '/default', showHidden: false })).toEqual({
      path: '/tmp/x',
      showHidden: true,
    })
    clearDialogDraft('spec.round')
    expect(readDialogDraft('spec.round', { path: '/default' })).toEqual({ path: '/default' })
  })

  it('treats an unreadable entry as absent and removes it', () => {
    localStorage.setItem('dsh.draft.spec.corrupt', '{not json')
    expect(readDialogDraft('spec.corrupt', 'fallback')).toBe('fallback')
    expect(localStorage.getItem('dsh.draft.spec.corrupt')).toBeNull()
  })

  it('is inert without localStorage (write, read, and clear all no-op)', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readDialogDraft('spec.gone', false)).toBe(false)
    expect(() => { writeDialogDraft('spec.gone', { a: 1 }) }).not.toThrow()
    expect(() => { clearDialogDraft('spec.gone') }).not.toThrow()
  })

  it('keeps working when the quota rejects a write (console diagnostic, no throw)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded') },
      removeItem: () => {},
    })
    expect(() => { writeDialogDraft('spec.full', { a: 1 }) }).not.toThrow()
    expect(error).toHaveBeenCalledOnce()
  })

  it('keeps a corrupt read quiet when removal itself fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{not json',
      setItem: () => {},
      removeItem: () => { throw new Error('locked') },
    })
    expect(readDialogDraft('spec.locked', 'fallback')).toBe('fallback')
  })

  it('treats a failing getItem as absent and a failing clear as a no-op', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('unavailable') },
      setItem: () => {},
      removeItem: () => { throw new Error('locked') },
    })
    expect(readDialogDraft('spec.denied', 'fallback')).toBe('fallback')
    expect(() => { clearDialogDraft('spec.denied') }).not.toThrow()
  })
})
