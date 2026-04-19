import { describe, expect, it } from 'vitest'
import { createMockProvider } from '@opengtm/providers'
import { runGovernedLoop } from '../src/index.js'

describe('loop: runtime limits', () => {
  it('stops at step limit', async () => {
    const provider = createMockProvider()
    const result = await runGovernedLoop({ provider, goal: 'x', limits: { maxSteps: 3 } })
    expect(result.status).toBe('stopped')
    expect(result.reason).toBe('step-limit')
    expect(result.steps).toHaveLength(3)
  })

  it('stops at cost limit', async () => {
    const provider = {
      ...createMockProvider(),
      async generate(input: any) {
        const out = await createMockProvider().generate(input)
        return { ...out, costUsd: 1 }
      }
    }
    const result = await runGovernedLoop({ provider, goal: 'x', limits: { maxSteps: 10, maxCostUsd: 2 } })
    expect(result.status).toBe('stopped')
    expect(result.reason).toBe('cost-limit')
  })

  it('stops at time limit', async () => {
    const provider = {
      ...createMockProvider(),
      async generate(input: any) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return createMockProvider().generate(input)
      }
    }

    const result = await runGovernedLoop({ provider, goal: 'x', limits: { maxSteps: 10, maxMillis: 1 } })
    expect(result.status).toBe('stopped')
    expect(result.reason).toBe('time-limit')
    expect(result.steps.length).toBeGreaterThan(0)
  })
})
