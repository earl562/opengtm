import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createElement, useEffect, useMemo, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import {
  applyInteractiveFlashFromOutput,
  applyInteractiveTerminalKey,
  buildInteractiveCommandPaletteItems,
  buildInteractiveScreenActionItems,
  handleInteractiveInput,
  loadInteractiveRuntimeState,
  saveInteractiveSession,
  syncInteractiveSessionForUi,
  type OpenGtmInteractiveIo,
  type OpenGtmInteractiveRuntimeState,
  type OpenGtmInteractiveScreen,
  type OpenGtmInteractiveSession,
  type OpenGtmInteractiveUiActionItem
} from './interactive.js'
import { loadOpenGtmConfig } from './config.js'

type InkInputKey = {
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  tab?: boolean
  backspace?: boolean
  delete?: boolean
  escape?: boolean
  home?: boolean
  end?: boolean
  return?: boolean
  leftArrow?: boolean
  rightArrow?: boolean
  upArrow?: boolean
  downArrow?: boolean
}

type CardTone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'muted'

function mapInkKeypress(input: string, key: InkInputKey) {
  const name = key.leftArrow
    ? 'left'
    : key.rightArrow
      ? 'right'
      : key.upArrow
        ? 'up'
        : key.downArrow
          ? 'down'
          : key.return
            ? 'return'
            : key.escape
              ? 'escape'
              : key.tab
                ? 'tab'
                : key.backspace
                  ? 'backspace'
                  : key.delete
                    ? 'delete'
                    : key.home
                      ? 'home'
                      : key.end
                        ? 'end'
                        : undefined

  return {
    name,
    sequence: input || undefined,
    ctrl: key.ctrl,
    meta: key.meta,
    shift: key.shift
  }
}

function tone(color: CardTone) {
  switch (color) {
    case 'primary': return { border: 'cyan', title: 'cyan', accent: 'cyanBright' }
    case 'success': return { border: 'green', title: 'green', accent: 'greenBright' }
    case 'warning': return { border: 'yellow', title: 'yellow', accent: 'yellowBright' }
    case 'error': return { border: 'red', title: 'red', accent: 'redBright' }
    case 'info': return { border: 'blue', title: 'blue', accent: 'blueBright' }
    case 'muted': return { border: 'gray', title: 'gray', accent: 'white' }
  }
}

function trimLine(value: string, max = 94) {
  if (max <= 0) return value
  return value
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : 'none'
}

function statusTone(status: string): CardTone {
  if (status === 'waiting-for-approval') return 'warning'
  if (status === 'running') return 'info'
  if (status === 'completed') return 'success'
  if (status === 'stopped') return 'muted'
  return 'primary'
}

function authTone(runtime: OpenGtmInteractiveRuntimeState): CardTone {
  if (runtime.auth.pendingPkce) return 'warning'
  if (runtime.auth.configured) return 'success'
  return 'muted'
}

function screenLabel(screen: OpenGtmInteractiveScreen) {
  switch (screen) {
    case 'auth': return 'Auth'
    case 'run': return 'Test'
    case 'approvals': return 'Approvals'
    case 'inspect': return 'Inspect'
    default: return 'Home'
  }
}

function screenTone(screen: OpenGtmInteractiveScreen): CardTone {
  switch (screen) {
    case 'auth': return 'info'
    case 'run': return 'success'
    case 'approvals': return 'warning'
    case 'inspect': return 'muted'
    default: return 'primary'
  }
}

function Card(props: {
  title: string
  tone: CardTone
  lines: string[]
  active?: boolean
  flexGrow?: number
  width?: number | string
}) {
  const colors = tone(props.tone)
  return createElement(
    Box,
    {
      width: props.width || '100%',
      alignSelf: 'stretch',
      flexDirection: 'column',
      paddingX: 1,
      paddingY: 0,
      marginBottom: 1,
      flexGrow: props.flexGrow || 0
    },
    createElement(Text, { color: props.active ? colors.accent : colors.title, bold: true }, `${props.active ? '› ' : ''}${props.title}`),
    ...props.lines.map((line, index) => createElement(Text, { key: `${props.title}-${index}`, dimColor: props.tone === 'muted' }, trimLine(line)))
  )
}

