import { describe, expect, it } from 'vitest'
import { createWorkingContext } from '../src/index.js'

describe('memory: working-context', () => {
  it('sets and gets values', () => {
    const ctx = createWorkingContext()
    ctx.set('user.name', 'Earl')
    expect(ctx.get('user.name')).toBe('Earl')
    expect(ctx.has('user.name')).toBe(true)
    expect(ctx.size()).toBe(1)
  })

  it('overwrites on repeated set and updates timestamp', () => {
    let tick = 0
    const ctx = createWorkingContext({ now: () => new Date(1_700_000_000_000 + tick++) })
    ctx.set('k', 'v1')
    ctx.set('k', 'v2')
    expect(ctx.get('k')).toBe('v2')
    expect(ctx.size()).toBe(1)
  })

  it('delete returns false for missing keys and pinned entries', () => {
    const ctx = createWorkingContext()
    expect(ctx.delete('nope')).toBe(false)
    ctx.set('pinned', 'x', { pinned: true })
    expect(ctx.delete('pinned')).toBe(false)
    expect(ctx.get('pinned')).toBe('x')
  })

  it('clear removes only unpinned entries', () => {
    const ctx = createWorkingContext()
    ctx.set('a', '1')
    ctx.set('b', '2', { pinned: true })
    ctx.clear()
    expect(ctx.has('a')).toBe(false)
    expect(ctx.has('b')).toBe(true)
  })

  it('snapshot returns entries sorted by key and totalChars', () => {
    const ctx = createWorkingContext()
    ctx.set('z', 'last')
    ctx.set('a', 'first')
    const snap = ctx.snapshot()
    expect(snap.entries.map((e) => e.key)).toEqual(['a', 'z'])
    expect(snap.totalChars).toBe('z'.length + 'last'.length + 'a'.length + 'first'.length)
  })

  it('toPromptSection returns empty string when empty', () => {
    const ctx = createWorkingContext()
    expect(ctx.toPromptSection()).toBe('')
  })

  it('toPromptSection formats entries', () => {
    const ctx = createWorkingContext()
    ctx.set('user.name', 'Earl')
    ctx.set('task', 'build harness')
    const section = ctx.toPromptSection()
    expect(section).toContain('<working_context>')
    expect(section).toContain('user.name: Earl')
    expect(section).toContain('task: build harness')
    expect(section).toContain('</working_context>')
  })

  it('preserves pinned status across re-set', () => {
    const ctx = createWorkingContext()
    ctx.set('k', 'v1', { pinned: true })
    ctx.set('k', 'v2')
    expect(ctx.entries()[0].pinned).toBe(true)
  })
})
