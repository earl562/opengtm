import { describe, expect, it } from 'vitest'
import { createContextBudget, defaultTokenEstimator } from '../src/index.js'

describe('memory: context-budget', () => {
  it('default estimator is ceil(chars/4)', () => {
    expect(defaultTokenEstimator('')).toBe(0)
    expect(defaultTokenEstimator('abcd')).toBe(1)
    expect(defaultTokenEstimator('abcde')).toBe(2)
    expect(defaultTokenEstimator('a'.repeat(400))).toBe(100)
  })

  it('transitions ok -> warn -> flush', () => {
    const b = createContextBudget({
      maxTokens: 100,
      warnThreshold: 0.7,
      flushThreshold: 0.9
    })
    expect(b.status(0).state).toBe('ok')
    expect(b.status(69).state).toBe('ok')
    expect(b.status(70).state).toBe('warn')
    expect(b.status(89).state).toBe('warn')
    expect(b.status(90).state).toBe('flush')
    expect(b.status(150).state).toBe('flush')
  })

  it('reports usageRatio and thresholds', () => {
    const b = createContextBudget({ maxTokens: 1000 })
    const s = b.status(500)
    expect(s.usageRatio).toBe(0.5)
    expect(s.warnAtTokens).toBe(700)
    expect(s.flushAtTokens).toBe(900)
    expect(s.maxTokens).toBe(1000)
  })

  it('check uses estimator on text', () => {
    const b = createContextBudget({ maxTokens: 10 })
    const s = b.check('a'.repeat(40))
    expect(s.usedTokens).toBe(10)
    expect(s.state).toBe('flush')
  })

  it('fits respects headroom', () => {
    const b = createContextBudget({ maxTokens: 10 })
    expect(b.fits('a'.repeat(20), 0)).toBe(true)
    expect(b.fits('a'.repeat(40), 1)).toBe(false)
  })

  it('rejects invalid thresholds', () => {
    expect(() => createContextBudget({ maxTokens: 0 })).toThrow()
    expect(() =>
      createContextBudget({ maxTokens: 10, warnThreshold: 0 })
    ).toThrow()
    expect(() =>
      createContextBudget({ maxTokens: 10, warnThreshold: 0.9, flushThreshold: 0.5 })
    ).toThrow()
  })

  it('custom estimator is used', () => {
    const b = createContextBudget({
      maxTokens: 100,
      estimator: () => 42
    })
    expect(b.check('anything').usedTokens).toBe(42)
  })
})