function readTranscriptPath(cwd: string, transcriptPath: string) {
  return path.isAbsolute(transcriptPath) ? transcriptPath : path.join(cwd, transcriptPath)
}

async function loadTranscriptPreview(cwd: string, transcriptPath: string) {
  const filePath = readTranscriptPath(cwd, transcriptPath)
  try {
    const raw = await readFile(filePath, 'utf8')
    const lines = raw.trim().split('\n').filter(Boolean)
    return lines.slice(-6).map((line) => {
      try {
        const parsed = JSON.parse(line) as { role?: string; content?: string }
        return `${parsed.role || 'unknown'}: ${String(parsed.content || '').replace(/\s+/g, ' ')}`
      } catch {
        return line
      }
    })
  } catch {
    return ['No transcript yet.']
  }
}

function recentActivityLines(session: OpenGtmInteractiveSession) {
  if (!session.eventFeed.length) {
    return ['No recent runtime events.']
  }
  return session.eventFeed.slice(0, 5).map((event) => {
    const timestamp = String(event.createdAt || '').split('T')[1]?.slice(0, 8) || 'now'
    return `${timestamp} · ${event.kind} · ${event.text}`
  })
}

function primitiveLoopLines(lastOutput: string) {
  if (!lastOutput.startsWith('Primitive agent loop')) {
    return []
  }
  return lastOutput
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(1, 8)
}

function actionFocus(session: OpenGtmInteractiveSession, actions: OpenGtmInteractiveUiActionItem[]) {
  if (actions.length === 0) {
    return { index: 0, total: 0, action: null as OpenGtmInteractiveUiActionItem | null }
  }
  const index = Math.max(0, Math.min(session.selection.actionCardIndex, actions.length - 1))
  return { index, total: actions.length, action: actions[index] || null }
}

function approvalFocus(session: OpenGtmInteractiveSession, runtime: OpenGtmInteractiveRuntimeState) {
  const approvals = runtime.pendingApprovalSummaries || []
  if (approvals.length === 0) {
    return { index: 0, total: 0, approval: null as OpenGtmInteractiveRuntimeState['pendingApprovalSummaries'][number] | null }
  }
  const index = Math.max(0, Math.min(session.selection.approvalIndex, approvals.length - 1))
  return { index, total: approvals.length, approval: approvals[index] || null }
}

function renderActionLines(actions: OpenGtmInteractiveUiActionItem[], selectedIndex: number) {
  if (actions.length === 0) return ['No actions available for this workspace.']
  return actions.slice(0, 6).map((action, index) => {
    const prefix = index === selectedIndex ? '›' : ' '
    const state = action.disabled ? ' [unavailable]' : ''
    return `${prefix} ${index + 1}. ${action.title}${state}`
  })
}

function renderApprovalLines(
  approvals: OpenGtmInteractiveRuntimeState['pendingApprovalSummaries'],
  selectedIndex: number
) {
  if (approvals.length === 0) return ['No pending approvals.']
  return approvals.slice(0, 5).map((approval, index) => `${index === selectedIndex ? '›' : ' '} ${shortId(approval.id)} · ${approval.actionSummary}`)
}

function renderScreenTabs(activeScreen: OpenGtmInteractiveScreen) {
  const screens: OpenGtmInteractiveScreen[] = ['home', 'auth', 'run', 'approvals', 'inspect']
  const labels = screens.map((screen) => screen === activeScreen ? `[${screenLabel(screen)}]` : screenLabel(screen))
  return createElement(
    Box,
    { marginBottom: 1, justifyContent: 'center', width: '100%' },
    createElement(Text, { color: tone('muted').title }, labels.join('  ·  '))
  )
}

function screenComposerHint(screen: OpenGtmInteractiveScreen) {
  switch (screen) {
    case 'auth':
      return 'Use /auth to inspect the current auth target, /auth login <provider> to configure it, and /auth browser or /auth complete <url> for OAuth providers.'
    case 'run':
      return 'Use /do, /continue, /resume, or pick a starter workflow from the action rail.'
    case 'approvals':
      return 'Use + / - / enter on the focused gate, or /approve continue to unblock the lane.'
    case 'inspect':
      return 'Use /history, /traces, /progress, or /status to inspect the harness.'
    default:
      return 'Use /auth to sign in, /test to run workflows, or ask for Research Acme to start the loop.'
  }
}

