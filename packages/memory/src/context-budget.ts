export interface ContextBudgetOptions {
  maxTokens: number
  warnThreshold?: number
  flushThreshold?: number
  estimator?: (text: string) => number
}

export type ContextBudgetState = 'ok' | 'warn' | 'flush'

export interface ContextBudgetStatus {
  state: ContextBudgetState
  usedTokens: number
  maxTokens: number
  warnAtTokens: number
  flushAtTokens: number
  usageRatio: number
}

export interface ContextBudget {
  estimate(text: string): number
  status(usedTokens: number): ContextBudgetStatus
  check(text: string): ContextBudgetStatus
  fits(text: string, headroomTokens?: number): boolean
}

export function defaultTokenEstimator(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export function createContextBudget(opts: ContextBudgetOptions): ContextBudget {
  if (opts.maxTokens <= 0) {
    throw new Error('ContextBudget: maxTokens must be > 0')
  }
  const warnThreshold = opts.warnThreshold ?? 0.7
  const flushThreshold = opts.flushThreshold ?? 0.9
  if (warnThreshold <= 0 || warnThreshold >= 1) {
    throw new Error('ContextBudget: warnThreshold must be in (0, 1)')
  }
  if (flushThreshold <= warnThreshold || flushThreshold > 1) {
    throw new Error('ContextBudget: flushThreshold must be > warnThreshold and <= 1')
  }

  const estimator = opts.estimator ?? defaultTokenEstimator
  const warnAtTokens = Math.floor(opts.maxTokens * warnThreshold)
  const flushAtTokens = Math.floor(opts.maxTokens * flushThreshold)

  const statusFor = (used: number): ContextBudgetStatus => {
    const state: ContextBudgetState =
      used >= flushAtTokens ? 'flush' : used >= warnAtTokens ? 'warn' : 'ok'
    return {
      state,
      usedTokens: used,
      maxTokens: opts.maxTokens,
      warnAtTokens,
      flushAtTokens,
      usageRatio: used / opts.maxTokens
    }
  }

  return {
    estimate: estimator,
    status: statusFor,
    check(text) {
      return statusFor(estimator(text))
    },
    fits(text, headroomTokens = 0) {
      return estimator(text) + headroomTokens <= opts.maxTokens
    }
  }
}
