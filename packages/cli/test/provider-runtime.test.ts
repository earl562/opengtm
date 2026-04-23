import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCliRouter } from '../src/router.js'
import { resolveWorkspacePhaseProviders, resolveWorkspaceProvider } from '../src/provider-runtime.js'
import { handleWorkflowRun } from '../src/handlers/workflows.js'
import { createLocalDaemon } from '@opengtm/daemon'
import { getRecord } from '@opengtm/storage'
import { updateOpenGtmConfig } from '../src/config.js'

describe('provider runtime integration', () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch

  afterEach(() => {
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  it('resolves the default workspace provider to mock', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-provider-runtime-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Provider Demo', '--initiative=Mock'])

    const resolved = await resolveWorkspaceProvider(cwd)
    expect(resolved.providerId).toBe('mock')
    expect(resolved.configured).toBe(true)
    expect(resolved.model).toBe('mock-0')
  })

  it('resolves env-backed openai auth into a configured provider', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-provider-openai-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Provider Demo', '--initiative=OpenAI'])
    process.env.OPENAI_API_KEY = 'sk-test-openai-key'

    await router(['auth', 'login', 'openai', '--api-key-env=OPENAI_API_KEY'])
    await router(['provider', 'use', 'openai'])
    await router(['models', 'use', 'gpt-5.2'])

    const resolved = await resolveWorkspaceProvider(cwd)
    expect(resolved.providerId).toBe('openai')
    expect(resolved.configured).toBe(true)
    expect(resolved.model).toBe('gpt-5.2')
    expect(resolved.authMode).toBe('api-key')
  })

  it('derives phase-specific provider models for configured openai workspaces', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-provider-phases-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Provider Demo', '--initiative=Phases'])
    process.env.OPENAI_API_KEY = 'sk-test-openai-key'

    await router(['auth', 'login', 'openai', '--api-key-env=OPENAI_API_KEY'])
    await router(['provider', 'use', 'openai'])
    await router(['models', 'use', 'gpt-5.2'])

    const resolved = await resolveWorkspacePhaseProviders(cwd)
    expect(resolved.providerId).toBe('openai')
    expect(resolved.configured).toBe(true)
    expect(resolved.phaseModels).toEqual({
      plan: 'gpt-5-mini',
      observe: 'gpt-5-mini',
      act: 'gpt-5.2',
      reflect: 'gpt-5-mini'
    })
  })

  it('persists per-phase provider models in live research and ops traces for configured openai workspaces', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-provider-phase-traces-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Provider Demo', '--initiative=Phase Traces'])
    process.env.OPENAI_API_KEY = 'sk-test-openai-key'

    await router(['auth', 'login', 'openai', '--api-key-env=OPENAI_API_KEY'])
    await router(['provider', 'use', 'openai'])
    await router(['models', 'use', 'gpt-5.2'])

    global.fetch = (async (_input: any, init?: any) => {
      const body = JSON.parse(String(init?.body || '{}'))
      const model = body.model || 'unknown-model'
      return {
        ok: true,
        async json() {
          return {
            model,
            choices: [
              {
                message: {
                  content: `MOCK_${model}`
                }
              }
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 4
            }
          }
        }
      } as any
    }) as typeof global.fetch

    const daemon = createLocalDaemon({
      rootDir: join(cwd, '.opengtm/runtime')
    })

    const research = await handleWorkflowRun({
      cwd,
      daemon,
      workflowId: 'sdr.lead_research',
      goal: 'research Acme expansion',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })
    const researchTrace = getRecord<any>(daemon.storage as any, 'run_traces', research.traceId!)
    const researchHarnessFact = researchTrace?.observedFacts?.find((fact: any) => fact.kind === 'harness-loop')

    expect(researchTrace?.steps.map((step: any) => `${step.name}:${step.providerModel}`)).toEqual([
      'plan:gpt-5-mini',
      'observe:gpt-5-mini',
      'act:gpt-5.2',
      'reflect:gpt-5-mini'
    ])
    expect(researchHarnessFact?.phaseProviderModels).toEqual([
      'plan:gpt-5-mini',
      'observe:gpt-5-mini',
      'act:gpt-5.2',
      'reflect:gpt-5-mini'
    ])

    const ops = await handleWorkflowRun({
      cwd,
      daemon,
      workflowId: 'sdr.outreach_compose',
      goal: 'draft first touch for Acme',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })
    const opsTrace = getRecord<any>(daemon.storage as any, 'run_traces', ops.traceId!)
    const opsHarnessFact = opsTrace?.observedFacts?.find((fact: any) => fact.kind === 'harness-loop')

    expect(opsTrace?.steps.map((step: any) => `${step.name}:${step.providerModel}`)).toEqual([
      'plan:gpt-5-mini',
      'observe:gpt-5-mini',
      'act:gpt-5.2',
      'reflect:gpt-5-mini'
    ])
    expect(opsHarnessFact?.phaseProviderModels).toEqual([
      'plan:gpt-5-mini',
      'observe:gpt-5-mini',
      'act:gpt-5.2',
      'reflect:gpt-5-mini'
    ])
  })

  it('supports explicit phase-model overrides for openai-compatible workspaces', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-provider-phase-overrides-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Provider Demo', '--initiative=Phase Overrides'])
    process.env.OPENAI_API_KEY = 'sk-test-openai-key'

    await router(['auth', 'login', 'openai-compatible', '--api-key-env=OPENAI_API_KEY', '--base-url=https://example.invalid/v1'])
    await router(['provider', 'use', 'openai-compatible'])
    await router(['models', 'use', 'custom-large'])
    await updateOpenGtmConfig(cwd, (config) => ({
      ...config,
      preferences: {
        ...config.preferences!,
        phaseModels: {
          plan: 'custom-small',
          observe: 'custom-small',
          act: 'custom-large',
          reflect: 'custom-small'
        }
      }
    }))

    const resolved = await resolveWorkspacePhaseProviders(cwd)
    expect(resolved.providerId).toBe('openai-compatible')
    expect(resolved.phaseModels).toEqual({
      plan: 'custom-small',
      observe: 'custom-small',
      act: 'custom-large',
      reflect: 'custom-small'
    })

    global.fetch = (async (_input: any, init?: any) => {
      const body = JSON.parse(String(init?.body || '{}'))
      const model = body.model || 'unknown-model'
      return {
        ok: true,
        async json() {
          return {
            model,
            choices: [
              {
                message: {
                  content: `MOCK_${model}`
                }
              }
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 4
            }
          }
        }
      } as any
    }) as typeof global.fetch

    const daemon = createLocalDaemon({
      rootDir: join(cwd, '.opengtm/runtime')
    })

    const research = await handleWorkflowRun({
      cwd,
      daemon,
      workflowId: 'sdr.lead_research',
      goal: 'research Acme expansion',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })
    const researchTrace = getRecord<any>(daemon.storage as any, 'run_traces', research.traceId!)
    const researchHarnessFact = researchTrace?.observedFacts?.find((fact: any) => fact.kind === 'harness-loop')
    expect(researchTrace?.steps.map((step: any) => `${step.name}:${step.providerModel}`)).toEqual([
      'plan:custom-small',
      'observe:custom-small',
      'act:custom-large',
      'reflect:custom-small'
    ])
    expect(researchHarnessFact?.phaseProviderModels).toEqual([
      'plan:custom-small',
      'observe:custom-small',
      'act:custom-large',
      'reflect:custom-small'
    ])

    const ops = await handleWorkflowRun({
      cwd,
      daemon,
      workflowId: 'sdr.outreach_compose',
      goal: 'draft first touch for Acme',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })
    const opsTrace = getRecord<any>(daemon.storage as any, 'run_traces', ops.traceId!)
    const opsHarnessFact = opsTrace?.observedFacts?.find((fact: any) => fact.kind === 'harness-loop')
    expect(opsTrace?.steps.map((step: any) => `${step.name}:${step.providerModel}`)).toEqual([
      'plan:custom-small',
      'observe:custom-small',
      'act:custom-large',
      'reflect:custom-small'
    ])
    expect(opsHarnessFact?.phaseProviderModels).toEqual([
      'plan:custom-small',
      'observe:custom-small',
      'act:custom-large',
      'reflect:custom-small'
    ])
  })

  it('injects workspace provider generation metadata into live workflow outputs', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-provider-generation-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Provider Demo', '--initiative=Generation'])

    const daemon = createLocalDaemon({
      rootDir: join(cwd, '.opengtm/runtime')
    })
    const run = await handleWorkflowRun({
      cwd,
      daemon,
      workflowId: 'sdr.lead_research',
      goal: 'research Acme expansion',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    expect(run.supportTier).toBe('live')
    expect((run as any).memoryId).toBeTypeOf('string')
    expect(run.artifactPath).toBeTypeOf('string')

    const dossierArtifact = getRecord<any>(daemon.storage as any, 'artifacts', run.artifactId!)
    const sourcePayloads = (dossierArtifact?.sourceIds || [])
      .map((id: string) => getRecord<any>(daemon.storage as any, 'artifacts', id))
      .filter(Boolean)
      .map((artifact: any) => ({
        artifact,
        payload: artifact.contentRef ? JSON.parse(readFileSync(artifact.contentRef, 'utf8')) : null
      }))
    const sourceWithGeneration = sourcePayloads.find((entry: any) => entry.payload?.generation)

    expect(sourceWithGeneration?.artifact?.contentRef).toBeTypeOf('string')
    const payload = sourceWithGeneration?.payload
    expect(payload.generation).toMatchObject({
      providerId: 'mock',
      configured: true
    })
    expect(payload.connectorResult).toBeTruthy()
    expect(payload.runtimeEvidence).toBeTruthy()
    expect(payload.harnessLoop).toMatchObject({
      status: 'stopped'
    })
  })
})