function buildPrimaryWorkspace(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  runtime: OpenGtmInteractiveRuntimeState
  lastOutput: string
  transcriptLines: string[]
  actions: OpenGtmInteractiveUiActionItem[]
}) {
  const selectedAction = actionFocus(args.session, args.actions)
  const selectedApproval = approvalFocus(args.session, args.runtime)

  if (args.session.uiOverlay === 'help') {
    return {
      title: 'Help',
      tone: 'info' as CardTone,
      lines: [
        'The shell is organized into Home, Auth, Test, Approvals, and Inspect workspaces.',
        'Natural language and slash commands share one composer.',
        'Tab / Shift+Tab switch between the action rail and approvals rail.',
        'Enter opens the focused action or approves the focused gate.',
        'Ctrl+K opens the command palette. ? toggles help. Ctrl+L clears visible output.',
        screenComposerHint(args.session.activeScreen)
      ]
    }
  }

  if (args.session.uiOverlay === 'palette') {
    const paletteItems = buildInteractiveCommandPaletteItems(args.session)
    const selectedIndex = Math.max(0, Math.min(args.session.uiOverlayIndex, Math.max(0, paletteItems.length - 1)))
    const selected = paletteItems[selectedIndex]
    return {
      title: 'Command palette',
      tone: 'primary' as CardTone,
      lines: [
        'Global actions ranked for the current shell context:',
        ...(paletteItems.length > 0
          ? paletteItems.slice(0, 10).map((item, index) => `${index === selectedIndex ? '›' : ' '} ${item.label} · ${item.commandLine}`)
          : ['No palette actions available.']),
        '---',
        selected ? `detail: ${selected.detail}` : 'detail: none',
        selected ? `preview: ${selected.commandLine}` : 'preview: none',
        'enter runs selected item · j/k or arrows move · esc closes'
      ]
    }
  }

  if (args.session.activeScreen === 'auth') {
    const authStatus = args.runtime.auth.pendingPkce
      ? 'pending browser completion'
      : args.runtime.auth.configured
        ? 'configured'
        : 'missing'
    return {
      title: 'Auth workspace',
      tone: authTone(args.runtime),
      lines: [
        `login target: ${args.runtime.auth.providerLabel} (${args.runtime.auth.authMode})`,
        `shell provider: ${args.runtime.provider}/${args.runtime.model}`,
        `status: ${authStatus}`,
        `identity: ${args.runtime.auth.maskedValue || args.runtime.auth.accountId || 'none'}`,
        `backend: ${args.runtime.auth.backend || 'none'}`,
        args.runtime.auth.pendingPkce ? `redirect: ${args.runtime.auth.pendingPkce.redirectUri}` : 'redirect: none',
        args.runtime.auth.pendingPkce ? `auth url: ${args.runtime.auth.pendingPkce.authUrl}` : 'auth url: none',
        'providers:',
        ...args.runtime.auth.providers.slice(0, 4).map((provider) => `• ${provider.current ? '[current] ' : ''}${provider.label} · ${provider.authMode} · ${provider.configured ? 'configured' : 'not configured'}`),
        args.runtime.auth.models.length > 0 ? 'models:' : 'models: no provider models loaded yet',
        ...args.runtime.auth.models.slice(0, 4).map((model) => `• ${model.current ? '[current] ' : ''}${model.id}`),
        'use /auth provider <id> to change the login target without switching the shell provider',
        'paste the callback URL directly to finish login without leaving the shell composer'
      ]
    }
  }

  if (args.session.activeScreen === 'run') {
    return {
      title: 'Manual test workspace',
      tone: 'success' as CardTone,
      lines: [
        `screen action: ${selectedAction.action?.title || 'none'}`,
        selectedAction.action ? `detail: ${selectedAction.action.detail}` : 'detail: no starter action is selected yet',
        selectedAction.action
          ? `command: ${selectedAction.action.commandArgs ? `opengtm ${selectedAction.action.commandArgs.join(' ')}` : selectedAction.action.commandLine}`
          : 'command: none',
        `next: ${args.runtime.nextLabel || args.runtime.nextHint || 'choose a starter workflow from the action rail'}`,
        `trace: ${shortId(args.runtime.latestTrace?.id)} / ${args.runtime.latestTrace?.status || 'none'}`,
        `lead lane: ${args.session.leadLane.phase || 'idle'}`,
        `account lane: ${args.session.accountLane.phase || 'idle'}`,
        `deal lane: ${args.session.dealLane.phase || 'idle'}`,
        args.lastOutput.trim().length > 0 ? 'latest result:' : 'starter prompts:',
        ...(args.lastOutput.trim().length > 0
          ? args.lastOutput.split('\n').map((line) => line.trim()).filter(Boolean).slice(-8)
          : args.actions.slice(0, 4).map((action) => `• ${action.title}`))
      ]
    }
  }

  if (args.session.activeScreen === 'approvals') {
    if (!selectedApproval.approval) {
      return {
        title: 'Approvals workspace',
        tone: 'warning' as CardTone,
        lines: [
          'No approval gate is currently focused.',
          'Run a workflow that requests approval, or open the test workspace to exercise a gated motion.'
        ]
      }
    }
    return {
      title: 'Approvals workspace',
      tone: 'warning' as CardTone,
      lines: [
        `queue slot: ${selectedApproval.index + 1}/${selectedApproval.total}`,
        `id: ${selectedApproval.approval.id}`,
        `action: ${selectedApproval.approval.actionSummary}`,
        `lane: ${selectedApproval.approval.lane || 'n/a'}`,
        `target: ${selectedApproval.approval.target || 'n/a'}`,
        `runtime status: ${args.session.advance.status}`,
        `next: ${args.runtime.nextLabel || 'Resolve the gate to continue the lane.'}`,
        'approve with + or Enter · deny with - · use /approve continue to resume automatically'
      ]
    }
  }

  if (args.session.activeScreen === 'inspect') {
    const primitiveLines = primitiveLoopLines(args.lastOutput)
    const body = primitiveLines.length > 0
      ? primitiveLines
      : (args.lastOutput.trim().length > 0
        ? args.lastOutput.split('\n').map((line) => line.trim()).filter(Boolean).slice(-10)
        : args.transcriptLines.slice(-6))
    return {
      title: 'Inspect workspace',
      tone: 'muted' as CardTone,
      lines: [
        `latest trace: ${shortId(args.runtime.latestTrace?.id)} / ${args.runtime.latestTrace?.status || 'none'}`,
        `runtime lane: ${args.runtime.lastWorkflowId || 'none'}`,
        `provider: ${args.runtime.provider}/${args.runtime.model}`,
        `sandbox: ${args.runtime.sandboxRuntime} / ${args.runtime.sandboxProfile}`,
        'current evidence:',
        ...body
      ]
    }
  }

  return {
    title: 'Home workspace',
    tone: 'primary' as CardTone,
    lines: [
      'OpenGTM is running in the terminal harness layout.',
      `workspace: ${path.basename(args.cwd) || args.cwd}`,
      `session: ${shortId(args.session.sessionId)}`,
      `provider: ${args.runtime.provider}/${args.runtime.model}`,
      `auth: ${args.runtime.auth.configured ? 'configured' : args.runtime.auth.pendingPkce ? 'pending oauth' : 'missing'}`,
      `next: ${args.runtime.nextLabel || 'open /auth or /test to start a manual flow'}`,
      'quick starts:',
      '• /auth to start or finish OAuth',
      '• /test to run starter workflows',
      '• Research Acme to let the harness generate its own runtime lane',
      'recent transcript:',
      ...args.transcriptLines.slice(-3)
    ]
  }
}

