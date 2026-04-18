import type { OpenGtmProvider } from '@opengtm/providers'

export type OpenGtmLoopPhase = 'plan' | 'observe' | 'act' | 'reflect'

export interface OpenGtmLoopLimits {
  maxSteps: number
  maxCostUsd?: number
  maxMillis?: number
}

export interface OpenGtmLoopStep {
  phase: OpenGtmLoopPhase
  prompt: string
  outputText?: string
  costUsd?: number
}

export interface OpenGtmLoopResult {
  status: 'completed' | 'stopped'
  reason?: 'step-limit' | 'cost-limit' | 'time-limit'
  steps: OpenGtmLoopStep[]
  totalCostUsd: number
}

export async function runGovernedLoop({
  provider,
  goal,
  limits
}: {
  provider: OpenGtmProvider
  goal: string
  limits: OpenGtmLoopLimits
}): Promise<OpenGtmLoopResult> {
  const startedAt = Date.now()
  const steps: OpenGtmLoopStep[] = []
  let totalCostUsd = 0

  const phases: OpenGtmLoopPhase[] = ['plan', 'observe', 'act', 'reflect']

  for (let i = 0; i < limits.maxSteps; i++) {
    const phase = phases[i % phases.length]
    if (limits.maxMillis && Date.now() - startedAt > limits.maxMillis) {
      return { status: 'stopped', reason: 'time-limit', steps, totalCostUsd }
    }
    if (limits.maxCostUsd !== undefined && totalCostUsd >= limits.maxCostUsd) {
      return { status: 'stopped', reason: 'cost-limit', steps, totalCostUsd }
    }

    const prompt = `[${phase}] ${goal}`
    const output = await provider.generate({ prompt })
    totalCostUsd += output.costUsd || 0
    steps.push({ phase, prompt, outputText: output.text, costUsd: output.costUsd || 0 })
  }

  return {
    status: 'stopped',
    reason: 'step-limit',
    steps,
    totalCostUsd
  }
}
