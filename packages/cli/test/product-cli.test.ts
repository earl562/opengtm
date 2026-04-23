import { chmodSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadOpenGtmConfig, updateOpenGtmConfig } from '../src/config.js'
import { loadAuthStore } from '../src/credentials.js'
import { parseCliArgs } from '../src/parse.js'
import { createCliRouter } from '../src/router.js'

describe('production CLI surfaces', () => {
  const originalCwd = process.cwd()

  afterEach(() => {
    process.chdir(originalCwd)
  })

  it('parses spaced flag values and passthrough arguments', () => {
    const parsed = parseCliArgs([
      'sandbox',
      'run',
      '--profile',
      'read-only',
      '--preview',
      '--',
      '/bin/echo',
      'sandbox-ok'
    ])

    expect(parsed.command).toBe('sandbox')
    expect(parsed.subcommand).toBe('run')
    expect(parsed.flags.profile).toBe('read-only')
    expect(parsed.flags.preview).toBe(true)
    expect(parsed.passthrough).toEqual(['/bin/echo', 'sandbox-ok'])
  })

  it('initializes with quoted values and exposes status/help-oriented control plane data', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-'))
    process.chdir(cwd)
    const router = createCliRouter()

    const init = await router(['init', '--name', 'Demo Workspace', '--initiative', 'Demo Initiative'])
    expect('workspace' in init).toBe(true)
    if (!('workspace' in init)) throw new Error('Expected init result')
    const initResult = init as { workspace: { name: string } }
    expect(initResult.workspace.name).toBe('Demo Workspace')

    const status = await router(['status'])
    expect(status).toMatchObject({
      kind: 'status',
      workspace: {
        name: 'Demo Workspace',
        initiativeTitle: 'Demo Initiative'
      },
      controlPlane: {
        provider: {
          id: 'mock'
        }
      }
    })

    const config = await loadOpenGtmConfig(cwd)
    expect(config?.preferences?.currentProvider).toBe('mock')
    expect(config?.preferences?.sandboxProfile).toBe('read-only')
  })

  it('supports provider auth/model selection plus skill and agent scaffolding', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-auth-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Control Plane'])

    const auth = await router(['auth', 'login', 'openai', '--api-key=test-openai-key'])
    expect(auth).toMatchObject({
      kind: 'auth',
      action: 'login',
      configured: true
    })

    const provider = await router(['provider', 'use', 'openai'])
    expect(provider).toMatchObject({
      kind: 'providers',
      action: 'use',
      currentProvider: 'openai'
    })

    const model = await router(['models', 'use', 'gpt-5.2'])
    expect(model).toMatchObject({
      kind: 'models',
      action: 'use',
      currentModel: 'gpt-5.2'
    })

    const envAuth = await router(['auth', 'login', 'openai', '--api-key-env=OPENAI_API_KEY'])
    expect(envAuth).toMatchObject({
      kind: 'auth',
      action: 'login',
      configured: true,
      envVar: 'OPENAI_API_KEY'
    })
    const authStore = await loadAuthStore(cwd)
    expect(authStore.providers.openai).toBeUndefined()

    const skill = await router(['skill', 'new', 'outbound_followup'])
    expect(skill).toMatchObject({
      kind: 'skills',
      action: 'new'
    })

    const agent = await router(['agent', 'new', 'research_assistant'])
    expect(agent).toMatchObject({
      kind: 'agents',
      action: 'new'
    })
  })

  it('emits a reviewable learning artifact after a denied approval flow', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-learn-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Learning'])
    const workflow = await router(['workflow', 'run', 'crm.roundtrip', 'Prospect Example'])
    expect('approvalRequestId' in workflow && workflow.approvalRequestId).toBeTypeOf('string')

    const denied = await router(['approvals', 'deny', String(('approvalRequestId' in workflow && workflow.approvalRequestId) || '')])
    expect('summary' in denied).toBe(true)

    const learn = await router(['learn', 'review'])
    expect(learn).toMatchObject({
      kind: 'learn',
      action: 'review',
      generated: true
    })
    expect('candidateSkillPath' in learn && learn.candidateSkillPath).toBeTypeOf('string')

    const skills = await router(['skill', 'list'])
    expect(skills).toMatchObject({
      kind: 'skills',
      action: 'list'
    })
    if (!('skills' in skills) || !Array.isArray(skills.skills)) {
      throw new Error('Expected skill list payload')
    }
    expect(skills.skills.some((skill: any) => typeof skill.id === 'string' && skill.id.startsWith('learned_'))).toBe(true)
  })

  it('lists and explains sandbox profiles for operator review', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-sandbox-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Sandbox'])
    const list = await router(['sandbox', 'profile', 'list'])
    expect(list).toMatchObject({
      kind: 'sandbox',
      action: 'profile-list'
    })

    const explain = await router(['sandbox', 'explain', '--profile', 'read-only'])
    expect(explain).toMatchObject({
      kind: 'sandbox',
      action: 'explain',
      profile: {
        id: 'read-only'
      }
    })
  })

  it('exposes persisted session cards through the control plane', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-cards-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Session Cards'])
    await router(['session', 'new'])

    const { handleInteractiveInput, readInteractiveSession } = await import('../src/interactive.js')
    const first = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: first.session,
      router
    })

    const cards = await router(['session', 'cards'])
    expect(cards).toMatchObject({
      kind: 'session-cards'
    })
    if (!('actionCards' in cards) || !Array.isArray(cards.actionCards)) {
      throw new Error('Expected session cards payload')
    }
    expect(cards.actionCards[0]).toMatchObject({
      title: 'Draft outreach'
    })

    const persisted = await readInteractiveSession(cwd)
    expect(persisted?.lastActionCards[0]?.title).toBe('Draft outreach')
  })

  it('refreshes session cards from the current runtime state on demand', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-cards-refresh-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Session Cards Refresh'])
    await router(['session', 'new'])

    const { handleInteractiveInput } = await import('../src/interactive.js')
    await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const refreshed = await router(['session', 'cards', '--refresh'])
    expect(refreshed).toMatchObject({
      kind: 'session-cards',
      refreshed: true
    })
    if (!('actionCards' in refreshed) || !Array.isArray(refreshed.actionCards)) {
      throw new Error('Expected refreshed session cards payload')
    }
    expect(refreshed.actionCards[0]).toMatchObject({
      title: 'Draft outreach'
    })
  })

  it('supports `session compact` to summarize transcript history without dropping live session state', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-compact-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Session Compact'])
    await router(['session', 'new'])

    const { handleInteractiveInput, readInteractiveSession } = await import('../src/interactive.js')
    const first = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: first.session,
      router
    })

    const compacted = await router(['session', 'compact'])
    expect(compacted).toMatchObject({
      kind: 'session-compact'
    })
    if (!('previousEntryCount' in compacted) || !('compactedEntryCount' in compacted) || !('backupPath' in compacted)) {
      throw new Error('Expected compact result counts')
    }
    expect(compacted.previousEntryCount).toBeGreaterThan(1)
    expect(compacted.compactedEntryCount).toBe(1)
    expect(typeof compacted.backupPath).toBe('string')

    const persisted = await readInteractiveSession(cwd)
    expect(persisted?.focusEntity).toBe('Acme')
    expect(persisted?.leadLane.phase).toBe('draft-ready')
  })

  it('supports `session advance` as a control-plane runtime autopilot', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-advance-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Session Advance'])
    await router(['session', 'new'])

    const { handleInteractiveInput } = await import('../src/interactive.js')
    const first = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: first.session,
      router
    })

    const advanced = await router(['session', 'advance'])
    expect(advanced).toMatchObject({
      kind: 'session-action',
      executed: true,
      stepsExecuted: 1,
      stopReason: 'approval-gate'
    })
    if (!('output' in advanced) || typeof advanced.output !== 'string') {
      throw new Error('Expected session advance output')
    }
    expect(advanced.output).toContain('Runtime advance')
    expect(advanced.output).toContain('/approve')

    const runtime = await router(['session', 'runtime'])
    expect(runtime).toMatchObject({
      kind: 'session-runtime',
      session: {
        advance: {
          status: 'waiting-for-approval',
          stepsExecuted: 1,
          stopReason: 'approval-gate'
        }
      }
    })
  })

  it('supports multi-step account progression through `session advance`', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-account-advance-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Account Advance'])
    await router(['session', 'new'])

    const { handleInteractiveInput } = await import('../src/interactive.js')
    const first = await handleInteractiveInput({
      cwd,
      line: 'Check account health for Acme',
      router
    })
    await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: first.session,
      router
    })

    const advanced = await router(['session', 'advance', '2'])
    expect(advanced).toMatchObject({
      kind: 'session-action',
      executed: true,
      stepsExecuted: 2
    })
    if (!('output' in advanced) || typeof advanced.output !== 'string') {
      throw new Error('Expected multi-step session advance output')
    }
    expect(advanced.output).toContain('Renewal prep for Acme')
    expect(advanced.output).toContain('Account brief for Acme')
  })

  it('supports `session resume` after an approval-gated advance run', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-resume-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Session Resume'])
    await router(['session', 'new'])

    const { handleInteractiveInput } = await import('../src/interactive.js')
    const first = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: first.session,
      router
    })

    const advanced = await router(['session', 'advance'])
    expect(advanced).toMatchObject({
      kind: 'session-action',
      stopReason: 'approval-gate'
    })

    const approvals = await router(['approvals', 'list'])
    if (!('approvals' in approvals) || !Array.isArray(approvals.approvals) || !approvals.approvals[0]?.id) {
      throw new Error('Expected a pending approval to resume from')
    }
    await router(['approvals', 'approve', approvals.approvals[0].id])

    const runtimeBeforeResume = await router(['session', 'runtime'])
    expect(runtimeBeforeResume).toMatchObject({
      kind: 'session-runtime',
      session: {
        advance: {
          status: 'stopped',
          stopReason: 'approval-resolved'
        }
      }
    })

    const resumed = await router(['session', 'resume'])
    expect(resumed).toMatchObject({
      kind: 'session-action',
      executed: true
    })
    if (!('output' in resumed) || typeof resumed.output !== 'string') {
      throw new Error('Expected session resume output')
    }
    expect(resumed.output).toContain('Runtime resume')
    expect(resumed.output).toContain('Outreach sequence')
  })

  it('supports `session approve-continue` to resolve the gate and resume in one step', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-approve-continue-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Session Approve Continue'])
    await router(['session', 'new'])

    const { handleInteractiveInput } = await import('../src/interactive.js')
    const first = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: first.session,
      router
    })
    await router(['session', 'advance'])

    const approvals = await router(['approvals', 'list'])
    if (!('approvals' in approvals) || !Array.isArray(approvals.approvals) || !approvals.approvals[0]?.id) {
      throw new Error('Expected a pending approval to continue from')
    }

    const continued = await router(['session', 'approve-continue', approvals.approvals[0].id])
    expect(continued).toMatchObject({
      kind: 'session-action',
      executed: true
    })
    if (!('output' in continued) || typeof continued.output !== 'string') {
      throw new Error('Expected session approve-continue output')
    }
    expect(continued.output).toContain('Approval resolution')
    expect(continued.output).toContain('Runtime resume')
    expect(continued.output).toContain('Outreach sequence')
  })

  it('shows supervisor progress history through `session progress`', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-progress-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Session Progress'])
    await router(['session', 'new'])

    const { handleInteractiveInput } = await import('../src/interactive.js')
    const first = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: first.session,
      router
    })
    await router(['session', 'advance'])

    const progress = await router(['session', 'progress'])
    expect(progress).toMatchObject({
      kind: 'session-progress',
      advance: {
        status: 'waiting-for-approval',
        stepsExecuted: 1
      }
    })
    if (!('history' in progress) || !Array.isArray(progress.history)) {
      throw new Error('Expected session progress history')
    }
    expect(progress.history[0]).toMatchObject({
      mode: 'advance',
      stopReason: 'approval-gate'
    })
  })

  it('reads session progress from the configured runtime dir', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-progress-runtime-dir-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Session Progress Runtime Dir'])
    await updateOpenGtmConfig(cwd, (config) => ({
      ...config,
      runtimeDir: '.opengtm/custom-runtime'
    }))
    await router(['session', 'new'])

    const { handleInteractiveInput } = await import('../src/interactive.js')
    const first = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: first.session,
      router
    })
    await router(['session', 'advance'])

    const progress = await router(['session', 'progress'])
    expect(progress).toMatchObject({
      kind: 'session-progress',
      advance: {
        status: 'waiting-for-approval',
        stepsExecuted: 1
      }
    })
  })

  it('rejects invalid transcript limits instead of silently widening history', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-transcript-limit-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Transcript Limit'])
    await router(['session', 'new'])

    const { handleInteractiveInput } = await import('../src/interactive.js')
    await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    await expect(router(['session', 'transcript', '--limit=-1'])).rejects.toThrow('Transcript limit must be a positive integer.')
    await expect(router(['session', 'transcript', '--limit=0'])).rejects.toThrow('Transcript limit must be a positive integer.')
    await expect(router(['session', 'transcript', '--limit=1.5'])).rejects.toThrow('Transcript limit must be a positive integer.')
  })

  it('surfaces transcript corruption instead of silently returning empty history', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-transcript-corrupt-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Transcript Corruption'])
    await router(['session', 'new'])

    const { handleInteractiveInput, readInteractiveSession } = await import('../src/interactive.js')
    await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const session = await readInteractiveSession(cwd)
    if (!session) throw new Error('Expected active session')
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(session.transcriptPath, '{"role":"assistant","content":"ok"}\nnot-json\n', 'utf-8')
    )

    const transcript = await router(['session', 'transcript'])
    expect(transcript).toMatchObject({
      kind: 'session-transcript',
      error: 'Interactive transcript is unreadable: transcript line 1 is unreadable'
    })
    if (!('entries' in transcript) || !Array.isArray(transcript.entries)) {
      throw new Error('Expected transcript entries array')
    }
    expect(transcript.entries).toHaveLength(0)
  })

  it('surfaces invalid transcript envelope shapes as corruption', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-transcript-invalid-envelope-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Transcript Invalid Envelope'])
    await router(['session', 'new'])

    const { readInteractiveSession } = await import('../src/interactive.js')
    const session = await readInteractiveSession(cwd)
    if (!session) throw new Error('Expected active session')
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(session.transcriptPath, '{"role":"assistant","content":"ok"}\n', 'utf-8')
    )

    const transcript = await router(['session', 'transcript'])
    expect(transcript).toMatchObject({
      kind: 'session-transcript',
      error: 'Interactive transcript is unreadable: transcript line 1 is unreadable'
    })
  })

  it('refuses session compaction when transcript history has schema-invalid entries', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-compact-invalid-envelope-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Compact Invalid Envelope'])
    await router(['session', 'new'])

    const { readInteractiveSession } = await import('../src/interactive.js')
    const session = await readInteractiveSession(cwd)
    if (!session) throw new Error('Expected active session')
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(session.transcriptPath, '{"role":"assistant","content":"ok"}\n', 'utf-8')
    )

    const compacted = await router(['session', 'compact'])
    expect(compacted).toMatchObject({
      kind: 'session-compact',
      error: 'Interactive transcript is unreadable; refusing to compact and overwrite history: transcript line 1 is unreadable'
    })
  })

  it('refuses session compaction when the transcript exists but cannot be read safely', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-compact-unreadable-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Compact Unreadable'])
    await router(['session', 'new'])

    const { handleInteractiveInput, readInteractiveSession } = await import('../src/interactive.js')
    await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const session = await readInteractiveSession(cwd)
    if (!session) throw new Error('Expected active session')

    chmodSync(session.transcriptPath, 0o000)
    try {
      const compacted = await router(['session', 'compact'])
      expect(compacted).toMatchObject({
        kind: 'session-compact',
        error: expect.stringContaining('Interactive transcript could not be read safely for compaction')
      })
    } finally {
      chmodSync(session.transcriptPath, 0o600)
    }
  })

  it('returns a structured compact error when backup/write work cannot complete safely', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-product-cli-session-compact-write-failure-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Compact Write Failure'])
    await router(['session', 'new'])

    const { handleInteractiveInput, readInteractiveSession } = await import('../src/interactive.js')
    await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const session = await readInteractiveSession(cwd)
    if (!session) throw new Error('Expected active session')

    const transcriptDir = dirname(session.transcriptPath)
    chmodSync(transcriptDir, 0o500)
    try {
      const compacted = await router(['session', 'compact'])
      expect(compacted).toMatchObject({
        kind: 'session-compact',
        error: expect.stringContaining('Interactive transcript compaction could not be completed safely')
      })
      if (!('compactedEntryCount' in compacted)) {
        throw new Error('Expected compacted entry count')
      }
      expect(compacted.compactedEntryCount).toBe(0)
    } finally {
      chmodSync(transcriptDir, 0o700)
    }
  })
})
