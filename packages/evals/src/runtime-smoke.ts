import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMockConnectorBundle } from '@opengtm/connectors'
import {
  createContextBudget,
  createMemoryManager,
  createWorkingContext,
  type ContextBudget,
  type MemoryManager,
  type WorkingContext
} from '@opengtm/memory'
import { createJsonlRunLogger } from '@opengtm/observability'
import type { OpenGtmProvider } from '@opengtm/providers'
import { createSkillRegistryV2, makeSkillArtifact, type SkillManifest, type SkillRegistry } from '@opengtm/skills'
import { createStorage } from '@opengtm/storage'
import type { OpenGtmConnectorContract } from '@opengtm/types'
import {
  runGovernedLoop,
  type OpenGtmLoopConnectorAction,
  type OpenGtmLoopLimits,
  type OpenGtmLoopResult,
  type OpenGtmLoopRuntime
} from '@opengtm/loop'

interface AblationToggleSet {
  memoryRetrieval: boolean
  skillLoading: boolean
  policyGating: boolean
}

export interface IntegratedRuntimeHarnessOptions {
  goal: string
  toggleSet?: Partial<AblationToggleSet>
  fallbackConnectorAction?: OpenGtmLoopConnectorAction
  contextBudget?: ContextBudget
  loggerRunId?: string
}

export interface IntegratedRuntimeHarness {
  runtime: OpenGtmLoopRuntime
  workingContext: WorkingContext
  memoryManager?: MemoryManager
  skillRegistry?: SkillRegistry
  connectorBundle: OpenGtmConnectorContract[]
  rootDir: string
}

export interface IntegratedRuntimeSmokeScenarioResult {
  name: 'safe-read-executes' | 'approval-gated-write' | 'context-budget-omits-optional-sections'
  description: string
  prompts: string[]
  loopResult: OpenGtmLoopResult
}

function makeHarnessSkillManifest(): SkillManifest {
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
    composition: 'serial'
  }
}

function createPromptRecordingProvider(prompts: string[]): OpenGtmProvider {
  return {
    id: 'evals-runtime-smoke',
    async generate(input) {
      prompts.push(input.prompt)
      return {
        text: 'continue',
        model: 'evals-smoke',
        tokens: {
          input: input.prompt.length,
          output: 8
        },
        costUsd: 0
      }
    }
  }
}

function createFallbackConnectorParser(fallbackConnectorAction?: OpenGtmLoopConnectorAction) {
  return (outputText: string): OpenGtmLoopConnectorAction | null => {
    const trimmed = outputText.trim()
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>
        const raw = isRecord(parsed.connectorAction) ? parsed.connectorAction : parsed
        if (
          isRecord(raw) &&
          typeof raw.family === 'string' &&
          typeof raw.action === 'string' &&
          typeof raw.target === 'string'
        ) {
          return {
            provider: typeof raw.provider === 'string' ? raw.provider : undefined,
            family: raw.family,
            action: raw.action,
            target: raw.target,
            payload: isRecord(raw.payload) ? raw.payload : {}
          }
        }
      } catch {
        // Fall back to the deterministic scenario action below.
      }
    }

    return fallbackConnectorAction ?? null
  }
}

