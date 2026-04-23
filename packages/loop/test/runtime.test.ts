import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildMockConnectorBundle } from '@opengtm/connectors'
import { createContextBudget, createMemoryManager, createWorkingContext } from '@opengtm/memory'
import { createJsonlRunLogger } from '@opengtm/observability'
import type { OpenGtmGenerateInput, OpenGtmGenerateOutput, OpenGtmProvider } from '@opengtm/providers'
import { createSkillRegistryV2, makeSkillArtifact } from '@opengtm/skills'
import { createStorage } from '@opengtm/storage'
import type { SkillManifest } from '@opengtm/skills'
import { runGovernedLoop } from '../src/index.js'

function makeManifest(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return {
    id: 'lead_research',
    name: 'Lead Research',
    version: '1.0.0',
    persona: 'SDR',
    summary: 'Gather lead context before outreach.',
    triggers: [{ type: 'intent', match: 'research this lead' }],
    preconditions: ['crm record exists'],
    steps: [
      { id: 'load', description: 'Load CRM context' },
      { id: 'brief', description: 'Write the brief' }
    ],
    antiPatterns: ['do not fabricate details'],
    validations: ['cite retrieved evidence'],
    requiredConnectors: [{ family: 'crm', capability: 'lead.read' }],
    tags: ['research', 'lead'],
    composition: 'serial',
    ...overrides
  }
}

function createProvider(
  resolver: (input: OpenGtmGenerateInput) => Promise<OpenGtmGenerateOutput> | OpenGtmGenerateOutput,
  id = 'test-provider'
): OpenGtmProvider {
  return {
    id,
    generate(input) {
      return Promise.resolve(resolver(input))
    }
  }
}

