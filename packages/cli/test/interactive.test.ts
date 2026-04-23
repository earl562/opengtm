import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalDaemon } from '@opengtm/daemon'
import { getRecord, listRecords } from '@opengtm/storage'
import { afterEach, describe, expect, it } from 'vitest'
import { loadOpenGtmConfig } from '../src/config.js'
import { loadAuthStore } from '../src/credentials.js'
import {
  applyInteractiveTerminalKey,
  buildInteractivePromptLabel,
  handleInteractiveInput,
  loadInteractiveRuntimeState,
  readInteractiveSession,
  shouldLaunchInteractiveHarness
} from '../src/interactive.js'
import { createCliRouter } from '../src/router.js'
import { createSessionPlan } from '../src/session-supervisor.js'

describe('interactive harness runtime', () => {
  const originalCwd = process.cwd()

  afterEach(() => {
    process.chdir(originalCwd)
  })

  it('launches interactive mode only in tty environments', () => {
    expect(shouldLaunchInteractiveHarness([], {
      stdin: { isTTY: true } as any,
      stdout: { isTTY: true } as any
    })).toBe(true)

    expect(shouldLaunchInteractiveHarness([], {
      stdin: { isTTY: false } as any,
      stdout: { isTTY: true } as any
    })).toBe(false)

    expect(shouldLaunchInteractiveHarness(['help'], {
      stdin: { isTTY: true } as any,
      stdout: { isTTY: true } as any
    })).toBe(false)

    expect(shouldLaunchInteractiveHarness(['session', 'start'], {
      stdin: { isTTY: true } as any,
      stdout: { isTTY: true } as any
    })).toBe(true)
  })

  it('maps raw terminal input into compose-buffer edits and submissions', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-raw-compose-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Raw Compose'])

    const base = (await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })).session

    const typed = applyInteractiveTerminalKey(base, {
      sequence: 'R',
      name: 'r'
    })
    expect(typed.session.composeBuffer).toBe('R')
    expect(typed.dispatch).toBeUndefined()

    const submitted = applyInteractiveTerminalKey({
      ...base,
      interactionMode: 'compose',
      composeBuffer: 'Research Acme'
    }, {
      sequence: '\r',
      name: 'return'
    })

    expect(submitted.dispatch).toEqual({
      line: 'Research Acme',
      recordTranscript: true
    })
    expect(submitted.session.composeBuffer).toBe('')
  })

  it('supports compose cursor editing and history recall in raw terminal mode', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-raw-editing-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Raw Editing'])

    const base = (await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })).session

    const seeded = {
      ...base,
      interactionMode: 'compose' as const,
      composeBuffer: 'Acne',
      composeCursor: 4
    }

    const movedLeft = applyInteractiveTerminalKey(seeded, {
      name: 'left'
    })
    expect(movedLeft.session.composeCursor).toBe(3)

    const movedLeftAgain = applyInteractiveTerminalKey(movedLeft.session, {
      name: 'left'
    })
    expect(movedLeftAgain.session.composeCursor).toBe(2)

    const inserted = applyInteractiveTerminalKey(movedLeftAgain.session, {
      sequence: 'm',
      name: 'm'
    })
    expect(inserted.session.composeBuffer).toBe('Acmne')
    expect(inserted.session.composeCursor).toBe(3)

    const deleted = applyInteractiveTerminalKey(inserted.session, {
      name: 'delete'
    })
    expect(deleted.session.composeBuffer).toBe('Acme')

    const recalled = applyInteractiveTerminalKey({
      ...base,
      interactionMode: 'compose',
      composeHistory: ['Draft outreach for Acme', 'Research Acme'],
      composeHistoryIndex: null
    }, {
      name: 'up'
    })
    expect(recalled.session.composeBuffer).toBe('Draft outreach for Acme')
    expect(recalled.session.composeHistoryIndex).toBe(0)
  })

  it('supports richer compose shortcuts for home/end/clear/delete-word and slash-prefill', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-compose-shortcuts-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Compose Shortcuts'])

    const base = (await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })).session

    const seeded = {
      ...base,
      interactionMode: 'compose' as const,
      composeBuffer: 'Draft outreach for Acme',
      composeCursor: 'Draft outreach for Acme'.length
    }

    const home = applyInteractiveTerminalKey(seeded, {
      ctrl: true,
      name: 'a'
    })
    expect(home.session.composeCursor).toBe(0)

    const end = applyInteractiveTerminalKey(home.session, {
      ctrl: true,
      name: 'e'
    })
    expect(end.session.composeCursor).toBe('Draft outreach for Acme'.length)

    const deleteWord = applyInteractiveTerminalKey(end.session, {
      ctrl: true,
      name: 'w'
    })
    expect(deleteWord.session.composeBuffer).toBe('Draft outreach for ')

    const clear = applyInteractiveTerminalKey(deleteWord.session, {
      ctrl: true,
      name: 'u'
    })
    expect(clear.session.composeBuffer).toBe('')
    expect(clear.session.composeCursor).toBe(0)

    const slashPrefill = applyInteractiveTerminalKey({
      ...base,
      interactionMode: 'navigate-actions'
    }, {
      sequence: '/',
      name: '/'
    })
    expect(slashPrefill.session.interactionMode).toBe('compose')
    expect(slashPrefill.session.composeBuffer).toBe('/')
    expect(slashPrefill.session.composeCursor).toBe(1)
  })

  it('maps raw terminal navigation keys into local harness actions without transcript intent', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-raw-nav-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Raw Nav'])

    const base = (await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })).session

    const moved = applyInteractiveTerminalKey({
      ...base,
      interactionMode: 'navigate-actions'
    }, {
      sequence: 'j',
      name: 'j'
    })

    expect(moved.dispatch).toEqual({
      line: 'j',
      recordTranscript: false
    })

    const switchedPane = applyInteractiveTerminalKey({
      ...base,
      interactionMode: 'navigate-actions'
    }, {
      name: 'tab',
      shift: false
    })
    expect(switchedPane.dispatch).toEqual({
      line: 'tab',
      recordTranscript: false
    })
  })

  it('toggles the in-screen help overlay with ? and closes it with escape', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-help-overlay-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Help Overlay'])

    const base = (await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })).session

    const opened = applyInteractiveTerminalKey(base, {
      sequence: '?',
      name: '?'
    })
    expect(opened.session.uiOverlay).toBe('help')

    const closed = applyInteractiveTerminalKey(opened.session, {
      name: 'escape'
    })
    expect(closed.session.uiOverlay).toBe('none')
  })

  it('opens the command palette with ctrl+k and dispatches the selected command with enter', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-palette-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Palette'])

    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const opened = applyInteractiveTerminalKey(research.session, {
      ctrl: true,
      name: 'k'
    })
    expect(opened.session.uiOverlay).toBe('palette')
    expect(opened.session.uiOverlayIndex).toBe(0)
    expect(opened.session.eventFeed[0]?.text).toBe('Command palette opened.')

    const moved = applyInteractiveTerminalKey(opened.session, {
      sequence: 'j',
      name: 'j'
    })
    expect(moved.session.uiOverlayIndex).toBe(1)

    const dispatched = applyInteractiveTerminalKey(moved.session, {
      name: 'enter'
    })
    expect(dispatched.dispatch).toEqual({
      line: '/next',
      recordTranscript: false
    })
  })

  it('records runtime flashes into the operator activity feed', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-event-feed-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Event Feed'])

    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const drafted = await handleInteractiveInput({
      cwd,
      line: '/do',
      session: research.session,
      router
    })

    expect(Array.isArray(drafted.session.eventFeed)).toBe(true)
    expect(drafted.session.eventFeed[0]?.text).toContain('Runtime follow-through refreshed.')
  })

  it('prefers approval commands in the command palette when the approvals pane is focused', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-palette-approvals-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Palette Approvals'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    const drafted = await handleInteractiveInput({
      cwd,
      line: '/do',
      session: research.session,
      router
    })

    const opened = applyInteractiveTerminalKey({
      ...drafted.session,
      selection: {
        ...drafted.session.selection,
        focusedPane: 'approvals'
      }
    }, {
      ctrl: true,
      name: 'k'
    })
    expect(opened.session.uiOverlay).toBe('palette')

    const dispatched = applyInteractiveTerminalKey(opened.session, {
      name: 'enter'
    })
    expect(dispatched.dispatch).toEqual({
      line: '+',
      recordTranscript: false
    })
  })

  it('auto-focuses approvals pane after approval-gated transitions are synced for ui', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-blocked-pane-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Blocked Pane'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const executed = await handleInteractiveInput({
      cwd,
      line: '/do',
      session: research.session,
      router
    })

    const prompt = await buildInteractivePromptLabel(cwd, executed.session)
    expect(executed.session.selection.focusedPane).toBe('approvals')
    expect(prompt).toContain('pane:gate')
  })

  it('supports auth/provider/model slash commands inside the interactive shell', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-auth-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Auth'])

    const auth = await handleInteractiveInput({
      cwd,
      line: '/auth',
      router
    })
    expect(auth.session.activeScreen).toBe('auth')
    expect(auth.output).toContain('Opened Auth workspace')

    const provider = await handleInteractiveInput({
      cwd,
      line: '/provider',
      session: auth.session,
      router
    })
    expect(provider.output).toContain('Providers')

    const models = await handleInteractiveInput({
      cwd,
      line: '/models',
      session: provider.session,
      router
    })
    expect(models.output).toContain('Models')
  })

  it('defaults the auth workspace target to the current shell provider when it already supports auth', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-auth-target-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Auth Target'])
    await router(['auth', 'login', 'openai-compatible', '--api-key-env=OPENAI_API_KEY'])
    await router(['provider', 'use', 'openai-compatible'])

    const auth = await handleInteractiveInput({
      cwd,
      line: '/auth',
      router
    })
    const runtime = await loadInteractiveRuntimeState(cwd, auth.session)

    expect(auth.session.activeScreen).toBe('auth')
    expect(runtime.auth.providerId).toBe('openai-compatible')
    expect(runtime.auth.authMode).toBe('api-key')
    expect(runtime.auth.shellProviderId).toBe('openai-compatible')
    expect(auth.session.authTargetProviderId).toBeNull()
    expect(auth.session.authTargetLocked).toBe(false)
  })

  it('preserves an explicitly pinned auth target even when the shell provider differs', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-auth-target-pinned-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Auth Target Pinned'])
    await router(['auth', 'login', 'openai-compatible', '--api-key-env=OPENAI_API_KEY'])
    await router(['provider', 'use', 'openai-compatible'])

    const targeted = await handleInteractiveInput({
      cwd,
      line: '/auth provider openai',
      router
    })
    const runtime = await loadInteractiveRuntimeState(cwd, targeted.session)
    const persisted = await readInteractiveSession(cwd)

    expect(targeted.session.activeScreen).toBe('auth')
    expect(targeted.session.authTargetProviderId).toBe('openai')
    expect(targeted.session.authTargetLocked).toBe(true)
    expect(persisted?.authTargetProviderId).toBe('openai')
    expect(persisted?.authTargetLocked).toBe(true)
    expect(runtime.auth.providerId).toBe('openai')
    expect(runtime.auth.shellProviderId).toBe('openai-compatible')
  })

  it('falls back to OpenAI auth when the current shell provider does not require auth', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-auth-target-fallback-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Auth Target Fallback'])

    const auth = await handleInteractiveInput({
      cwd,
      line: '/auth',
      router
    })
    const runtime = await loadInteractiveRuntimeState(cwd, auth.session)

    expect(auth.session.activeScreen).toBe('auth')
    expect(runtime.auth.providerId).toBe('openai')
    expect(runtime.auth.authMode).toBe('oauth')
    expect(runtime.auth.shellProviderId).toBe('mock')
    expect(auth.session.authTargetProviderId).toBeNull()
    expect(auth.session.authTargetLocked).toBe(false)
  })

  it('shows the live command catalog through /commands', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-commands-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Commands'])

    const commands = await handleInteractiveInput({
      cwd,
      line: '/commands',
      router
    })

    expect(commands.output).toContain('Live command catalog')
    expect(commands.output).toContain('/auth login openai')
    expect(commands.output).toContain('/commands')
    expect(commands.output).toContain('Current palette actions')
  })

  it('opens the manual-test workspace and runs the selected starter action inline', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-test-workspace-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Test Workspace'])

    const opened = await handleInteractiveInput({
      cwd,
      line: '/test',
      router
    })
    expect(opened.session.activeScreen).toBe('run')

    const executed = await handleInteractiveInput({
      cwd,
      line: '/do',
      session: opened.session,
      router
    })
    expect(executed.session.activeScreen).toBe('run')
    expect(executed.output).toContain('Workflow run')
  })

  it('completes OAuth when the callback URL is pasted directly into the shell', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-oauth-paste-'))
    const router = createCliRouter({ cwd })
    const originalFetch = global.fetch

    await router(['init', '--name=Interactive Demo', '--initiative=OAuth Paste'])
    const started = await router(['auth', 'login', 'openai', '--no-open']) as any
    const state = new URL(started.authUrl).searchParams.get('state')
    expect(state).toBeTruthy()

    global.fetch = (async () => ({
      ok: true,
      async text() {
        return JSON.stringify({
          access_token: 'header.eyJhY2NvdW50SWQiOiJhY2N0X3Bhc3RlIn0.signature',
          refresh_token: 'refresh-paste-token',
          expires_in: 3600
        })
      }
    })) as unknown as typeof global.fetch

    try {
      const completed = await handleInteractiveInput({
        cwd,
        line: `http://127.0.0.1:1455/auth/callback?code=test-code&state=${state}`,
        router
      })

      expect(completed.session.activeScreen).toBe('auth')
      expect(completed.output).toContain('OAuth configured')

      const config = await loadOpenGtmConfig(cwd)
      expect(config?.preferences?.currentProvider).toBe('openai')

      const store = await loadAuthStore(cwd)
      expect(store.providers.openai?.oauth?.accessToken).toContain('header.')
      expect(store.providers.openai?.pendingPkce).toBeUndefined()
    } finally {
      global.fetch = originalFetch
    }
  })

  it('routes natural-language research and persists a transcript', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Session'])

    const result = await handleInteractiveInput({
      cwd,
      line: 'Research Acme expansion signals',
      router
    })

    expect(result.output).toContain('Workflow run')
    expect(result.output).toContain('sdr.lead_research')
    expect(result.session.transcriptPath).toBeTypeOf('string')

    const transcript = readFileSync(result.session.transcriptPath, 'utf-8')
    expect(transcript).toContain('Research Acme expansion signals')
    expect(transcript).toContain('sdr.lead_research')
  })

  it('resolves slash approvals and block explanations inline', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-approval-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Approvals'])
    const workflow = await router(['workflow', 'run', 'crm.roundtrip', 'Pat Example'])
    expect('approvalRequestId' in workflow && workflow.approvalRequestId).toBeTypeOf('string')

    const explain = await handleInteractiveInput({
      cwd,
      line: 'Why was this blocked?',
      router
    })
    expect(explain.output).toContain('waiting for approval')

    const approve = await handleInteractiveInput({
      cwd,
      line: '/approve',
      session: explain.session,
      router
    })
    expect(approve.output).toContain('Approval resolution')
    expect(approve.output).toContain('╭─ Approval resolution')
  })

  it('treats session start as a stable command surface even without tty launch', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-launch-'))
    const router = createCliRouter({ cwd })

    const launch = await router(['session', 'start'])
    expect(launch).toMatchObject({
      kind: 'session-launch',
      requiresTty: true,
      cwd
    })
  })

  it('exposes transcript/history as a first-class session command', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-history-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=History'])
    await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const transcript = await router(['session', 'transcript', '--limit=5'])
    expect(transcript).toMatchObject({
      kind: 'session-transcript'
    })
    if (!('entries' in transcript) || !Array.isArray(transcript.entries)) {
      throw new Error('Expected transcript entries')
    }
    expect(transcript.entries.some((entry: any) => String(entry.content || '').includes('Research Acme'))).toBe(true)
  })

  it('compacts the interactive transcript while preserving the live GTM state', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-compact-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Compact'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    const next = await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: research.session,
      router
    })

    const compacted = await handleInteractiveInput({
      cwd,
      line: '/compact',
      session: next.session,
      router
    })

    expect(compacted.output).toContain('Interactive session compact')
    expect(compacted.output).toContain('entries:')
    expect(compacted.output).toContain('backup:')
    expect(compacted.session.focusEntity).toBe('Acme')
    expect(compacted.session.leadLane.phase).toBe('draft-ready')

    const transcript = readFileSync(compacted.session.transcriptPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { content?: string })

    expect(transcript).toHaveLength(1)
    expect(transcript[0]?.content).toContain('Compacted OpenGTM session summary')
    expect(transcript[0]?.content).toContain('focus: lead / Acme')
  })

  it('refuses to compact when the existing transcript contains unreadable history', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-compact-parse-error-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Compact Parse Error'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const validEnvelope = {
      id: 'msg-1',
      kind: 'user.session.message',
      source: { kind: 'system', id: 'opengtm' },
      target: { kind: 'system', id: 'interactive-harness' },
      createdAt: new Date().toISOString(),
      sessionMessageId: 'session-msg-1',
      sessionId: research.session.sessionId,
      role: 'assistant',
      content: 'ok',
      delivery: { channel: 'cli', visibility: 'private' }
    }
    writeFileSync(research.session.transcriptPath, `${JSON.stringify(validEnvelope)}\nnot-json\n`, 'utf-8')

    const compacted = await handleInteractiveInput({
      cwd,
      line: '/compact',
      session: research.session,
      router
    })

    expect(compacted.output).toContain('transcript line 2 is unreadable')
    expect(readFileSync(research.session.transcriptPath, 'utf-8')).toContain('not-json')
  })

  it('compacts a fresh session safely even when no transcript file exists yet', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-compact-empty-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Compact Empty'])
    const opened = await handleInteractiveInput({
      cwd,
      line: '/compact',
      router
    })

    expect(opened.output).toContain('Interactive session compact')
    expect(opened.output).toContain('entries: 0 -> 1')
    expect(opened.output).toContain('backup: none')
  })

  it('redacts common secret shapes when compacting transcript history', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-compact-redaction-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Compact Redaction'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    writeFileSync(
      research.session.transcriptPath,
      [
        JSON.stringify({
          id: 'msg-1',
          kind: 'user.session.message',
          source: { kind: 'user', id: 'operator' },
          target: { kind: 'system', id: 'interactive-harness' },
          createdAt: new Date().toISOString(),
          sessionMessageId: 'session-msg-1',
          sessionId: research.session.sessionId,
          role: 'user',
          content: 'callback http://127.0.0.1:1455/auth/callback?code=secret-code&state=secret-state',
          delivery: { channel: 'cli', visibility: 'private' }
        }),
        JSON.stringify({
          id: 'msg-2',
          kind: 'user.session.message',
          source: { kind: 'system', id: 'opengtm' },
          target: { kind: 'system', id: 'interactive-harness' },
          createdAt: new Date().toISOString(),
          sessionMessageId: 'session-msg-2',
          sessionId: research.session.sessionId,
          role: 'assistant',
          content: '{"access_token":"top-secret-token","apiKey":"abc123"}',
          delivery: { channel: 'cli', visibility: 'private' }
        }),
        JSON.stringify({
          id: 'msg-3',
          kind: 'user.session.message',
          source: { kind: 'system', id: 'opengtm' },
          target: { kind: 'system', id: 'interactive-harness' },
          createdAt: new Date().toISOString(),
          sessionMessageId: 'session-msg-3',
          sessionId: research.session.sessionId,
          role: 'assistant',
          content: 'authorization: bearer token-12345',
          delivery: { channel: 'cli', visibility: 'private' }
        })
      ].join('\n') + '\n',
      'utf-8'
    )

    const compacted = await handleInteractiveInput({
      cwd,
      line: '/compact',
      session: research.session,
      router
    })

    const lines = readFileSync(compacted.session.transcriptPath, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const transcript = JSON.parse(lines[0] || '{}') as { content?: string }
    expect(transcript.content).toContain('code=[redacted]')
    expect(transcript.content).toContain('state=[redacted]')
    expect(transcript.content).toContain('"access_token":"[redacted]"')
    expect(transcript.content).toContain('"apiKey":"[redacted]"')
    expect(transcript.content).toContain('bearer [redacted]')
    expect(transcript.content).not.toContain('secret-code')
    expect(transcript.content).not.toContain('top-secret-token')
  })

  it('answers GTM-focused knowledge and pending-state queries inside the session runtime', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-query-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Query'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    expect(research.output).toContain('Supervisor route')
    expect(research.output).toContain('specialist: researcher')
    expect(research.output).toContain('Runtime follow-through')
    expect(research.output).toContain('Interactive runtime')

    const knowledge = await handleInteractiveInput({
      cwd,
      line: 'What do you know about this account?',
      session: research.session,
      router
    })
    expect(knowledge.output).toContain('Interactive harness query')
    expect(knowledge.output).toContain('Current lead motion: Acme')
    expect(knowledge.output).toContain('Relationship state: warm-prospect')

    const next = await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: knowledge.session,
      router
    })
    expect(next.output).toContain('Recommended actions')
    expect(next.output).toContain('Draft outreach for Acme')

    await router(['workflow', 'run', 'crm.roundtrip', 'Pat Example'])
    const pending = await handleInteractiveInput({
      cwd,
      line: "What's pending?",
      session: next.session,
      router
    })
    expect(pending.output).toContain('Pending approvals:')
    expect(pending.output).toContain('specialist: policy-checker')

    const guided = await handleInteractiveInput({
      cwd,
      line: '/next',
      session: pending.session,
      router
    })
    expect(guided.output).toContain('Interactive harness query')
    expect(guided.output).toContain('Recommended actions')
    expect(guided.output).toContain('/approve')
    expect(guided.output).toContain('crm.roundtrip')
  })

  it('surfaces relationship-aware lead guidance after research', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-lead-guidance-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Lead Guidance'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    expect(research.session.leadLane.phase).toBe('draft-ready')
    expect(research.session.leadLane.relationshipState).toBe('warm-prospect')
    expect(research.session.leadLane.doNotSend).toBe(false)

    const next = await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: research.session,
      router
    })

    expect(next.output).toContain('Lead phase: draft-ready')
    expect(next.output).toContain('Relationship state: warm-prospect')
    expect(next.output).toContain('Do-not-send: clear to draft')
    expect(next.output).toContain('Recommended approach:')
  })

  it('falls back to the latest memory/artifact context when entity-summary is asked without an active focus entity', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-memory-fallback-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Memory Fallback'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const fallbackSession = {
      ...research.session,
      focusEntity: null
    }

    const knowledge = await handleInteractiveInput({
      cwd,
      line: 'What do you know about this account?',
      session: fallbackSession,
      router
    })

    expect(knowledge.output).toContain('Current lead motion: Acme')
    expect(knowledge.output).toContain('Relationship state: warm-prospect')
    expect(knowledge.output).toContain('Matching memory records: 1')
    expect(knowledge.output).toContain('Matching artifacts: 1')
  })

  it('routes broader GTM specialist intents beyond research and drafting', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-specialists-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Specialists'])

    const health = await handleInteractiveInput({
      cwd,
      line: 'Check account health for Acme',
      router
    })
    expect(health.output).toContain('specialist: account-health-analyst')
    expect(health.output).toContain('cs.health_score')

    const risk = await handleInteractiveInput({
      cwd,
      line: 'Scan deal risk for Acme',
      session: health.session,
      router
    })
    expect(risk.output).toContain('specialist: deal-risk-analyst')
    expect(risk.output).toContain('ae.deal_risk_scan')
  })

  it('surfaces compact next-action guidance in the interactive prompt label', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-prompt-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Prompt'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const prompt = await buildInteractivePromptLabel(cwd, research.session)
    expect(prompt).toContain('next:draft')

    await router(['workflow', 'run', 'crm.roundtrip', 'Pat Example'])
    const pendingPrompt = await buildInteractivePromptLabel(cwd, research.session)
    expect(pendingPrompt).toContain('next:/approve')
  })


  it('executes runtime action cards with bare numeric quick-slot input', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-quick-slot-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Quick Slot'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const executed = await handleInteractiveInput({
      cwd,
      line: '1',
      session: research.session,
      router
    })

    expect(executed.output).toContain('Runtime action card')
    expect(executed.output).toContain('Draft outreach')
    expect(executed.output).toContain('sdr.outreach_compose')
    expect(executed.output).toContain('Runtime follow-through')
  })

  it('supports terse operator aliases for continue and latest approval resolution', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-quick-ops-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Quick Ops'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const advanced = await handleInteractiveInput({
      cwd,
      line: 'g',
      session: research.session,
      router
    })

    expect(advanced.output).toContain('Runtime advance')
    expect(advanced.output).toContain('approval-gate')

    const approved = await handleInteractiveInput({
      cwd,
      line: 'y',
      session: advanced.session,
      router
    })

    expect(approved.output).toContain('Approval resolution')
    expect(approved.output).toContain('approved')
  })

  it('supports selection-oriented aliases for focused action cards and approval gates', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-selection-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Selection'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const focusedAction = await handleInteractiveInput({
      cwd,
      line: ']',
      session: research.session,
      router
    })

    expect(focusedAction.output).toContain('Operator focus')
    expect(focusedAction.output).toContain('action card: 2/')
    expect(focusedAction.output).toContain('Build outreach sequence')

    const executedFocusedAction = await handleInteractiveInput({
      cwd,
      line: '!',
      session: focusedAction.session,
      router
    })

    expect(executedFocusedAction.output).toContain('Runtime action card')
    expect(executedFocusedAction.output).toContain('Build outreach sequence')
    expect(executedFocusedAction.output).toContain('sdr.outreach_sequence')

    const advanced = await handleInteractiveInput({
      cwd,
      line: 'g',
      session: research.session,
      router
    })

    const focusedGate = await handleInteractiveInput({
      cwd,
      line: '}',
      session: advanced.session,
      router
    })

    expect(focusedGate.output).toContain('Operator focus')
    expect(focusedGate.output).toContain('approval gate:')
    expect(focusedGate.output).toContain('id:')
    expect(focusedGate.output).toContain('shortcut: + / enter or -')

    const approvedFocusedGate = await handleInteractiveInput({
      cwd,
      line: '+',
      session: focusedGate.session,
      router
    })

    expect(approvedFocusedGate.output).toContain('Approval resolution')
    expect(approvedFocusedGate.output).toContain('approved')
  })

  it('preserves focused action selection across runtime refreshes', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-selection-persist-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Selection Persist'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const focusedAction = await handleInteractiveInput({
      cwd,
      line: ']',
      session: research.session,
      router
    })

    const prompt = await buildInteractivePromptLabel(cwd, focusedAction.session)
    expect(prompt).toContain('action:2/')

    const refreshed = await handleInteractiveInput({
      cwd,
      line: '/cards refresh',
      session: focusedAction.session,
      router
    })
    expect(refreshed.output).toContain('Interactive session cards')

    const executedFocusedAction = await handleInteractiveInput({
      cwd,
      line: '!',
      session: refreshed.session,
      router
    })

    expect(executedFocusedAction.output).toContain('Build outreach sequence')
    expect(executedFocusedAction.output).toContain('sdr.outreach_sequence')
  })

  it('supports pane switching plus enter-based execution on the focused pane', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-pane-focus-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Pane Focus'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const focusedAction = await handleInteractiveInput({
      cwd,
      line: ']',
      session: research.session,
      router
    })

    const actionPrompt = await buildInteractivePromptLabel(cwd, focusedAction.session)
    expect(actionPrompt).toContain('pane:act')
    expect(actionPrompt).toContain('action:2/')

    const executedViaEnter = await handleInteractiveInput({
      cwd,
      line: 'enter',
      session: focusedAction.session,
      router
    })

    expect(executedViaEnter.output).toContain('Build outreach sequence')
    expect(executedViaEnter.output).toContain('sdr.outreach_sequence')

    const advanced = await handleInteractiveInput({
      cwd,
      line: 'g',
      session: research.session,
      router
    })

    const focusedPane = await handleInteractiveInput({
      cwd,
      line: 'tab',
      session: advanced.session,
      router
    })
    expect(focusedPane.output).toContain('pane: approvals')

    const gatePrompt = await buildInteractivePromptLabel(cwd, focusedPane.session)
    expect(gatePrompt).toContain('pane:gate')

    const approvedViaEnter = await handleInteractiveInput({
      cwd,
      line: 'enter',
      session: focusedPane.session,
      router
    })
    expect(approvedViaEnter.output).toContain('Approval resolution')
    expect(approvedViaEnter.output).toContain('approved')
  })

  it('executes runtime action cards directly with /do', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-do-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Do'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const executed = await handleInteractiveInput({
      cwd,
      line: '/do',
      session: research.session,
      router
    })

    expect(executed.output).toContain('Runtime action card')
    expect(executed.output).toContain('Draft outreach')
    expect(executed.output).toContain('sdr.outreach_compose')
    expect(executed.output).toContain('Runtime follow-through')
    expect(executed.output).toContain('/approve')
    expect(executed.session.leadLane.phase).toBe('approval-gated')
  })

  it('supports `session do` as a control-plane shortcut for the last shown action cards', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-session-do-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Session Do'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: research.session,
      router
    })

    const result = await router(['session', 'do'])
    expect(result).toMatchObject({
      kind: 'session-action',
      executed: true,
      slot: 1
    })
    if (!('output' in result) || typeof result.output !== 'string') {
      throw new Error('Expected session action output')
    }
    expect(result.output).toContain('Runtime action card')
    expect(result.output).toContain('Draft outreach')
    expect(result.output).toContain('Runtime follow-through')
  })

  it('refreshes persisted action cards from the live session via `/cards refresh`', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-cards-refresh-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Cards Refresh'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const refreshed = await handleInteractiveInput({
      cwd,
      line: '/cards refresh',
      session: research.session,
      router
    })

    expect(refreshed.output).toContain('Interactive session cards')
    expect(refreshed.output).toContain('cards source: refreshed')
    expect(refreshed.output).toContain('Draft outreach')
  })

  it('shows supervisor progress history through `/progress`', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-progress-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Progress'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const advanced = await handleInteractiveInput({
      cwd,
      line: '/continue',
      session: research.session,
      router
    })

    const progress = await handleInteractiveInput({
      cwd,
      line: '/progress',
      session: advanced.session,
      router
    })

    expect(progress.output).toContain('Interactive session progress')
    expect(progress.output).toContain('Advance history')
    expect(progress.output).toContain('approval-gate')
  })

  it('advances the runtime automatically until it reaches an approval gate', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-continue-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Continue'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const advanced = await handleInteractiveInput({
      cwd,
      line: '/continue',
      session: research.session,
      router
    })

    expect(advanced.output).toContain('Runtime advance')
    expect(advanced.output).toContain('steps executed: 1')
    expect(advanced.output).toContain('stop reason: approval-gate')
    expect(advanced.output).toContain('Draft outreach')
    expect(advanced.output).toContain('/approve')
  })

  it('advances account motions across multiple GTM-native steps before stopping', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-account-advance-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Account Advance'])
    const health = await handleInteractiveInput({
      cwd,
      line: 'Check account health for Acme',
      router
    })

    const advanced = await handleInteractiveInput({
      cwd,
      line: '/continue 2',
      session: health.session,
      router
    })

    expect(advanced.output).toContain('Runtime advance')
    expect(advanced.output).toContain('steps executed: 2')
    expect(advanced.output).toContain('Renewal prep for Acme')
    expect(advanced.output).toContain('Account brief for Acme')
  })

  it('resumes the runtime after approval through `/resume`', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-resume-advance-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Resume Advance'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const advanced = await handleInteractiveInput({
      cwd,
      line: '/continue',
      session: research.session,
      router
    })
    expect(advanced.output).toContain('stop reason: approval-gate')

    const approvals = await router(['approvals', 'list'])
    if (!('approvals' in approvals) || !Array.isArray(approvals.approvals) || !approvals.approvals[0]?.id) {
      throw new Error('Expected a pending approval to resume from')
    }
    await router(['approvals', 'approve', approvals.approvals[0].id])

    const resumed = await handleInteractiveInput({
      cwd,
      line: '/resume',
      session: advanced.session,
      router
    })

    expect(resumed.output).toContain('Runtime resume')
    expect(resumed.output).toContain('Outreach sequence')
    expect(resumed.output).toContain('Runtime follow-through')
  })

  it('approves and resumes in one step through `/approve continue`', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-approve-continue-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Approve Continue'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    const advanced = await handleInteractiveInput({
      cwd,
      line: '/continue',
      session: research.session,
      router
    })
    expect(advanced.output).toContain('stop reason: approval-gate')

    const resumed = await handleInteractiveInput({
      cwd,
      line: '/approve continue',
      session: advanced.session,
      router
    })

    expect(resumed.output).toContain('Approval resolution')
    expect(resumed.output).toContain('Runtime resume')
    expect(resumed.output).toContain('Outreach sequence')
  })

  it('surfaces do-not-send follow-through after an outreach approval records outbound activity', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-do-not-send-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Do Not Send'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })
    const drafted = await handleInteractiveInput({
      cwd,
      line: '/do',
      session: research.session,
      router
    })
    const approved = await handleInteractiveInput({
      cwd,
      line: '/approve',
      session: drafted.session,
      router
    })
    expect(approved.output).toContain('Approval resolution')
    expect(approved.session.leadLane.phase).toBe('follow-through')
    expect(approved.session.leadLane.doNotSend).toBe(true)

    const next = await handleInteractiveInput({
      cwd,
      line: 'What should I do next?',
      session: approved.session,
      router
    })

    expect(next.output).toContain('Lead phase: follow-through')
    expect(next.output).toContain('Do-not-send: hold current send')
    expect(next.output).toContain('Recent outbound activity already exists in CRM evidence')
    expect(next.output).toContain('Build outreach sequence')
  })

  it('reuses lead lineage across separate research and outreach turns', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-lead-lineage-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Lead Lineage'])
    const research = await handleInteractiveInput({
      cwd,
      line: 'Research Acme',
      router
    })

    expect(research.session.lineage.lead?.entityName).toBe('Acme')

    const draft = await handleInteractiveInput({
      cwd,
      line: 'Draft outreach for Acme',
      session: research.session,
      router
    })

    expect(draft.session.lineage.lead?.entityName).toBe('Acme')
    expect(draft.session.lineage.lead?.sourceArtifactIds.length || 0).toBeGreaterThan(
      research.session.lineage.lead?.sourceArtifactIds.length || 0
    )

    const config = await loadOpenGtmConfig(cwd)
    if (!config) throw new Error('Expected config after init')
    const daemon = createLocalDaemon({
      rootDir: join(cwd, config.runtimeDir)
    })
    const latestArtifact = getRecord<any>(daemon.storage, 'artifacts', draft.session.lastArtifactId || '')
    expect(latestArtifact?.sourceIds).toContain(research.session.lineage.lead?.lastArtifactId)
  })

  it('builds and executes linked account lifecycle plans with shared dossier lineage', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-account-plan-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Account Lifecycle'])
    const result = await handleInteractiveInput({
      cwd,
      line: 'Check account health for Acme and prepare renewal for Acme',
      router
    })

    expect(result.output).toContain('Vertical runtime lineage')
    expect(result.output).toContain('shared crm db')
    expect(result.output).toContain('Compute account health for Acme')
    expect(result.output).toContain('Prepare renewal brief for Acme')
    expect(result.session.lastWorkflowId).toBe('cs.renewal_prep')
    expect(result.session.accountLane.phase).toBe('brief-ready')
  })

  it('builds and executes linked deal-risk plans with shared account lineage', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-deal-plan-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Deal Lifecycle'])
    const result = await handleInteractiveInput({
      cwd,
      line: 'Check account health for Acme and scan deal risk for Acme',
      router
    })

    expect(result.output).toContain('Vertical runtime lineage')
    expect(result.output).toContain('Scan deal risk for Acme Renewal')
    expect(result.session.lastWorkflowId).toBe('ae.deal_risk_scan')
    expect(result.session.dealLane.phase).toBe('risk-assessed')
  })

  it('builds and executes multi-step supervisor plans for composite GTM asks', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-plan-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Planning'])
    const plan = createSessionPlan('Research Acme and draft outreach for Acme')
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[0]?.commandArgs[2]).toBe('sdr.lead_research')
    expect(plan.steps[1]?.commandArgs[2]).toBe('sdr.outreach_compose')

    const result = await handleInteractiveInput({
      cwd,
      line: 'Research Acme and draft outreach for Acme',
      router
    })

    expect(result.output).toContain('Supervisor plan')
    expect(result.output).toContain('Plan step step-1')
    expect(result.output).toContain('Plan step step-2')
    expect(result.output).toContain('sdr.lead_research')
    expect(result.output).toContain('Vertical runtime lineage')
    expect(result.output).toContain('Compose first-touch outreach for Acme')

    const config = await loadOpenGtmConfig(cwd)
    if (!config) throw new Error('Expected config after init')
    const daemon = createLocalDaemon({
      rootDir: join(cwd, config.runtimeDir)
    })
    const latestArtifact = getRecord<any>(daemon.storage, 'artifacts', result.session.lastArtifactId || '')
    expect(Array.isArray(latestArtifact?.sourceIds)).toBe(true)
    expect((latestArtifact?.sourceIds || []).length).toBeGreaterThan(0)

    const sessionArtifacts = listRecords<any>(daemon.storage, 'artifacts').filter((artifact) =>
      String(artifact.title || '').startsWith('Session ')
    )
    expect(sessionArtifacts.length).toBeGreaterThan(0)
  })

  it('executes query-led composite plans through the supervisor planner', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-query-plan-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Query Plan'])
    await router(['workflow', 'run', 'crm.roundtrip', 'Pat Example'])

    const result = await handleInteractiveInput({
      cwd,
      line: "What's pending and show traces",
      router
    })

    expect(result.output).toContain('Supervisor plan')
    expect(result.output).toContain('Plan step step-1')
    expect(result.output).toContain('Plan step step-2')
    expect(result.output).toContain('Pending approvals:')
    expect(result.output).toContain('Run traces')
  })

  it('surfaces structured dossier summaries after account lifecycle motions', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-dossier-query-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Dossier'])
    const runtime = await handleInteractiveInput({
      cwd,
      line: 'Check account health for Acme and prepare renewal for Acme',
      router
    })

    const query = await handleInteractiveInput({
      cwd,
      line: 'What do you know about this account?',
      session: runtime.session,
      router
    })

    expect(query.output).toContain('Health score:')
    expect(query.output).toContain('Top risk:')
    expect(query.output).toContain('Top opportunity:')
    expect(query.output).toContain('Account phase:')
  })

  it('surfaces structured deal dossier summaries after deal-risk motions', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-deal-query-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Deal Dossier'])
    const runtime = await handleInteractiveInput({
      cwd,
      line: 'Check account health for Acme and scan deal risk for Acme',
      router
    })

    const query = await handleInteractiveInput({
      cwd,
      line: 'What do you know about this deal?',
      session: runtime.session,
      router
    })

    expect(query.output).toContain('Current GTM deal focus:')
    expect(query.output).toContain('Deal phase:')
    expect(query.output).toContain('Risk score:')
    expect(query.output).toContain('Next action:')
  })

  it('reuses account lineage across separate health and deal-risk turns', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-account-lineage-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Account Lineage'])
    const health = await handleInteractiveInput({
      cwd,
      line: 'Check account health for Acme',
      router
    })

    expect(health.session.lineage.account?.entityName).toBe('Acme')

    const risk = await handleInteractiveInput({
      cwd,
      line: 'Scan deal risk for Acme',
      session: health.session,
      router
    })

    expect(risk.session.lineage.account?.account.id).toBe(health.session.lineage.account?.account.id)
    expect(risk.session.lineage.deal?.account.id).toBe(health.session.lineage.account?.account.id)
    expect(risk.session.lineage.deal?.entityName).toBe('Acme Renewal')

    const config = await loadOpenGtmConfig(cwd)
    if (!config) throw new Error('Expected config after init')
    const daemon = createLocalDaemon({
      rootDir: join(cwd, config.runtimeDir)
    })
    const latestArtifact = getRecord<any>(daemon.storage, 'artifacts', risk.session.lastArtifactId || '')
    expect(latestArtifact?.sourceIds).toContain(health.session.lineage.account?.dossierArtifactId)
  })

  it('routes account brief requests to the live account-brief workflow', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-account-brief-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Account Brief'])
    const result = await handleInteractiveInput({
      cwd,
      line: 'Show account brief for Acme',
      router
    })

    expect(result.output).toContain('ae.account_brief')
    expect(result.output).toContain('support tier: live')
  })

  it('keeps resume-last-task on a valid workflow id after linked supervisor runs', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-resume-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=Interactive Demo', '--initiative=Resume'])
    const first = await handleInteractiveInput({
      cwd,
      line: 'Research Acme and draft outreach for Acme',
      router
    })

    expect(first.session.lastWorkflowId).toBe('sdr.outreach_compose')

    const resumed = await handleInteractiveInput({
      cwd,
      line: 'Resume last task',
      session: first.session,
      router
    })
    expect(resumed.output).toContain('sdr.outreach_compose')
  })
})