export async function createIntegratedRuntimeHarness({
  goal,
  toggleSet,
  fallbackConnectorAction,
  contextBudget,
  loggerRunId
}: IntegratedRuntimeHarnessOptions): Promise<IntegratedRuntimeHarness> {
  const resolvedToggleSet: AblationToggleSet = {
    memoryRetrieval: toggleSet?.memoryRetrieval ?? true,
    skillLoading: toggleSet?.skillLoading ?? true,
    policyGating: toggleSet?.policyGating ?? true
  }
  const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-evals-'))
  const workingContext = createWorkingContext()
  workingContext.set('account', 'Acme Corp')
  workingContext.set(
    'priority',
    'high urgency launch motion with a detailed internal brief that should be treated as optional context when budgets tighten'
  )

  const connectorBundle = buildMockConnectorBundle()
  const runtime: OpenGtmLoopRuntime = {
    workingContext,
    connectors: {
      bundle: connectorBundle,
      parser: createFallbackConnectorParser(fallbackConnectorAction)
    }
  }

  let memoryManager: MemoryManager | undefined
  if (resolvedToggleSet.memoryRetrieval) {
    const storage = createStorage({ rootDir })
    memoryManager = createMemoryManager({ storage })
    await memoryManager.write({
      workspaceId: 'workspace-evals',
      memoryType: 'semantic',
      scope: 'initiative:acme',
      content: `${goal}\nAcme expanded the data team and standardized on Snowflake for GTM reporting.`,
      retrievalHints: ['acme', 'snowflake', 'gtm']
    })
    runtime.memory = {
      manager: memoryManager,
      workspaceId: 'workspace-evals',
      scope: 'initiative:acme',
      autoStoreOutputs: false
    }
  }

  let skillRegistry: SkillRegistry | undefined
  if (resolvedToggleSet.skillLoading) {
    skillRegistry = createSkillRegistryV2([makeSkillArtifact(makeHarnessSkillManifest())])
    runtime.skills = {
      registry: skillRegistry,
      disclosure: 'details'
    }
  }

  if (resolvedToggleSet.policyGating) {
    runtime.policy = {
      workItemId: 'work-evals',
      workspaceId: 'workspace-evals',
      lane: 'build-integrate'
    }
  }

  if (contextBudget) {
    runtime.contextBudget = contextBudget
  }

  if (loggerRunId) {
    runtime.observability = {
      logger: createJsonlRunLogger({ rootDir, runId: loggerRunId })
    }
  }

  return {
    runtime,
    workingContext,
    memoryManager,
    skillRegistry,
    connectorBundle,
    rootDir
  }
}

export async function runIntegratedRuntimeSmokeHarness({
  provider,
  limits = { maxSteps: 3 }
}: {
  provider?: OpenGtmProvider
  limits?: OpenGtmLoopLimits
} = {}): Promise<IntegratedRuntimeSmokeScenarioResult[]> {
  const scenarios: IntegratedRuntimeSmokeScenarioResult[] = []

  {
    const prompts: string[] = []
    const { runtime } = await createIntegratedRuntimeHarness({
      goal: 'review the Acme brief',
      fallbackConnectorAction: {
        family: 'docs',
        action: 'read-connector',
        target: 'brief.md',
        payload: { query: 'acme brief' }
      },
      loggerRunId: 'safe-read'
    })
    const loopResult = await runGovernedLoop({
      provider: provider ?? createPromptRecordingProvider(prompts),
      goal: 'review the Acme brief',
      limits: { ...limits, maxSteps: Math.max(limits.maxSteps, 3) },
      runtime
    })
    scenarios.push({
      name: 'safe-read-executes',
      description: 'Safe connector reads execute under policy.',
      prompts,
      loopResult
    })
  }

  {
    const prompts: string[] = []
    const { runtime } = await createIntegratedRuntimeHarness({
      goal: 'update the Acme brief',
      fallbackConnectorAction: {
        family: 'docs',
        action: 'write-repo',
        target: 'notes.md',
        payload: { content: 'ship it' }
      },
      loggerRunId: 'approval-gated-write'
    })
    const loopResult = await runGovernedLoop({
      provider: provider ?? createPromptRecordingProvider(prompts),
      goal: 'update the Acme brief',
      limits: { ...limits, maxSteps: Math.max(limits.maxSteps, 3) },
      runtime
    })
    scenarios.push({
      name: 'approval-gated-write',
      description: 'High-risk writes require approval and stay pending.',
      prompts,
      loopResult
    })
  }

  {
    const prompts: string[] = []
    const { runtime } = await createIntegratedRuntimeHarness({
      goal: 'research this lead for Acme',
      toggleSet: { policyGating: false },
      contextBudget: createContextBudget({
        maxTokens: 220,
        warnThreshold: 0.3,
        flushThreshold: 0.5,
        estimator: (text) => text.length
      })
    })
    const loopResult = await runGovernedLoop({
      provider: provider ?? createPromptRecordingProvider(prompts),
      goal: 'research this lead for Acme',
      limits: { ...limits, maxSteps: Math.max(limits.maxSteps, 1) },
      runtime
    })
    scenarios.push({
      name: 'context-budget-omits-optional-sections',
      description: 'Tight context budgets omit optional integrated prompt sections.',
      prompts,
      loopResult
    })
  }

  return scenarios
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