describe('loop: integrated runtime', () => {
  it('injects working context, memory, and skill disclosures into provider prompts', async () => {
    const prompts: string[] = []
    const workingContext = createWorkingContext()
    workingContext.set('account', 'Acme Corp')
    workingContext.set('priority', 'high')

    const storage = createStorage({ rootDir: mkdtempSync(join(tmpdir(), 'opengtm-loop-')) })
    const memory = createMemoryManager({ storage })
    await memory.write({
      workspaceId: 'w1',
      memoryType: 'semantic',
      scope: 'initiative:acme',
      content: 'Acme expanded the data team and uses Snowflake.',
      retrievalHints: ['acme', 'snowflake']
    })

    const skills = createSkillRegistryV2([
      makeSkillArtifact(makeManifest())
    ])

    const provider = createProvider((input) => {
      prompts.push(input.prompt)
      return {
        text: 'planned response',
        model: 'test',
        tokens: { input: input.prompt.length, output: 16 },
        costUsd: 0
      }
    })

    const result = await runGovernedLoop({
      provider,
      goal: 'research this lead for Acme',
      limits: { maxSteps: 1 },
      runtime: {
        workingContext,
        memory: {
          manager: memory,
          workspaceId: 'w1',
          scope: 'initiative:acme',
          autoStoreOutputs: false
        },
        skills: {
          registry: skills,
          disclosure: 'details'
        },
        connectors: {
          bundle: buildMockConnectorBundle()
        }
      }
    })

    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('<working_context>')
    expect(prompts[0]).toContain('account: Acme Corp')
    expect(prompts[0]).toContain('<retrieved_memory>')
    expect(prompts[0]).toContain('uses Snowflake')
    expect(prompts[0]).toContain('<relevant_skills>')
    expect(prompts[0]).toContain('# Lead Research v1.0.0')
    expect(prompts[0]).toContain('<connector_guidance>')
    expect(result.steps[0]?.memoryHits).toHaveLength(1)
    expect(result.steps[0]?.disclosedSkills).toEqual(['lead_research'])
  })

  it('routes phases through specialized providers and records applied system reminders', async () => {
    const calls: Array<{ providerId: string; prompt: string }> = []
    const makePhaseProvider = (id: string) => createProvider((input) => {
      calls.push({ providerId: id, prompt: input.prompt })
      return {
        text: id === 'act-provider'
          ? JSON.stringify({
              connectorAction: {
                family: 'docs',
                action: 'read-connector',
                target: 'brief.md',
                payload: { query: 'acme brief' }
              }
            })
          : 'continue',
        model: `${id}-model`,
        tokens: { input: input.prompt.length, output: 12 },
        costUsd: 0
      }
    }, id)

    const result = await runGovernedLoop({
      provider: makePhaseProvider('default-provider'),
      goal: 'review the Acme brief',
      limits: { maxSteps: 4 },
      runtime: {
        connectors: {
          bundle: buildMockConnectorBundle()
        },
        policy: {
          workItemId: 'work-safe',
          workspaceId: 'workspace-safe',
          lane: 'research'
        },
        phaseProviders: {
          plan: makePhaseProvider('plan-provider'),
          act: makePhaseProvider('act-provider'),
          reflect: makePhaseProvider('reflect-provider')
        }
      }
    })

    expect(calls.map((call) => call.providerId)).toEqual([
      'plan-provider',
      'default-provider',
      'act-provider',
      'reflect-provider'
    ])
    expect(result.steps.map((step) => step.providerId)).toEqual([
      'plan-provider',
      'default-provider',
      'act-provider',
      'reflect-provider'
    ])
    expect(result.steps[0]?.providerModel).toBe('plan-provider-model')
    expect(result.steps[2]?.providerModel).toBe('act-provider-model')
    expect(result.steps[2]?.appliedReminderIds).toEqual(expect.arrayContaining([
      'grounded-evidence',
      'act-one-connector',
      'approval-discipline'
    ]))
    expect(calls[2]?.prompt).toContain('<system_reminders>')
    expect(calls[2]?.prompt).toContain('emit exactly one connectorAction JSON object')
    expect(calls[3]?.prompt).toContain('traceable outcomes')
  })

  it('executes connector actions from provider output during the act phase', async () => {
    const workingContext = createWorkingContext()
    const provider = createProvider((input) => ({
      text: input.prompt.includes('[act]')
        ? JSON.stringify({
            connectorAction: {
              family: 'docs',
              action: 'read-connector',
              target: 'brief.md',
              payload: { query: 'acme brief' }
            },
            response: 'load docs context'
          })
        : 'continue',
      model: 'test',
      tokens: { input: input.prompt.length, output: 24 },
      costUsd: 0
    }))

    const result = await runGovernedLoop({
      provider,
      goal: 'review the Acme brief',
      limits: { maxSteps: 3 },
      runtime: {
        workingContext,
        connectors: {
          bundle: buildMockConnectorBundle()
        }
      }
    })

    const actStep = result.steps[2]
    expect(actStep?.phase).toBe('act')
    expect(actStep?.connectorAction).toEqual({
      family: 'docs',
      action: 'read-connector',
      target: 'brief.md',
      payload: { query: 'acme brief' }
    })
    expect(actStep?.connectorResult).toMatchObject({
      provider: 'mock-docs',
      family: 'docs',
      action: 'read-connector',
      executionMode: 'live',
      data: {
        target: 'brief.md',
        provider: 'mock-docs'
      }
    })
    expect(workingContext.get('last_connector_result')).toContain('mock-docs')
  })

  it('evaluates safe connector actions through policy and logs execution events', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-loop-observed-'))
    const logger = createJsonlRunLogger({ rootDir, runId: 'safe-read' })
    const provider = createProvider((input) => ({
      text: input.prompt.includes('[act]')
        ? JSON.stringify({
            connectorAction: {
              family: 'docs',
              action: 'read-connector',
              target: 'brief.md',
              payload: { query: 'acme brief' }
            }
          })
        : 'continue',
      model: 'test',
      tokens: { input: input.prompt.length, output: 12 },
      costUsd: 0
    }))

    const result = await runGovernedLoop({
      provider,
      goal: 'review the Acme brief',
      limits: { maxSteps: 3 },
      runtime: {
        connectors: {
          bundle: buildMockConnectorBundle()
        },
        policy: {
          workItemId: 'work-safe',
          workspaceId: 'workspace-safe',
          lane: 'research'
        },
        observability: { logger }
      }
    })

    const actStep = result.steps[2]
    expect(actStep?.connectorStatus).toBe('executed')
    expect(actStep?.policyDecision?.decision).toBe('allow')
    expect(actStep?.approvalRequest).toBeUndefined()
    expect(actStep?.connectorResult?.action).toBe('read-connector')
    expect(result.policyDecisions).toHaveLength(1)
    expect(result.approvalRequests).toHaveLength(0)
    expect(result.logFilePath).toBe(logger.logFilePath)

    const eventTypes = readFileSync(logger.logFilePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line).eventType)

    expect(eventTypes).toEqual(expect.arrayContaining([
      'run.start',
      'step.started',
      'policy.decision',
      'connector.attempted',
      'connector.executed',
      'step.completed',
      'run.summary'
    ]))
  })

  it('approval-gates high-risk connector actions and skips execution', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-loop-gated-'))
    const logger = createJsonlRunLogger({ rootDir, runId: 'gated-write' })
    const provider = createProvider((input) => ({
      text: input.prompt.includes('[act]')
        ? JSON.stringify({
            connectorAction: {
              family: 'docs',
              action: 'write-repo',
              target: 'notes.md',
              payload: { content: 'ship it' }
            }
          })
        : 'continue',
      model: 'test',
      tokens: { input: input.prompt.length, output: 12 },
      costUsd: 0
    }))

    const result = await runGovernedLoop({
      provider,
      goal: 'update the brief',
      limits: { maxSteps: 3 },
      runtime: {
        connectors: {
          bundle: buildMockConnectorBundle()
        },
        policy: {
          workItemId: 'work-gated',
          workspaceId: 'workspace-gated',
          lane: 'build-integrate'
        },
        observability: { logger }
      }
    })

    const actStep = result.steps[2]
    expect(actStep?.connectorStatus).toBe('skipped-approval')
    expect(actStep?.policyDecision?.decision).toBe('require-approval')
    expect(actStep?.approvalRequest?.status).toBe('pending')
    expect(actStep?.connectorResult).toBeUndefined()
    expect(result.policyDecisions).toHaveLength(1)
    expect(result.approvalRequests).toHaveLength(1)

    const lines = readFileSync(logger.logFilePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const entries = lines.map((line) => JSON.parse(line))
    expect(entries.every((entry) => typeof entry.eventType === 'string')).toBe(true)
    expect(entries.map((entry) => entry.eventType)).toEqual(expect.arrayContaining([
      'connector.attempted',
      'policy.decision',
      'approval.requested',
      'connector.skipped',
      'run.summary'
    ]))
  })

  it('uses context budget to trim optional prompt sections before provider calls', async () => {
    const prompts: string[] = []
    const workingContext = createWorkingContext()
    workingContext.set('account', 'Acme Corp with a very large internal context block that should be trimmed')

    const storage = createStorage({ rootDir: mkdtempSync(join(tmpdir(), 'opengtm-loop-budget-')) })
    const memory = createMemoryManager({ storage })
    await memory.write({
      workspaceId: 'w1',
      memoryType: 'semantic',
      scope: 'initiative:budget',
      content: 'Acme has a long memory snippet about expansion, hiring, product usage, and stakeholder movement.',
      retrievalHints: ['acme', 'budget', 'expansion']
    })

    const provider = createProvider((input) => {
      prompts.push(input.prompt)
      return {
        text: 'budgeted',
        model: 'test',
        tokens: { input: input.prompt.length, output: 8 },
        costUsd: 0
      }
    })

    const result = await runGovernedLoop({
      provider,
      goal: 'research this lead for Acme',
      limits: { maxSteps: 1 },
      runtime: {
        workingContext,
        memory: {
          manager: memory,
          workspaceId: 'w1',
          scope: 'initiative:budget',
          autoStoreOutputs: false
        },
        skills: {
          registry: createSkillRegistryV2([makeSkillArtifact(makeManifest())])
        },
        connectors: {
          bundle: buildMockConnectorBundle()
        },
        contextBudget: createContextBudget({
          maxTokens: 220,
          warnThreshold: 0.3,
          flushThreshold: 0.5,
          estimator: (text) => text.length
        })
      }
    })

    expect(prompts).toHaveLength(1)
    expect(prompts[0]).not.toContain('<retrieved_memory>')
    expect(prompts[0]).not.toContain('<relevant_skills>')
    expect(result.steps[0]?.omittedPromptSections).toEqual(expect.arrayContaining([
      'working-context',
      'retrieved-memory',
      'disclosed-skills',
      'connector-guidance'
    ]))
    expect(result.steps[0]?.budgetState).toBe('flush')
  })

  it('injects budget and custom reminders when context pressure rises', async () => {
    const prompts: string[] = []
    const workingContext = createWorkingContext()
    workingContext.set('account', 'Acme Corp with a very large internal context block that should be trimmed')

    const storage = createStorage({ rootDir: mkdtempSync(join(tmpdir(), 'opengtm-loop-reminders-')) })
    const memory = createMemoryManager({ storage })
    await memory.write({
      workspaceId: 'w1',
      memoryType: 'semantic',
      scope: 'initiative:budget',
      content: 'Acme has a long memory snippet about expansion, hiring, product usage, and stakeholder movement.',
      retrievalHints: ['acme', 'budget', 'expansion']
    })

    const provider = createProvider((input) => {
      prompts.push(input.prompt)
      return {
        text: 'budgeted',
        model: 'budget-model',
        tokens: { input: input.prompt.length, output: 8 },
        costUsd: 0
      }
    }, 'budget-provider')

    const result = await runGovernedLoop({
      provider,
      goal: 'research this lead for Acme',
      limits: { maxSteps: 1 },
      runtime: {
        workingContext,
        memory: {
          manager: memory,
          workspaceId: 'w1',
          scope: 'initiative:budget',
          autoStoreOutputs: false
        },
        skills: {
          registry: createSkillRegistryV2([makeSkillArtifact(makeManifest())])
        },
        connectors: {
          bundle: buildMockConnectorBundle()
        },
        prompt: {
          systemReminders: ['Surface only the operator-ready delta.']
        },
        contextBudget: createContextBudget({
          maxTokens: 220,
          warnThreshold: 0.3,
          flushThreshold: 0.5,
          estimator: (text) => text.length
        })
      }
    })

    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('<system_reminders>')
    expect(prompts[0]).toContain('budget-discipline')
    expect(prompts[0]).toContain('custom-1')
    expect(prompts[0]).toContain('Surface only the operator-ready delta.')
    expect(result.steps[0]?.appliedReminderIds).toEqual(expect.arrayContaining([
      'grounded-evidence',
      'smallest-safe-step',
      'skills-as-guardrails',
      'budget-discipline',
      'custom-1'
    ]))
  })

  it('returns a failed result and preserves observability when the provider throws', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-loop-provider-fail-'))
    const logger = createJsonlRunLogger({ rootDir, runId: 'provider-failure' })
    const provider = createProvider(() => {
      throw new Error('provider unavailable')
    })

    const result = await runGovernedLoop({
      provider,
      goal: 'debug provider failure',
      limits: { maxSteps: 1 },
      runtime: {
        observability: { logger }
      }
    })

    expect(result.status).toBe('failed')
    expect(result.failure?.kind).toBe('provider')
    expect(result.errorCount).toBe(1)

    const lines = readFileSync(logger.logFilePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line).eventType)

    expect(lines).toContain('run.summary')
  })

  it('records parser errors on invalid act-phase json without executing a connector', async () => {
    const provider = createProvider((input) => ({
      text: input.prompt.includes('[act]')
        ? '```json\n{"connectorAction":{"family":"docs","action":"read-connector"}\n```'
        : 'continue',
      model: 'test',
      tokens: { input: input.prompt.length, output: 12 },
      costUsd: 0
    }))

    const result = await runGovernedLoop({
      provider,
      goal: 'review the brief',
      limits: { maxSteps: 3 },
      runtime: {
        connectors: {
          bundle: buildMockConnectorBundle()
        }
      }
    })

    const actStep = result.steps[2]
    expect(result.status).toBe('stopped')
    expect(actStep?.error?.kind).toBe('parser')
    expect(actStep?.connectorAction).toBeUndefined()
    expect(actStep?.connectorStatus).toBeUndefined()
    expect(result.errorCount).toBe(1)
    expect(result.toggles?.policyGating).toBe(false)
  })
})