function buildSecondaryPanel(args: {
  session: OpenGtmInteractiveSession
  lastOutput: string
  transcriptLines: string[]
}) {
  if (args.session.activeScreen === 'inspect') {
    return {
      title: 'Transcript',
      tone: 'muted' as CardTone,
      lines: args.transcriptLines.length > 0 ? args.transcriptLines : ['No transcript yet.']
    }
  }

  if (args.lastOutput.trim().length > 0) {
    return {
      title: 'Latest result',
      tone: 'primary' as CardTone,
      lines: args.lastOutput.split('\n').map((line) => line.trim()).filter(Boolean).slice(-10)
    }
  }

  return {
    title: 'Transcript preview',
    tone: 'muted' as CardTone,
    lines: args.transcriptLines.length > 0 ? args.transcriptLines.slice(-4) : ['No transcript yet.']
  }
}

function OpenGtmInkApp(props: {
  cwd: string
  session: OpenGtmInteractiveSession
  router: ReturnType<typeof import('./router.js').createCliRouter>
  initialLastOutput: string
}) {
  const { exit } = useApp()
  const [session, setSession] = useState(props.session)
  const [runtime, setRuntime] = useState<OpenGtmInteractiveRuntimeState | null>(null)
  const [configSummary, setConfigSummary] = useState<{ provider: string; model: string; authMode: string; authRef: string } | null>(null)
  const [lastOutput, setLastOutput] = useState(props.initialLastOutput)
  const [transcriptLines, setTranscriptLines] = useState<string[]>(['No transcript yet.'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      try {
        const [nextRuntime, nextTranscript, config] = await Promise.all([
          loadInteractiveRuntimeState(props.cwd, session),
          loadTranscriptPreview(props.cwd, session.transcriptPath),
          loadOpenGtmConfig(props.cwd)
        ])
        if (!cancelled) {
          setRuntime(nextRuntime)
          setTranscriptLines(nextTranscript)
          setConfigSummary(config ? {
            provider: config.preferences?.currentProvider || 'mock',
            model: config.preferences?.currentModel || 'mock-0',
            authMode: config.auth?.[config.preferences?.currentProvider || 'mock']?.authMode || 'none',
            authRef: config.auth?.[config.preferences?.currentProvider || 'mock']?.maskedValue || 'none'
          } : null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(String(loadError))
        }
      }
    }

    void refresh()
    const interval = setInterval(() => {
      void refresh()
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [props.cwd, session])

  const resolvedRuntime = runtime || {
    pendingApprovals: 0,
    pendingApprovalSummaries: [],
    provider: 'loading',
    model: 'loading',
    providerConfigured: false,
    sandboxProfile: 'loading',
    sandboxRuntime: 'loading',
    sandboxAvailable: false,
    latestTrace: null,
    leadPhase: null,
    leadRelationshipState: null,
    leadDoNotSend: null,
    leadRecommendedApproach: null,
    accountPhase: null,
    dealPhase: null,
    lineage: null,
    lastWorkflowId: null,
    recommendedActions: [],
    actionCards: [],
    nextHint: null,
    nextLabel: null,
    auth: {
      shellProviderId: 'mock',
      shellProviderLabel: 'Mock provider',
      providerId: 'openai',
      providerLabel: 'OpenAI API',
      authMode: 'oauth',
      backend: null,
      configured: false,
      maskedValue: null,
      accountId: null,
      pendingPkce: null,
      providers: [],
      models: []
    }
  }

  const actions = useMemo(
    () => buildInteractiveScreenActionItems(session, resolvedRuntime),
    [resolvedRuntime, session]
  )
  const currentAction = actionFocus(session, actions)
  const currentApproval = approvalFocus(session, resolvedRuntime)
  const workspace = useMemo(() => buildPrimaryWorkspace({
    cwd: props.cwd,
    session,
    runtime: resolvedRuntime,
    lastOutput,
    transcriptLines,
    actions
  }), [actions, lastOutput, props.cwd, resolvedRuntime, session, transcriptLines])
  const secondary = useMemo(() => buildSecondaryPanel({
    session,
    lastOutput,
    transcriptLines
  }), [lastOutput, session, transcriptLines])

  useInput((input, key) => {
    if (busy) return

    const update = applyInteractiveTerminalKey(session, mapInkKeypress(input, key))
    setSession(update.session)
    void saveInteractiveSession(props.cwd, update.session)

    if (!update.dispatch) {
      return
    }

    setBusy(true)
    setError(null)

    void (async () => {
      try {
        const result = await handleInteractiveInput({
          cwd: props.cwd,
          line: update.dispatch!.line,
          session: update.session,
          router: props.router,
          recordTranscript: update.dispatch!.recordTranscript
        })
        const persisted = await saveInteractiveSession(
          props.cwd,
          applyInteractiveFlashFromOutput(syncInteractiveSessionForUi(result.session), result.output)
        )
        setSession(persisted)
        setLastOutput(result.output || '')
        if (result.exit) {
          exit()
        }
      } catch (dispatchError) {
        setError(String(dispatchError))
      } finally {
        setBusy(false)
      }
    })()
  })

  const headerRight = [
    `${configSummary?.provider || resolvedRuntime.provider}/${configSummary?.model || resolvedRuntime.model}`,
    session.advance.status,
    `${resolvedRuntime.pendingApprovals} approvals`
  ].join(' · ')

  const authStateLabel = resolvedRuntime.auth.pendingPkce
    ? 'pending'
    : resolvedRuntime.auth.configured
      ? 'ready'
      : 'missing'

  const controlPlaneLines = [
    `workspace: ${path.basename(props.cwd) || props.cwd}`,
    `session: ${shortId(session.sessionId)}`,
    `screen: ${screenLabel(session.activeScreen)}`,
    `focus: ${session.focusType || 'none'} / ${session.focusEntity || 'none'}`,
    `trace: ${shortId(resolvedRuntime.latestTrace?.id)} / ${resolvedRuntime.latestTrace?.status || 'none'}`,
    `provider: ${configSummary?.provider || resolvedRuntime.provider}`,
    `model: ${configSummary?.model || resolvedRuntime.model}`,
    `auth target: ${resolvedRuntime.auth.providerId}`,
    `auth: ${authStateLabel} / ${resolvedRuntime.auth.maskedValue || resolvedRuntime.auth.accountId || configSummary?.authRef || 'none'}`,
    error ? `error: ${error}` : `sandbox: ${resolvedRuntime.sandboxRuntime} / ${resolvedRuntime.sandboxProfile}`
  ]
  const stdoutWidth = props.cwd ? (process.stdout.columns || 160) : 160
  const shellWidth = Math.max(72, Math.min(stdoutWidth - 4, 160))
  const useTriplePane = shellWidth >= 112
  const leftRailWidth = 22
  const rightRailWidth = 28
  const mainPaneWidth = useTriplePane
    ? Math.max(40, shellWidth - leftRailWidth - rightRailWidth - 4)
    : shellWidth
  const overlayPanel = session.uiOverlay === 'palette'
    ? {
        title: 'Command palette',
        tone: 'primary' as CardTone,
        lines: buildInteractiveCommandPaletteItems(session)
          .slice(0, 10)
          .map((item, index) => `${index === session.uiOverlayIndex ? '›' : ' '} ${item.label} · ${item.commandLine}`)
      }
    : session.uiOverlay === 'help'
      ? {
          title: 'Help',
          tone: 'info' as CardTone,
          lines: [
            'The shell is command-first: main pane, stable rails, anchored composer.',
            screenComposerHint(session.activeScreen),
            'tab switches rails · enter activates focused item · ctrl+k opens the palette · ctrl+l clears output'
          ]
        }
      : null

  return createElement(
    Box,
    { width: '100%', flexDirection: 'column' },
    createElement(
      Box,
      { width: '100%', alignItems: 'center', paddingX: 1, flexDirection: 'column' },
      createElement(
        Box,
        { width: shellWidth, flexDirection: 'column' },
        createElement(
          Box,
          { justifyContent: 'space-between', marginBottom: 1, width: '100%' },
          createElement(Text, { color: 'cyan', bold: true }, 'OpenGTM'),
          createElement(Text, { color: 'gray' }, headerRight)
        ),
        renderScreenTabs(session.activeScreen),
        createElement(
          Box,
          { width: '100%', justifyContent: 'center', marginBottom: 1 },
          createElement(
            Text,
            { color: 'gray' },
            `screen=${screenLabel(session.activeScreen)} · provider=${resolvedRuntime.provider} · auth=${authStateLabel} · approvals=${resolvedRuntime.pendingApprovals}`
          )
        ),
        createElement(
          Box,
          { justifyContent: 'space-between', marginBottom: 1, width: '100%' },
          createElement(Text, { color: 'white' }, `${path.basename(props.cwd) || props.cwd} · session ${shortId(session.sessionId)}`),
          createElement(Text, { color: tone(screenTone(session.activeScreen)).title }, busy ? 'processing…' : session.interactionMode)
        ),
        useTriplePane
          ? createElement(
              Box,
              { width: '100%', flexDirection: 'row', alignItems: 'flex-start' },
              createElement(
                Box,
                { width: leftRailWidth, paddingRight: 1, flexDirection: 'column' },
                Card({
                  title: 'Action rail',
                  tone: 'muted',
                  active: session.selection.focusedPane === 'actions',
                  lines: renderActionLines(actions, currentAction.index).slice(0, 10),
                  width: '100%'
                }),
                Card({
                  title: 'Activity',
                  tone: 'muted',
                  lines: recentActivityLines(session),
                  width: '100%'
                })
              ),
              createElement(
                Box,
                { width: mainPaneWidth, paddingX: 1, flexDirection: 'column' },
                Card({
                  title: workspace.title,
                  tone: workspace.tone,
                  active: true,
                  flexGrow: 1,
                  lines: workspace.lines,
                  width: '100%'
                }),
                Card({
                  title: secondary.title,
                  tone: secondary.tone,
                  lines: secondary.lines,
                  width: '100%'
                })
              ),
              createElement(
                Box,
                { width: rightRailWidth, paddingLeft: 1, flexDirection: 'column' },
                Card({
                  title: 'Approval queue',
                  tone: session.selection.focusedPane === 'approvals' ? 'warning' : 'muted',
                  active: session.selection.focusedPane === 'approvals',
                  lines: renderApprovalLines(resolvedRuntime.pendingApprovalSummaries, currentApproval.index),
                  width: '100%'
                }),
                Card({
                  title: 'Context',
                  tone: 'muted',
                  lines: controlPlaneLines,
                  width: '100%'
                })
              )
            )
          : createElement(
              Box,
              { width: '100%', flexDirection: 'column' },
              Card({
                title: workspace.title,
                tone: workspace.tone,
                active: true,
                flexGrow: 1,
                lines: workspace.lines,
                width: '100%'
              }),
              Card({
                title: secondary.title,
                tone: secondary.tone,
                lines: secondary.lines,
                width: '100%'
              }),
              Card({
                title: 'Action rail',
                tone: session.selection.focusedPane === 'actions' ? screenTone(session.activeScreen) : 'muted',
                active: session.selection.focusedPane === 'actions',
                lines: renderActionLines(actions, currentAction.index),
                width: '100%'
              }),
              Card({
                title: 'Approval queue',
                tone: session.selection.focusedPane === 'approvals' ? 'warning' : 'muted',
                active: session.selection.focusedPane === 'approvals',
                lines: renderApprovalLines(resolvedRuntime.pendingApprovalSummaries, currentApproval.index),
                width: '100%'
              }),
              Card({
                title: 'Context',
                tone: 'muted',
                lines: controlPlaneLines,
                width: '100%'
              }),
              Card({
                title: 'Activity',
                tone: 'muted',
                lines: recentActivityLines(session),
                width: '100%'
              })
            ),
        overlayPanel ? Card({
          title: overlayPanel.title,
          tone: overlayPanel.tone,
          lines: overlayPanel.lines,
          width: '100%'
        }) : null,
        createElement(
          Box,
          { flexDirection: 'column', paddingX: 1, marginTop: 1, width: '100%' },
          createElement(Text, { color: tone(screenTone(session.activeScreen)).title, bold: true }, `> ${session.composeBuffer || 'Ask OpenGTM…'}`),
          createElement(Text, { color: 'gray' }, busy
            ? 'processing current command'
            : `${screenComposerHint(session.activeScreen)} · tab switch rails · ctrl+k palette · ? help · ctrl+l clear · ctrl+c exit`)
        )
      )
    )
  )
}

export async function runInteractiveInkHarnessLoop(args: {
  cwd: string
  io: OpenGtmInteractiveIo
  router: ReturnType<typeof import('./router.js').createCliRouter>
  session: OpenGtmInteractiveSession
  lastOutput: string
}) {
  const app = render(
    createElement(OpenGtmInkApp, {
      cwd: args.cwd,
      session: args.session,
      router: args.router,
      initialLastOutput: args.lastOutput
    }),
    {
      stdin: args.io.stdin as unknown as import('node:tty').ReadStream,
      stdout: args.io.stdout as unknown as import('node:tty').WriteStream,
      alternateScreen: true,
      exitOnCtrlC: false,
      patchConsole: false
    }
  )

  await app.waitUntilExit()
}
