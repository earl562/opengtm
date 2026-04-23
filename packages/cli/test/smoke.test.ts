import { describe, it, expect } from 'vitest'

import { createCliRouter } from '../src/router.js'

describe('smoke', () => {
  it('routes run opengtm to the integrated runtime smoke harness', async () => {
    const router = createCliRouter()

    const result = await router(['run', 'opengtm'])

    expect('scenarios' in result).toBe(true)
    if (!('scenarios' in result)) {
      throw new Error('Expected opengtm smoke summary')
    }

    expect(result).toMatchObject({
      harness: 'integrated-runtime-smoke',
      scenarioCount: 3
    })
    expect(result.scenarios).toEqual([
      expect.objectContaining({
        name: 'safe-read-executes',
        connectorStatus: 'executed',
        approvalCount: 0,
        omittedPromptSections: []
      }),
      expect.objectContaining({
        name: 'approval-gated-write',
        connectorStatus: 'skipped-approval',
        approvalCount: 1,
        omittedPromptSections: []
      }),
      expect.objectContaining({
        name: 'context-budget-omits-optional-sections',
        connectorStatus: null,
        approvalCount: 0,
        omittedPromptSections: expect.arrayContaining([
          'working-context',
          'retrieved-memory',
          'disclosed-skills',
          'connector-guidance'
        ])
      })
    ])
  })

  it('supports the top-level smoke alias', async () => {
    const router = createCliRouter()

    const aliasResult = await router(['smoke'])
    const canonicalResult = await router(['run', 'opengtm'])

    expect(aliasResult).toEqual(canonicalResult)
  })
})
