import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createLocalDaemon } from '@opengtm/daemon'
import type { OpenGtmApprovalRequest, OpenGtmRunTrace } from '@opengtm/types'
import { DEFAULT_RUNTIME_DIR, loadOpenGtmConfig } from './config.js'
import { parseCliArgs } from './parse.js'
import { generateWithWorkspaceProvider } from './provider-runtime.js'
import { renderCliOutput } from './render/index.js'
import { validateUserSessionMessageEnvelope } from '@opengtm/protocol'
import { executeHarnessPrimitive, searchHarnessPrimitives } from './tool-registry.js'
import { getProviderPendingPkce, type OpenGtmPendingPkceRecord } from './credentials.js'
import { getProviderCatalogEntry, listModelsForProvider, listProviderCatalog } from './catalog.js'
import { parseOauthRedirect } from './oauth.js'
import { parseSessionIntent } from './session-intents.js'
import {
  queryEntitySummary,
  queryLatestSummary,
  queryNextSummary,
  queryPendingSummary,
  type OpenGtmSessionActionCard
} from './session-queries.js'
import {
  createEmptySessionLineageState,
  mergeSessionLineageState,
  normalizeSessionLineageState,
  type OpenGtmSessionLineageState
} from './session-lineage.js'
import {
  createEmptyLeadLaneState,
  deriveLeadLaneStateFromRuntime,
  deriveLeadLaneStateFromSummary,
  normalizeLeadLaneState,
  transitionLeadLaneState,
  type OpenGtmLeadLaneState
} from './lead-lane.js'
import {
  createEmptyAccountLaneState,
  createEmptyDealLaneState,
  deriveAccountLaneStateFromRuntime,
  deriveAccountLaneStateFromSummary,
  deriveDealLaneStateFromRuntime,
  deriveDealLaneStateFromSummary,
  normalizeAccountLaneState,
  normalizeDealLaneState,
  transitionAccountLaneState,
  transitionDealLaneState,
  type OpenGtmAccountLaneState,
  type OpenGtmDealLaneState
} from './customer-lanes.js'
import { createSessionPlan, type OpenGtmSessionPlan } from './session-supervisor.js'
import {
  executeLinkedAccountMotionPlan,
  executeLinkedLeadMotionPlan,
  isLinkedAccountMotionPlan,
  isLinkedLeadMotionPlan
} from './session-runtime.js'

export interface OpenGtmInteractiveSession {
  sessionId: string
  createdAt: string
  updatedAt: string
  transcriptPath: string
  status: 'active' | 'closed'
  lastTraceId: string | null
  lastApprovalRequestId: string | null
  lastArtifactId: string | null
  lastMemoryId: string | null
  lastWorkflowId: string | null
  authTargetProviderId: string | null
  authTargetLocked: boolean
  focusEntity: string | null
  focusType: 'lead' | 'account' | 'deal' | null
  lastIntent: string | null
  lastSpecialist: string | null
  lineage: OpenGtmSessionLineageState
  leadLane: OpenGtmLeadLaneState
  accountLane: OpenGtmAccountLaneState
  dealLane: OpenGtmDealLaneState
  lastActionCards: OpenGtmSessionActionCard[]
  advance: OpenGtmInteractiveAdvanceState
  advanceHistory: OpenGtmInteractiveAdvanceHistoryEntry[]
  activeScreen: OpenGtmInteractiveScreen
  selection: OpenGtmInteractiveSelectionState
  interactionMode: OpenGtmInteractiveInteractionMode
  composeBuffer: string
  composeCursor: number
  composeHistory: string[]
  composeHistoryIndex: number | null
  uiOverlay: 'none' | 'help' | 'palette'
  uiOverlayIndex: number
  flash: OpenGtmInteractiveFlash | null
  eventFeed: OpenGtmInteractiveEvent[]
}

export interface OpenGtmInteractiveTranscriptEntry {
  role?: string
  content?: string
  createdAt?: string
}

interface OpenGtmInteractiveTranscriptReadResult {
  session: OpenGtmInteractiveSession | null
  entries: OpenGtmInteractiveTranscriptEntry[]
  error?: string
}

interface OpenGtmInteractiveTranscriptCompactionReadResult extends OpenGtmInteractiveTranscriptReadResult {
  raw: string
}

export interface OpenGtmInteractiveAdvanceState {
  runId: string | null
  status: 'idle' | 'running' | 'waiting-for-approval' | 'completed' | 'stopped'
  startedAt: string | null
  updatedAt: string | null
  stepsRequested: number
  stepsExecuted: number
  stopReason: string | null
  lastCardTitle: string | null
  lastCommand: string | null
}

export interface OpenGtmInteractiveAdvanceHistoryEntry {
  runId: string
  mode: 'advance' | 'resume'
  startedAt: string | null
  finishedAt: string
  stepsRequested: number
  stepsExecuted: number
  stopReason: string
  finalStatus: OpenGtmInteractiveAdvanceState['status']
  lastCardTitle: string | null
  lastCommand: string | null
}

export interface OpenGtmInteractiveSelectionState {
  actionCardIndex: number
  approvalIndex: number
  actionCardSignature: string | null
  approvalId: string | null
  focusedPane: 'actions' | 'approvals'
}

export type OpenGtmInteractiveScreen =
  | 'home'
  | 'auth'
  | 'run'
  | 'approvals'
  | 'inspect'

export type OpenGtmInteractiveInteractionMode =
  | 'compose'
  | 'navigate-actions'
  | 'navigate-approvals'
  | 'blocked'

export interface OpenGtmInteractiveIo {
  stdin: NodeJS.ReadableStream & { isTTY?: boolean }
  stdout: NodeJS.WritableStream & { isTTY?: boolean }
}

interface OpenGtmInteractiveRuntimeLineageEntry {
  entity: string
  checkpointId: string
  sourceArtifacts: number
}

interface OpenGtmInteractiveFlash {
  kind: 'info' | 'success' | 'warn'
  text: string
}

interface OpenGtmInteractiveEvent {
  kind: OpenGtmInteractiveFlash['kind']
  text: string
  createdAt: string
}

export interface OpenGtmInteractiveRuntimeState {
  pendingApprovals: number
  pendingApprovalSummaries: Array<{
    id: string
    lane: string | null
    target: string | null
    actionSummary: string
  }>
  provider: string
  model: string
  providerConfigured: boolean
  sandboxProfile: string
  sandboxRuntime: string
  sandboxAvailable: boolean
  latestTrace: { id: string; workflowId: string | null; status: string } | null
  leadPhase: string | null
  leadRelationshipState: string | null
  leadDoNotSend: string | null
  leadRecommendedApproach: string | null
  accountPhase: string | null
  dealPhase: string | null
  lineage: {
    lead: OpenGtmInteractiveRuntimeLineageEntry | null
    account: OpenGtmInteractiveRuntimeLineageEntry | null
    deal: OpenGtmInteractiveRuntimeLineageEntry | null
  } | null
  lastWorkflowId: string | null
  recommendedActions: string[]
  actionCards: OpenGtmSessionActionCard[]
  nextHint: string | null
  nextLabel: string | null
  auth: {
    shellProviderId: string
    shellProviderLabel: string
    providerId: string
    providerLabel: string
    authMode: string
    backend: string | null
    configured: boolean
    maskedValue: string | null
    accountId: string | null
    pendingPkce: OpenGtmPendingPkceRecord | null
    providers: Array<{
      id: string
      label: string
      authMode: string
      configured: boolean
      current: boolean
    }>
    models: Array<{
      id: string
      current: boolean
    }>
  }
}

export interface OpenGtmInteractiveUiActionItem {
  id: string
  title: string
  detail: string
  commandArgs?: string[]
  commandLine: string
  card?: OpenGtmSessionActionCard
  openUrl?: string | null
  disabled?: boolean
}

interface OpenGtmInteractiveFocusTarget {
  index: number
  total: number
}

type OpenGtmInteractiveFocusedPane = 'actions' | 'approvals'

interface OpenGtmInteractiveTerminalKeypress {
  name?: string
  sequence?: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
}

interface OpenGtmInteractiveTerminalDispatch {
  line: string
  recordTranscript: boolean
}

interface OpenGtmInteractiveTerminalUpdate {
  session: OpenGtmInteractiveSession
  dispatch?: OpenGtmInteractiveTerminalDispatch
}

interface OpenGtmInteractiveComposePatch {
  composeBuffer?: string
  composeCursor?: number
  composeHistory?: string[]
  composeHistoryIndex?: number | null
  activeScreen?: OpenGtmInteractiveScreen
  interactionMode?: OpenGtmInteractiveInteractionMode
  uiOverlay?: OpenGtmInteractiveSession['uiOverlay']
  uiOverlayIndex?: number
  flash?: OpenGtmInteractiveSession['flash']
}

interface OpenGtmInteractiveFocusedActionTarget extends OpenGtmInteractiveFocusTarget {
  action: OpenGtmInteractiveUiActionItem | null
}

interface OpenGtmInteractiveFocusedApprovalTarget extends OpenGtmInteractiveFocusTarget {
  approval: OpenGtmInteractiveRuntimeState['pendingApprovalSummaries'][number] | null
}

const SESSION_META_FILE = 'current-session.json'
const INTERACTIVE_EXAMPLES = [
  'Research Acme',
  'Draft outreach for Pat Example',
  'Check account health for Acme',
  'Scan deal risk for Acme',
  'Show approvals',
  'Why was this blocked?',
  'What do you know about this account?',
  "What's pending?"
] as const
const DIRECT_SLASH_COMMANDS: Record<string, string[]> = {
  h: ['help'],
  '?': ['help'],
  auth: ['auth', 'status'],
  provider: ['provider', 'list'],
  model: ['models', 'list'],
  models: ['models', 'list'],
  now: ['session', 'runtime'],
  runtime: ['session', 'runtime'],
  approvals: ['approvals', 'list'],
  tools: ['tool', 'list'],
  primitives: ['tool', 'list'],
  traces: ['traces', 'list'],
  memory: ['memory', 'list'],
  artifacts: ['artifacts', 'list'],
  next: ['session', 'runtime'],
  cards: ['session', 'cards'],
  progress: ['session', 'progress'],
  skills: ['skill', 'list'],
  agents: ['agent', 'list'],
  sandbox: ['sandbox', 'status'],
  status: ['status'],
  session: ['session', 'status'],
  history: ['session', 'transcript'],
  transcript: ['session', 'transcript'],
  new: ['session', 'new'],
  slash: ['help'],
  commands: ['help']
}

export function shouldLaunchInteractiveHarness(args: string[], io: OpenGtmInteractiveIo) {
  const parsed = parseCliArgs(args)
  if (!io.stdin.isTTY || !io.stdout.isTTY) return false
  return args.length === 0 || (parsed.command === 'session' && (parsed.subcommand === '' || parsed.subcommand === 'start'))
}

export async function runInteractiveHarnessSession(args: {
  cwd: string
  io?: OpenGtmInteractiveIo
}) {
  const io = args.io || {
    stdin: process.stdin as OpenGtmInteractiveIo['stdin'],
    stdout: process.stdout as OpenGtmInteractiveIo['stdout']
  }
  const router = (await import('./router.js')).createCliRouter({ cwd: args.cwd })
  let session = await loadOrCreateInteractiveSession(args.cwd)
  let lastOutput = ''
  const useTui = Boolean(io.stdin.isTTY && io.stdout.isTTY && !isTuiDisabled())
  session = await saveInteractiveSession(args.cwd, syncInteractiveSessionForUi(session))

  if (useTui) {
    const { runInteractiveInkHarnessLoop } = await import('./interactive-ink.js')
    await runInteractiveInkHarnessLoop({
      cwd: args.cwd,
      io,
      router,
      session,
      lastOutput
    })
    return
  }

  const readline = await import('node:readline/promises')
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stdout,
    terminal: true
  })

  io.stdout.write(await renderInteractiveWelcome(args.cwd, session))

  try {
    while (true) {
      const line = await rl.question(await buildInteractivePromptLabel(args.cwd, session))
      const result = await handleInteractiveInput({
        cwd: args.cwd,
        line,
        session,
        router
      })
      session = await saveInteractiveSession(args.cwd, syncInteractiveSessionForUi(result.session))
      if (result.output) {
        io.stdout.write(`${result.output}\n`)
      }
      if (result.exit) break
    }
  } finally {
    rl.close()
  }
}

export function syncInteractiveSessionForUi(session: OpenGtmInteractiveSession): OpenGtmInteractiveSession {
  const waitingForApproval = session.advance.status === 'waiting-for-approval'
  return {
    ...session,
    activeScreen: waitingForApproval ? 'approvals' : session.activeScreen,
    selection: waitingForApproval
      ? {
          ...session.selection,
          focusedPane: 'approvals'
        }
      : session.selection,
    composeBuffer: '',
    composeCursor: 0,
    composeHistoryIndex: null,
    interactionMode: deriveInteractiveInteractionMode(session),
    uiOverlay: 'none',
    uiOverlayIndex: 0,
    flash: null
  }
}

function deriveInteractiveInteractionMode(session: OpenGtmInteractiveSession): OpenGtmInteractiveInteractionMode {
  if (session.advance.status === 'waiting-for-approval') {
    return 'blocked'
  }
  return 'compose'
}

export function applyInteractiveTerminalKey(
  session: OpenGtmInteractiveSession,
  key: OpenGtmInteractiveTerminalKeypress
): OpenGtmInteractiveTerminalUpdate {
  const normalizedKey = normalizeInteractiveTerminalKeypress(key)
  const baseSession = clearInteractiveFlash(session)
  if (normalizedKey.ctrl && normalizedKey.name === 'k') {
    return {
      session: sessionWithInteractiveInput(baseSession, {
        uiOverlay: baseSession.uiOverlay === 'palette' ? 'none' : 'palette',
        uiOverlayIndex: 0,
        flash: {
          kind: 'info',
          text: baseSession.uiOverlay === 'palette' ? 'Command palette closed.' : 'Command palette opened.'
        }
      })
    }
  }
  if (normalizedKey.sequence === '?') {
    return {
      session: sessionWithInteractiveInput(baseSession, {
        uiOverlay: baseSession.uiOverlay === 'help' ? 'none' : 'help',
        uiOverlayIndex: 0,
        flash: {
          kind: 'info',
          text: baseSession.uiOverlay === 'help' ? 'Help overlay closed.' : 'Help overlay opened.'
        }
      })
    }
  }

  if (normalizedKey.ctrl && (normalizedKey.name === 'c' || normalizedKey.name === 'd')) {
    return {
      session: sessionWithInteractiveInput(baseSession, {
        composeBuffer: '',
        interactionMode: deriveNavigateModeFromFocusedPane(baseSession.selection.focusedPane, baseSession),
        flash: {
          kind: 'warn',
          text: 'Closing interactive harness session.'
        }
      }),
      dispatch: { line: '/exit', recordTranscript: false }
    }
  }

  if (normalizedKey.name === 'escape') {
    return {
      session: sessionWithInteractiveInput(baseSession, {
        composeBuffer: '',
        composeCursor: 0,
        composeHistoryIndex: null,
        interactionMode: deriveNavigateModeFromFocusedPane(baseSession.selection.focusedPane, baseSession),
        uiOverlay: 'none',
        uiOverlayIndex: 0,
        flash: {
          kind: 'info',
          text: 'Overlay closed and focus reset.'
        }
      })
    }
  }

  if (baseSession.uiOverlay === 'palette') {
    return applyInteractivePaletteKey(baseSession, normalizedKey)
  }

  if (normalizedKey.ctrl && normalizedKey.name === 'l') {
    return {
      session: sessionWithInteractiveInput(baseSession, {
        uiOverlay: 'none',
        uiOverlayIndex: 0,
        flash: {
          kind: 'info',
          text: 'Screen cleared. Session context preserved.'
        }
      }),
      dispatch: { line: '/clear', recordTranscript: false }
    }
  }

  if (isInteractivePaneSwitchKey(normalizedKey)) {
    const nextMode = deriveNavigateModeFromPaneDelta(baseSession.selection.focusedPane, normalizedKey)
    return {
      session: sessionWithInteractiveInput(baseSession, {
        composeHistoryIndex: null,
        interactionMode: nextMode,
        flash: {
          kind: 'info',
          text: nextMode === 'navigate-approvals' ? 'Approvals pane focused.' : 'Actions pane focused.'
        }
      }),
      dispatch: {
        line: normalizedKey.shift ? 'shift-tab' : normalizedKey.name === 'left' ? 'h' : normalizedKey.name === 'right' ? 'l' : 'tab',
        recordTranscript: false
      }
    }
  }

  if (baseSession.interactionMode === 'compose') {
    return applyInteractiveComposeKey(baseSession, normalizedKey)
  }

  return applyInteractiveNavigationKey(baseSession, normalizedKey)
}

function applyInteractiveComposeKey(
  session: OpenGtmInteractiveSession,
  key: OpenGtmInteractiveTerminalKeypress
): OpenGtmInteractiveTerminalUpdate {
  if (key.ctrl && key.name === 'u') {
    return {
      session: sessionWithInteractiveInput(session, {
        composeBuffer: '',
        composeCursor: 0,
        composeHistoryIndex: null
      })
    }
  }

  if (key.ctrl && key.name === 'w') {
    return {
      session: applyInteractiveComposeDeletePreviousWord(session)
    }
  }

  if (key.ctrl && key.name === 'a') {
    return {
      session: sessionWithInteractiveInput(session, {
        composeCursor: 0,
        composeHistoryIndex: null
      })
    }
  }

  if (key.ctrl && key.name === 'e') {
    return {
      session: sessionWithInteractiveInput(session, {
        composeCursor: session.composeBuffer.length,
        composeHistoryIndex: null
      })
    }
  }

  if (key.name === 'return' || key.name === 'enter') {
    const bufferedLine = session.composeBuffer.trim()
    if (bufferedLine) {
      return {
        session: sessionWithInteractiveInput(session, {
          composeBuffer: '',
          composeCursor: 0,
          composeHistoryIndex: null
        }),
        dispatch: { line: bufferedLine, recordTranscript: true }
      }
    }
    return {
      session,
      dispatch: { line: 'enter', recordTranscript: false }
    }
  }

  if (key.name === 'backspace') {
    return {
      session: applyInteractiveComposeEditorMutation(session, 'backspace')
    }
  }

  if (key.name === 'delete') {
    return {
      session: applyInteractiveComposeEditorMutation(session, 'delete')
    }
  }

  if (key.name === 'left') {
    return {
      session: sessionWithInteractiveInput(session, {
        composeCursor: Math.max(0, session.composeCursor - 1),
        composeHistoryIndex: null
      })
    }
  }

  if (key.name === 'right') {
    return {
      session: sessionWithInteractiveInput(session, {
        composeCursor: Math.min(session.composeBuffer.length, session.composeCursor + 1),
        composeHistoryIndex: null
      })
    }
  }

  if (key.name === 'home') {
    return {
      session: sessionWithInteractiveInput(session, {
        composeCursor: 0,
        composeHistoryIndex: null
      })
    }
  }

  if (key.name === 'end') {
    return {
      session: sessionWithInteractiveInput(session, {
        composeCursor: session.composeBuffer.length,
        composeHistoryIndex: null
      })
    }
  }

  if (key.name === 'up' || key.name === 'down') {
    return {
      session: applyInteractiveComposeHistoryNavigation(session, key.name === 'up' ? 1 : -1)
    }
  }

  if (isInteractivePrintableKey(key)) {
    return {
      session: applyInteractiveComposeInsert(session, key.sequence || '')
    }
  }

  return { session }
}

function applyInteractiveNavigationKey(
  session: OpenGtmInteractiveSession,
  key: OpenGtmInteractiveTerminalKeypress
): OpenGtmInteractiveTerminalUpdate {
  if (key.sequence === '/' || key.sequence === ':') {
    return {
      session: sessionWithInteractiveInput(session, {
        interactionMode: 'compose',
        composeBuffer: key.sequence,
        composeCursor: 1,
        composeHistoryIndex: null
      })
    }
  }

  if (key.name === 'return' || key.name === 'enter') {
    return { session, dispatch: { line: 'enter', recordTranscript: false } }
  }

  if (key.name === 'backspace' || key.name === 'delete') {
    return {
      session: sessionWithInteractiveInput(session, {
        interactionMode: 'compose',
        composeBuffer: '',
        composeCursor: 0,
        composeHistoryIndex: null
      })
    }
  }

  if (isInteractiveMovementKey(key)) {
    return {
      session,
      dispatch: { line: mapInteractiveMovementKeyToCommand(key), recordTranscript: false }
    }
  }

  const aliasCommand = mapInteractiveAliasKeyToCommand(key)
  if (aliasCommand) {
    return {
      session,
      dispatch: { line: aliasCommand, recordTranscript: false }
    }
  }

  if (isInteractivePrintableKey(key)) {
    return {
      session: sessionWithInteractiveInput(session, {
        interactionMode: 'compose',
        composeBuffer: key.sequence || '',
        composeCursor: (key.sequence || '').length,
        composeHistoryIndex: null
      })
    }
  }

  return { session }
}

function applyInteractivePaletteKey(
  session: OpenGtmInteractiveSession,
  key: OpenGtmInteractiveTerminalKeypress
): OpenGtmInteractiveTerminalUpdate {
  const paletteItems = buildInteractiveCommandPaletteItems(session)
  if (paletteItems.length === 0) {
    return {
      session: sessionWithInteractiveInput(session, {
        uiOverlay: 'none',
        uiOverlayIndex: 0
      })
    }
  }

  if (key.name === 'return' || key.name === 'enter') {
    const item = paletteItems[Math.max(0, Math.min(session.uiOverlayIndex, paletteItems.length - 1))]
    return {
      session: sessionWithInteractiveInput(session, {
        uiOverlay: 'none',
        uiOverlayIndex: 0
      }),
      dispatch: item ? { line: item.commandLine, recordTranscript: false } : undefined
    }
  }

  if (key.name === 'up' || key.name === 'down' || key.sequence === 'j' || key.sequence === 'k') {
    const delta = key.name === 'up' || key.sequence === 'k' ? -1 : 1
    const nextIndex = (Math.max(0, session.uiOverlayIndex) + delta + paletteItems.length) % paletteItems.length
    return {
      session: sessionWithInteractiveInput(session, {
        uiOverlayIndex: nextIndex
      })
    }
  }

  if (isInteractivePrintableKey(key)) {
    return {
      session: sessionWithInteractiveInput(session, {
        uiOverlay: 'none',
        uiOverlayIndex: 0,
        interactionMode: 'compose',
        composeBuffer: key.sequence || '',
        composeCursor: (key.sequence || '').length,
        composeHistoryIndex: null
      })
    }
  }

  return { session }
}

function sessionWithInteractiveInput(
  session: OpenGtmInteractiveSession,
  patch: OpenGtmInteractiveComposePatch
): OpenGtmInteractiveSession {
  const composeBuffer = patch.composeBuffer ?? session.composeBuffer
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    activeScreen: patch.activeScreen ?? session.activeScreen,
    composeBuffer,
    composeCursor: clampInteractiveComposeCursor(
      patch.composeCursor ?? session.composeCursor,
      composeBuffer
    ),
    composeHistory: patch.composeHistory ?? session.composeHistory,
    composeHistoryIndex:
      patch.composeHistoryIndex === undefined ? session.composeHistoryIndex : patch.composeHistoryIndex,
    interactionMode: patch.interactionMode ?? session.interactionMode,
    uiOverlay: patch.uiOverlay ?? session.uiOverlay,
    uiOverlayIndex:
      patch.uiOverlayIndex === undefined ? session.uiOverlayIndex : patch.uiOverlayIndex,
    flash: patch.flash === undefined ? session.flash : patch.flash,
    eventFeed:
      patch.flash && patch.flash.text
        ? appendInteractiveEventFeed(session.eventFeed, patch.flash)
        : session.eventFeed
  }
}

function normalizeInteractiveTerminalKeypress(
  key: OpenGtmInteractiveTerminalKeypress
): OpenGtmInteractiveTerminalKeypress {
  return {
    ...key,
    name: key.name || '',
    sequence: key.sequence || '',
    ctrl: Boolean(key.ctrl),
    meta: Boolean(key.meta),
    shift: Boolean(key.shift)
  }
}

function isInteractivePaneSwitchKey(key: OpenGtmInteractiveTerminalKeypress) {
  return key.name === 'tab'
}

function deriveNavigateModeFromPaneDelta(
  focusedPane: OpenGtmInteractiveFocusedPane,
  key: OpenGtmInteractiveTerminalKeypress
): OpenGtmInteractiveInteractionMode {
  if (key.shift) {
    return focusedPane === 'actions' ? 'navigate-approvals' : 'navigate-actions'
  }
  return focusedPane === 'actions' ? 'navigate-approvals' : 'navigate-actions'
}

function deriveNavigateModeFromFocusedPane(
  focusedPane: OpenGtmInteractiveFocusedPane,
  session: OpenGtmInteractiveSession
): OpenGtmInteractiveInteractionMode {
  if (session.advance.status === 'waiting-for-approval' && focusedPane === 'approvals') {
    return 'blocked'
  }
  return focusedPane === 'approvals' ? 'navigate-approvals' : 'navigate-actions'
}

function isInteractiveMovementKey(key: OpenGtmInteractiveTerminalKeypress) {
  return ['up', 'down', 'left', 'right'].includes(key.name || '')
    || ['h', 'j', 'k', 'l', '[', ']', '{', '}'].includes(key.sequence || '')
}

function mapInteractiveMovementKeyToCommand(key: OpenGtmInteractiveTerminalKeypress) {
  if (key.name === 'up') return 'k'
  if (key.name === 'down') return 'j'
  if (key.name === 'left') return 'h'
  if (key.name === 'right') return 'l'
  return key.sequence || ''
}

function mapInteractiveAliasKeyToCommand(key: OpenGtmInteractiveTerminalKeypress) {
  const sequence = key.sequence || ''
  if (/^[1-9]$/.test(sequence)) return sequence
  if (['g', 'r', 'y', 'n', '!', '+', '-'].includes(sequence)) return sequence
  return null
}

function isInteractivePrintableKey(key: OpenGtmInteractiveTerminalKeypress) {
  return Boolean(key.sequence)
    && (key.sequence?.length || 0) === 1
    && !key.ctrl
    && !key.meta
    && key.name !== 'return'
    && key.name !== 'backspace'
    && key.name !== 'delete'
    && key.name !== 'escape'
    && key.name !== 'tab'
}

function applyInteractiveComposeInsert(session: OpenGtmInteractiveSession, value: string) {
  const beforeCursor = session.composeBuffer.slice(0, session.composeCursor)
  const afterCursor = session.composeBuffer.slice(session.composeCursor)
  const composeBuffer = `${beforeCursor}${value}${afterCursor}`
  return sessionWithInteractiveInput(session, {
    composeBuffer,
    composeCursor: beforeCursor.length + value.length,
    composeHistoryIndex: null
  })
}

function clearInteractiveFlash(session: OpenGtmInteractiveSession): OpenGtmInteractiveSession {
  if (!session.flash) return session
  return {
    ...session,
    flash: null
  }
}

function appendInteractiveEventFeed(
  current: OpenGtmInteractiveEvent[] | null | undefined,
  flash: OpenGtmInteractiveFlash
) {
  return [
    {
      kind: flash.kind,
      text: flash.text,
      createdAt: new Date().toISOString()
    },
    ...(Array.isArray(current) ? current : [])
  ].slice(0, 8)
}

export function applyInteractiveFlashFromOutput(
  session: OpenGtmInteractiveSession,
  output: string
): OpenGtmInteractiveSession {
  const trimmed = String(output || '').trim()
  if (!trimmed) return session
  const firstLine = trimmed.split('\n')[0] || trimmed
  const flash =
    trimmed.includes('Interactive harness error:')
      ? { kind: 'warn' as const, text: firstLine.replace(/^Interactive harness error:\s*/, '') || 'Interactive harness error.' }
      : trimmed.includes('Approval resolution')
        ? { kind: 'success' as const, text: 'Approval resolved and runtime updated.' }
        : trimmed.includes('Runtime resume')
          ? { kind: 'success' as const, text: 'Runtime resumed.' }
          : trimmed.includes('Runtime advance')
            ? { kind: 'info' as const, text: 'Runtime advanced.' }
            : trimmed.includes('Runtime follow-through')
              ? { kind: 'info' as const, text: 'Runtime follow-through refreshed.' }
              : trimmed.includes('Interactive harness query')
                ? { kind: 'info' as const, text: 'Runtime summary refreshed.' }
                : { kind: 'info' as const, text: firstLine }
  return sessionWithInteractiveInput(session, {
    flash
  })
}

function applyInteractiveComposeEditorMutation(
  session: OpenGtmInteractiveSession,
  kind: 'backspace' | 'delete'
) {
  if (kind === 'backspace') {
    if (session.composeCursor <= 0) return session
    const composeBuffer = `${session.composeBuffer.slice(0, session.composeCursor - 1)}${session.composeBuffer.slice(session.composeCursor)}`
    return sessionWithInteractiveInput(session, {
      composeBuffer,
      composeCursor: session.composeCursor - 1,
      composeHistoryIndex: null
    })
  }

  if (session.composeCursor >= session.composeBuffer.length) return session
  const composeBuffer = `${session.composeBuffer.slice(0, session.composeCursor)}${session.composeBuffer.slice(session.composeCursor + 1)}`
  return sessionWithInteractiveInput(session, {
    composeBuffer,
    composeCursor: session.composeCursor,
    composeHistoryIndex: null
  })
}

function applyInteractiveComposeDeletePreviousWord(session: OpenGtmInteractiveSession) {
  if (session.composeCursor <= 0) return session
  const beforeCursor = session.composeBuffer.slice(0, session.composeCursor)
  const afterCursor = session.composeBuffer.slice(session.composeCursor)
  const trimmedBefore = beforeCursor.replace(/\s+$/, '')
  const nextStart = trimmedBefore.search(/\S+$/)
  const cutIndex = nextStart >= 0 ? nextStart : 0
  const composeBuffer = `${beforeCursor.slice(0, cutIndex)}${afterCursor}`
  return sessionWithInteractiveInput(session, {
    composeBuffer,
    composeCursor: cutIndex,
    composeHistoryIndex: null
  })
}

function applyInteractiveComposeHistoryNavigation(
  session: OpenGtmInteractiveSession,
  delta: 1 | -1
) {
  if (session.composeHistory.length === 0) return session
  const nextHistoryIndex = computeInteractiveComposeHistoryIndex(session, delta)
  if (nextHistoryIndex === null) {
    return sessionWithInteractiveInput(session, {
      composeBuffer: '',
      composeCursor: 0,
      composeHistoryIndex: null
    })
  }
  const composeBuffer = session.composeHistory[nextHistoryIndex] || ''
  return sessionWithInteractiveInput(session, {
    composeBuffer,
    composeCursor: composeBuffer.length,
    composeHistoryIndex: nextHistoryIndex
  })
}

export function buildInteractiveCommandPaletteItems(session: OpenGtmInteractiveSession) {
  const focusedAction = resolveInteractiveFocusedActionCardFromSession(session)
  const starterItems = buildInteractiveStarterActionItems(session)
  const contextualItems = session.selection.focusedPane === 'approvals'
    ? [
        (session.selection.approvalId || session.lastApprovalRequestId)
          ? {
              label: 'Approve focused gate',
              detail: 'Approve the currently focused approval gate',
              commandLine: '+'
            }
          : null,
        (session.selection.approvalId || session.lastApprovalRequestId)
          ? {
              label: 'Deny focused gate',
              detail: 'Deny the currently focused approval gate',
              commandLine: '-'
            }
          : null,
        session.advance.status === 'waiting-for-approval'
          ? {
              label: 'Approve and continue',
              detail: 'Resolve the current gate and resume the lane',
              commandLine: '/approve continue'
            }
          : null
      ]
    : [
        focusedAction
          ? {
              label: 'Run focused action',
              detail: `Execute ${focusedAction.title}`,
              commandLine: '!'
            }
          : null,
        session.activeScreen === 'run' && !focusedAction
          ? {
              label: starterItems[0]?.title || 'Run manual test',
              detail: starterItems[0]?.detail || 'Open the manual-test workspace starter flow.',
              commandLine: '/do 1'
            }
          : null,
        session.advance.status === 'stopped' || session.advance.stopReason === 'approval-resolved'
          ? {
              label: 'Resume runtime',
              detail: 'Continue the bounded supervisor lane',
              commandLine: '/resume'
            }
          : null
      ]

  const items = [
    ...contextualItems,
    {
      label: 'Show next steps',
      detail: 'Ask the runtime what it recommends next',
      commandLine: '/next'
    },
    {
      label: 'Show cards',
      detail: 'Inspect persisted runtime action cards',
      commandLine: '/cards'
    },
    {
      label: 'Show progress',
      detail: 'Inspect supervisor progress and recent runs',
      commandLine: '/progress'
    },
    {
      label: 'Show transcript',
      detail: 'Inspect recent session history',
      commandLine: '/history'
    },
    {
      label: 'Compact session',
      detail: 'Summarize the transcript while preserving live GTM state',
      commandLine: '/compact'
    },
    {
      label: 'Home workspace',
      detail: 'Open the overview workspace with guided quick starts',
      commandLine: '/home'
    },
    {
      label: 'Auth workspace',
      detail: 'Open the native login and provider workspace',
      commandLine: '/auth'
    },
    {
      label: 'Manual test workspace',
      detail: 'Open the workflow runner and starter actions',
      commandLine: '/test'
    },
    {
      label: 'Approvals workspace',
      detail: 'Open the approval-resolution workspace',
      commandLine: '/approvals'
    },
    {
      label: 'Inspect workspace',
      detail: 'Open traces, transcript, and progress inspection',
      commandLine: '/inspect'
    },
    {
      label: 'Auth status',
      detail: 'Inspect provider authentication and next login action',
      commandLine: '/auth'
    },
    session.activeScreen === 'auth'
      ? {
          label: 'Configure auth target',
          detail: 'Start auth for the current target or switch the target provider first',
          commandLine: '/auth'
        }
      : null,
    session.activeScreen === 'auth'
      ? {
          label: 'Open pending auth browser',
          detail: 'Reopen the pending OAuth authorization URL',
          commandLine: '/auth browser'
        }
      : null,
    {
      label: 'Provider switch',
      detail: 'List providers or run /provider <id> to change the active provider',
      commandLine: '/provider'
    },
    {
      label: 'Model switch',
      detail: 'List models or run /model <id> to switch fast',
      commandLine: '/model'
    },
    {
      label: 'Primitive catalog',
      detail: 'Inspect the paper-aligned harness primitive registry',
      commandLine: '/tools'
    },
    {
      label: 'New session',
      detail: 'Start a fresh interactive session thread',
      commandLine: '/new'
    },
    {
      label: 'Clear screen',
      detail: 'Clear transient terminal output while keeping context',
      commandLine: '/clear'
    },
    ...buildInteractiveLanePaletteItems(session)
  ].filter(Boolean) as Array<{ label: string; detail: string; commandLine: string }>

  return items
}

function buildInteractiveAuthSetupCommand(auth: OpenGtmInteractiveRuntimeState['auth']) {
  return auth.authMode === 'oauth'
    ? `/auth login ${auth.providerId}`
    : `/auth login ${auth.providerId} --api-key-env <ENV_VAR>`
}

function buildInteractiveAuthNextAction(auth: OpenGtmInteractiveRuntimeState['auth']) {
  if (auth.authMode === 'oauth') {
    return auth.pendingPkce
      ? 'next: paste the callback URL or run /auth browser'
      : `next: run ${buildInteractiveAuthSetupCommand(auth)} to start the PKCE login flow`
  }

  return `next: run ${buildInteractiveAuthSetupCommand(auth)} to configure the active shell provider`
}

function buildInteractiveAuthCatalogCommands(auth: OpenGtmInteractiveRuntimeState['auth']) {
  if (auth.authMode === 'oauth') {
    return [
      { command: buildInteractiveAuthSetupCommand(auth), detail: `Start the ${auth.providerLabel} PKCE OAuth flow.` },
      { command: '/auth browser', detail: 'Reopen the pending OAuth browser URL.' },
      { command: '/auth complete <url>', detail: 'Complete OAuth from a pasted redirect URL.' }
    ]
  }

  return [
    { command: buildInteractiveAuthSetupCommand(auth), detail: `Configure ${auth.providerLabel} with an API-key environment variable.` }
  ]
}

function buildInteractiveCommandCatalog(
  session: OpenGtmInteractiveSession,
  runtime: OpenGtmInteractiveRuntimeState
) {
  const paletteItems = buildInteractiveCommandPaletteItems(session)
  const commands = [
    { command: '/help', detail: 'Show the static command guide.' },
    { command: '/commands', detail: 'Show the live command catalog for the current shell state.' },
    { command: '/home', detail: 'Open the overview workspace.' },
    { command: '/auth', detail: 'Open the auth workspace.' },
    { command: '/test', detail: 'Open the manual-test workspace.' },
    { command: '/approvals', detail: 'Open the approval workspace.' },
    { command: '/inspect', detail: 'Open the inspect workspace.' },
    { command: '/next', detail: 'Show runtime-recommended next steps.' },
    { command: '/cards', detail: 'Show persisted runtime action cards.' },
    { command: '/progress', detail: 'Show supervisor progress and recent runs.' },
    { command: '/history', detail: 'Show recent session transcript entries.' },
    { command: '/compact', detail: 'Summarize the transcript while preserving the live GTM state.' },
    { command: '/provider', detail: 'List providers or switch the active provider with /provider <id>.' },
    { command: '/model', detail: 'List models or switch the active model with /model <id>.' },
    { command: '/clear', detail: 'Clear visible output without clearing session state.' },
    { command: '/new', detail: 'Start a fresh session thread.' },
    ...buildInteractiveAuthCatalogCommands(runtime.auth),
    { command: `/auth provider ${runtime.auth.providerId}`, detail: 'Set the auth workspace target provider.' }
  ]

  return [
    'Live command catalog',
    '',
    `screen: ${session.activeScreen}`,
    `shell provider: ${runtime.provider}/${runtime.model}`,
    `auth target: ${runtime.auth.providerLabel} (${runtime.auth.authMode})`,
    '',
    'Core commands:',
    ...commands.map((item) => `  ${item.command.padEnd(28, ' ')} ${item.detail}`),
    '',
    'Current palette actions:',
    ...paletteItems.map((item) => `  ${item.commandLine.padEnd(28, ' ')} ${item.label} — ${item.detail}`)
  ].join('\n')
}

function buildInteractiveLanePaletteItems(session: OpenGtmInteractiveSession) {
  const focus = session.focusEntity || 'Acme'
  const items = []

  if (session.leadLane.phase) {
    items.push({
      label: `Lead lane · ${session.leadLane.phase}`,
      detail: session.leadLane.recommendedApproach || 'Review the current lead motion and continue the lane.',
      commandLine: session.leadLane.phase === 'follow-through' || session.leadLane.phase === 'sequence-ready'
        ? `workflow run sdr.outreach_sequence Outreach sequence for ${focus}`
        : `workflow run sdr.outreach_compose Draft outreach for ${focus}`
    })
  }

  if (session.accountLane.phase) {
    items.push({
      label: `Account lane · ${session.accountLane.phase}`,
      detail: session.accountLane.phase === 'expansion-ready'
        ? 'Advance the healthy account into an expansion signal motion.'
        : 'Continue the current account motion with the next governed workflow.',
      commandLine: session.accountLane.phase === 'expansion-ready'
        ? `workflow run ae.expansion_signal Expansion signal for ${focus}`
        : `workflow run cs.renewal_prep Renewal prep for ${focus}`
    })
  }

  if (session.dealLane.phase) {
    items.push({
      label: `Deal lane · ${session.dealLane.phase}`,
      detail: session.dealLane.phase === 'brief-ready'
        ? 'Turn the deal motion into an AE-ready brief.'
        : 'Review or refresh the current deal-risk lane.',
      commandLine: session.dealLane.phase === 'brief-ready'
        ? `workflow run ae.account_brief Account brief for ${focus}`
        : `workflow run ae.deal_risk_scan Deal risk for ${focus}`
    })
  }

  return items
}

function resolveInteractiveFocusedActionCardFromSession(session: OpenGtmInteractiveSession) {
  if (!session.lastActionCards.length) return null
  const selectedIndex = clampInteractiveSelectionIndex(session.selection.actionCardIndex, session.lastActionCards.length)
  return session.lastActionCards[selectedIndex] || session.lastActionCards[0] || null
}

function computeInteractiveComposeHistoryIndex(
  session: OpenGtmInteractiveSession,
  delta: 1 | -1
) {
  if (delta === 1) {
    if (session.composeHistoryIndex === null) return 0
    return Math.min(session.composeHistory.length - 1, session.composeHistoryIndex + 1)
  }

  if (session.composeHistoryIndex === null) return null
  return session.composeHistoryIndex - 1 >= 0 ? session.composeHistoryIndex - 1 : null
}

function clampInteractiveComposeCursor(cursor: number, composeBuffer: string) {
  if (!Number.isFinite(cursor)) return composeBuffer.length
  return Math.max(0, Math.min(Math.trunc(cursor), composeBuffer.length))
}

function normalizeInteractiveComposeHistory(history: string[] | null | undefined) {
  return Array.isArray(history)
    ? history.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).slice(0, 20)
    : []
}

function normalizeInteractiveEventFeed(events: OpenGtmInteractiveEvent[] | null | undefined) {
  return Array.isArray(events)
    ? events
        .filter((event) => event && typeof event.text === 'string' && event.text.trim().length > 0)
        .slice(0, 8)
        .map((event): OpenGtmInteractiveEvent => ({
          kind: event.kind === 'success' || event.kind === 'warn' ? event.kind : 'info',
          text: String(event.text),
          createdAt: typeof event.createdAt === 'string' ? event.createdAt : new Date().toISOString()
        }))
    : []
}

function normalizeInteractiveComposeHistoryIndex(index: number | null | undefined) {
  if (index === null || index === undefined) return null
  if (!Number.isFinite(index)) return null
  return Math.max(0, Math.trunc(Number(index)))
}

function registerInteractiveComposeHistory(session: OpenGtmInteractiveSession, line: string) {
  const normalizedLine = line.trim()
  if (!normalizedLine) return session
  const existingHistory = normalizeInteractiveComposeHistory(session.composeHistory)
  const composeHistory = [normalizedLine, ...existingHistory.filter((entry) => entry !== normalizedLine)].slice(0, 20)
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    composeHistory,
    composeHistoryIndex: null,
    composeBuffer: '',
    composeCursor: 0
  }
}

export async function handleInteractiveInput(args: {
  cwd: string
  line: string
  session?: OpenGtmInteractiveSession
  router?: ReturnType<typeof import('./router.js').createCliRouter>
  recordTranscript?: boolean
}) {
  const session = args.session || await loadOrCreateInteractiveSession(args.cwd)
  const router = args.router || (await import('./router.js')).createCliRouter({ cwd: args.cwd })
  const line = args.line.trim()
  const suppressTranscript = args.recordTranscript === false || line === '/compact'

  if (!line) {
    return { session, output: '', exit: false }
  }

  if (!suppressTranscript) {
    await appendSessionMessage(args.cwd, session, 'user', line)
  }

  let workingSession = suppressTranscript
    ? session
    : registerInteractiveComposeHistory(session, line)

  if (line === '/exit' || line === '/quit') {
    const closed = await saveInteractiveSession(args.cwd, {
      ...workingSession,
      status: 'closed',
      updatedAt: new Date().toISOString()
    })
    const output = 'Session closed. Re-run `opengtm` to reopen the harness.'
    if (!suppressTranscript) {
      await appendSessionMessage(args.cwd, closed, 'assistant', output)
    }
    return { session: closed, output, exit: true }
  }

  let output = ''
  let updatedSession = workingSession

  try {
      const plan = createSessionPlan(line, updatedSession)
      const action = await resolveInteractiveAction({
        cwd: args.cwd,
        line,
        session: updatedSession
      })
      if (action.kind === 'primitive-loop') {
        output = await handleUnknownInteractiveRequest(args.cwd, line)
        updatedSession = await saveInteractiveSession(args.cwd, updateSessionFromIntent(updatedSession, action.intent))
      } else {
        updatedSession = updateSessionFromIntent(updatedSession, action.intent)
      }
      if (action.kind !== 'primitive-loop' && plan.steps.length > 1) {
        updatedSession = {
          ...updatedSession,
          focusEntity: plan.entity || updatedSession.focusEntity
        }
      }
      const planPrelude = renderSessionPlan(plan)

      if (action.kind === 'primitive-loop') {
        output = output || 'Primitive loop did not find an executable plan.'
      } else if (output) {
        output = renderIntentRoute(action.intent, `${planPrelude}

${output}`)
      } else if (
        plan.steps.length > 1
        && action.kind !== 'show-commands'
        && action.kind !== 'set-screen'
        && action.kind !== 'set-auth-target'
        && action.kind !== 'open-auth-browser'
        && action.kind !== 'complete-auth'
      ) {
        const executed = await executeSessionPlan(plan, updatedSession, router, args.cwd)
        output = renderIntentRoute(action.intent, executed.output)
        updatedSession = executed.session
      } else if (action.kind === 'delegated' && plan.steps[0]?.type === 'unknown') {
        const parsed = parseCliArgs(action.args)
        const result = await executeInteractiveCommandArgs({
          cwd: args.cwd,
          session: updatedSession,
          commandArgs: action.args,
          router
        })
        updatedSession = await saveInteractiveSession(args.cwd, updateSessionFromResult(updatedSession, result))
        let followThrough = ''
        if (shouldAppendRuntimeFollowThroughForParsed(parsed)) {
          updatedSession = await refreshSessionActionCardsFromRuntime(args.cwd, updatedSession)
          followThrough = `\n\nRuntime follow-through\n\n${await renderInteractiveRuntimeFollowThrough(args.cwd, updatedSession)}`
        }
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${renderCliOutput({ parsed, result })}${followThrough}`)
      } else if (action.kind === 'help') {
        output = `${planPrelude}\n\n${renderInteractiveHelp()}`
      } else if (action.kind === 'show-commands') {
        const runtime = await loadInteractiveRuntimeState(args.cwd, updatedSession)
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${buildInteractiveCommandCatalog(updatedSession, runtime)}`)
      } else if (action.kind === 'set-screen') {
        let screenSummary = 'Primary actions now reflect the selected screen.'
        if (action.screen === 'auth') {
          const runtime = await loadInteractiveRuntimeState(args.cwd, updatedSession)
          screenSummary = [
            `login target: ${runtime.auth.providerLabel} (${runtime.auth.authMode})`,
            `shell provider: ${runtime.provider}/${runtime.model}`,
            `status: ${runtime.auth.pendingPkce ? 'pending browser completion' : runtime.auth.configured ? 'configured' : 'missing'}`,
            buildInteractiveAuthNextAction(runtime.auth)
          ].join('\n')
        }
        updatedSession = await saveInteractiveSession(
          args.cwd,
          sessionWithInteractiveInput(updatedSession, {
            activeScreen: action.screen,
            interactionMode: action.screen === 'approvals'
              ? deriveNavigateModeFromFocusedPane('approvals', updatedSession)
              : 'navigate-actions',
            composeBuffer: '',
            composeCursor: 0
          })
        )
        output = renderIntentRoute(
          action.intent,
          `${planPrelude}\n\nOpened ${formatInteractiveScreenLabel(action.screen)} workspace.\n\n${screenSummary}`
        )
      } else if (action.kind === 'set-auth-target') {
        if (!getProviderCatalogEntry(action.providerId)) {
          throw new Error(`Unknown auth target provider: ${action.providerId}`)
        }
      updatedSession = await saveInteractiveSession(
          args.cwd,
          sessionWithInteractiveInput(
            {
              ...updatedSession,
              authTargetProviderId: action.providerId,
              authTargetLocked: true
            },
            {
              activeScreen: 'auth',
              interactionMode: 'navigate-actions',
              composeBuffer: ''
            }
          )
        )
        output = renderIntentRoute(
          action.intent,
          `${planPrelude}\n\nAuth target set to ${action.providerId}. The auth workspace now reflects that provider's login mode.`
        )
      } else if (action.kind === 'clear-screen') {
        updatedSession = await saveInteractiveSession(
          args.cwd,
          sessionWithInteractiveInput(updatedSession, {
            composeBuffer: '',
            composeCursor: 0,
            uiOverlay: 'none',
            uiOverlayIndex: 0,
            flash: {
              kind: 'info',
              text: 'Screen cleared. Session context preserved.'
            }
          })
        )
        output = ' '
      } else if (action.kind === 'open-auth-browser') {
        const executed = await executeInteractiveAuthBrowser({
          cwd: args.cwd,
          session: updatedSession
        })
        updatedSession = executed.session
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${executed.output}`)
      } else if (action.kind === 'complete-auth') {
        const executed = await completeInteractiveOauthLogin({
          cwd: args.cwd,
          session: updatedSession,
          redirectUrl: action.redirectUrl,
          router
        })
        updatedSession = executed.session
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${executed.output}`)
      } else if (action.kind === 'explain-block') {
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${await explainLatestBlock(args.cwd, updatedSession)}`)
      } else if (action.kind === 'query-entity') {
        const result = await queryEntitySummary(args.cwd, updatedSession, action.intent.entity)
        updatedSession = await saveInteractiveSession(
          args.cwd,
          updateSessionCustomerLanes(
            updateSessionLeadLane(
              updateSessionActionCards(updatedSession, result.actionCards || []),
              deriveLeadLaneStateFromSummary(result.summary)
            ),
            result.summary
          )
        )
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${renderCliOutput({ parsed: parseCliArgs(['session', 'summary']), result })}`)
      } else if (action.kind === 'query-pending') {
        const result = await queryPendingSummary(args.cwd)
        updatedSession = await saveInteractiveSession(args.cwd, updateSessionActionCards(updatedSession, result.actionCards || []))
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${renderCliOutput({ parsed: parseCliArgs(['session', 'summary']), result })}`)
      } else if (action.kind === 'query-latest') {
        const result = await queryLatestSummary(args.cwd, updatedSession)
        updatedSession = await saveInteractiveSession(
          args.cwd,
          updateSessionCustomerLanes(
            updateSessionLeadLane(
              updateSessionActionCards(updatedSession, result.actionCards || []),
              deriveLeadLaneStateFromSummary(result.summary)
            ),
            result.summary
          )
        )
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${renderCliOutput({ parsed: parseCliArgs(['session', 'summary']), result })}`)
      } else if (action.kind === 'query-next') {
        const result = await queryNextSummary(args.cwd, updatedSession)
        updatedSession = await saveInteractiveSession(
          args.cwd,
          updateSessionCustomerLanes(
            updateSessionLeadLane(
              updateSessionActionCards(updatedSession, result.actionCards || []),
              deriveLeadLaneStateFromSummary(result.summary)
            ),
            result.summary
          )
        )
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${renderCliOutput({ parsed: parseCliArgs(['session', 'summary']), result })}`)
      } else if (action.kind === 'focus-pane') {
        const focused = await focusInteractivePane({
          cwd: args.cwd,
          session: updatedSession,
          delta: action.delta
        })
        updatedSession = focused.session
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${focused.output}`)
      } else if (action.kind === 'focus-action-card') {
        const focused = await focusInteractiveActionCard({
          cwd: args.cwd,
          session: updatedSession,
          delta: action.delta
        })
        updatedSession = focused.session
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${focused.output}`)
      } else if (action.kind === 'focus-approval-gate') {
        const focused = await focusInteractiveApprovalGate({
          cwd: args.cwd,
          session: updatedSession,
          delta: action.delta
        })
        updatedSession = focused.session
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${focused.output}`)
      } else if (action.kind === 'approve-and-continue') {
        const executed = await executeApprovalAndMaybeResume({
          cwd: args.cwd,
          session: updatedSession,
          router,
          approvalId: action.approvalId
        })
        updatedSession = executed.session
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${executed.output}`)
      } else if (action.kind === 'run-next') {
        const executed = await executeNextActionCard({
          cwd: args.cwd,
          session: updatedSession,
          router,
          index: action.index
        })
        updatedSession = executed.session
        output = renderIntentRoute(action.intent, `${planPrelude}\n\n${executed.output}`)
      } else if (action.kind === 'delegated') {
        const executed = await executeSessionPlan(plan, updatedSession, router, args.cwd)
        output = renderIntentRoute(action.intent, executed.output)
        updatedSession = executed.session
      } else {
        output = await handleUnknownInteractiveRequest(args.cwd, line)
      }
  } catch (error) {
    output = `Interactive harness error: ${String(error)}`
  }

  updatedSession = await applyInteractiveScreenAfterInput({
    cwd: args.cwd,
    session: updatedSession,
    line
  })
  updatedSession = applyInteractiveFlashFromOutput(updatedSession, output)
  if (!suppressTranscript) {
    await appendSessionMessage(args.cwd, updatedSession, 'assistant', output)
  }
  return { session: updatedSession, output, exit: false }
}

function formatInteractiveScreenLabel(screen: OpenGtmInteractiveScreen) {
  switch (screen) {
    case 'auth': return 'Auth'
    case 'run': return 'Manual test'
    case 'approvals': return 'Approvals'
    case 'inspect': return 'Inspect'
    default: return 'Home'
  }
}

async function executeInteractiveAuthBrowser(args: {
  cwd: string
  session: OpenGtmInteractiveSession
}) {
  const runtime = await loadInteractiveRuntimeState(args.cwd, args.session)
  const authUrl = runtime.auth.pendingPkce?.authUrl || null
  if (!authUrl) {
    return {
      session: await saveInteractiveSession(
        args.cwd,
        sessionWithInteractiveInput(args.session, {
          activeScreen: 'auth',
          interactionMode: 'navigate-actions',
          composeBuffer: ''
        })
      ),
      output: [
        'Auth workspace',
        '  no pending browser login exists yet.',
        `  start one with /auth login ${runtime.auth.providerId}`
      ].join('\n')
    }
  }

  await executeHarnessPrimitive({
    cwd: args.cwd,
    name: 'open_browser',
    input: { url: authUrl }
  })

  return {
    session: await saveInteractiveSession(
      args.cwd,
      sessionWithInteractiveInput(args.session, {
        activeScreen: 'auth',
        interactionMode: 'navigate-actions',
        composeBuffer: ''
      })
    ),
    output: [
      'Auth workspace',
      `  opened browser for ${authUrl}`,
      '  complete the login, then paste the callback URL directly into the composer or run /auth complete <redirect-url>.'
    ].join('\n')
  }
}

async function completeInteractiveOauthLogin(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  redirectUrl: string
  router?: ReturnType<typeof import('./router.js').createCliRouter>
}) {
  const runtime = await loadInteractiveRuntimeState(args.cwd, args.session)
  const providerId = runtime.auth.providerId || 'openai'
  const authResult = await executeInteractiveCommandArgs({
    cwd: args.cwd,
    session: args.session,
    commandArgs: ['auth', 'login', providerId, `--oauth-redirect-url=${args.redirectUrl}`],
    router: args.router
  })
  let updatedSession = await saveInteractiveSession(args.cwd, updateSessionFromResult(args.session, authResult))
  const sections = [
    renderCliOutput({
      parsed: parseCliArgs(['auth', 'login', providerId, `--oauth-redirect-url=${args.redirectUrl}`]),
      result: authResult
    })
  ]

  const config = await loadOpenGtmConfig(args.cwd)
  if (authResult?.configured && config?.preferences?.currentProvider !== providerId) {
    const providerResult = await executeInteractiveCommandArgs({
      cwd: args.cwd,
      session: updatedSession,
      commandArgs: ['provider', 'use', providerId],
      router: args.router
    })
    updatedSession = await saveInteractiveSession(args.cwd, updateSessionFromResult(updatedSession, providerResult))
    sections.push(renderCliOutput({
      parsed: parseCliArgs(['provider', 'use', providerId]),
      result: providerResult
    }))
  }

  return {
    session: await saveInteractiveSession(
      args.cwd,
      sessionWithInteractiveInput(updatedSession, {
        activeScreen: 'auth',
        interactionMode: 'navigate-actions',
        composeBuffer: ''
      })
    ),
    output: sections.join('\n\n')
  }
}

async function applyInteractiveScreenAfterInput(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  line: string
}) {
  const normalized = args.line.trim().toLowerCase()
  let nextScreen = args.session.activeScreen

  if (args.session.advance.status === 'waiting-for-approval') {
    nextScreen = 'approvals'
  } else if (normalized.startsWith('/auth') || normalized.startsWith('/provider') || normalized.startsWith('/model')) {
    nextScreen = 'auth'
  } else if (
    normalized.startsWith('/approvals')
    || normalized.startsWith('/approve')
    || normalized.startsWith('/deny')
    || normalized === 'approvals'
    || normalized.includes('show approvals')
    || normalized.includes("what's pending")
    || normalized.includes('what is pending')
  ) {
    nextScreen = 'approvals'
  } else if (
    normalized.startsWith('/inspect')
    || normalized.startsWith('/history')
    || normalized.startsWith('/transcript')
    || normalized.startsWith('/traces')
    || normalized.startsWith('/status')
    || normalized.startsWith('/progress')
  ) {
    nextScreen = 'inspect'
  } else if (normalized.startsWith('/test') || normalized.startsWith('/run')) {
    nextScreen = 'run'
  } else if (normalized.startsWith('/home')) {
    nextScreen = 'home'
  } else if (
    normalized.startsWith('/next')
    || normalized.startsWith('/cards')
    || normalized.startsWith('/do')
    || normalized.startsWith('/resume')
    || normalized.startsWith('/continue')
    || normalized.startsWith('research ')
    || normalized.startsWith('draft ')
    || normalized.startsWith('check account health')
    || normalized.startsWith('scan deal risk')
    || normalized.includes('what should i do next')
    || normalized.includes('what next')
    || looksLikeInteractiveOauthRedirect(args.line)
  ) {
    nextScreen = normalized.startsWith('/auth') || looksLikeInteractiveOauthRedirect(args.line) ? 'auth' : 'run'
  }

  return saveInteractiveSession(
    args.cwd,
    sessionWithInteractiveInput(args.session, {
      activeScreen: nextScreen
    })
  )
}

export async function executePersistedSessionActionCard(args: {
  cwd: string
  index?: number
  router?: ReturnType<typeof import('./router.js').createCliRouter>
}): Promise<any> {
  let session = await readInteractiveSession(args.cwd)
  if (!session) {
    return {
      kind: 'session-action',
      executed: false,
      slot: (args.index ?? 0) + 1,
      output: 'No active interactive session exists yet. Run `opengtm` or `opengtm session new` first.',
      nextAction: 'Start or reopen an interactive harness session before running action cards.'
    }
  }

  if (session.lastActionCards.length === 0) {
    session = await refreshSessionActionCardsFromRuntime(args.cwd, session)
  }

  const executed = await executeNextActionCard({
    cwd: args.cwd,
    session,
    router: args.router,
    index: args.index ?? 0
  })

  return {
    kind: 'session-action',
    executed: true,
    slot: (args.index ?? 0) + 1,
    session: {
      sessionId: executed.session.sessionId,
      status: executed.session.status,
      focusEntity: executed.session.focusEntity,
      focusType: executed.session.focusType,
      lastWorkflowId: executed.session.lastWorkflowId,
      lastTraceId: executed.session.lastTraceId,
      lastApprovalRequestId: executed.session.lastApprovalRequestId,
      advance: executed.session.advance
    },
    actionCards: executed.session.lastActionCards,
    output: executed.output,
    nextAction: 'Use `opengtm session runtime` or reopen `opengtm` to continue the runtime loop.'
  }
}

export async function executePrimitiveHarnessRequest(cwd: string, input: string) {
  const codingLike = shouldRouteToPrimitiveLoop(input)
  const looped = await runPrimitiveAgentLoop(cwd, input)
  if (looped) {
    return looped
  }

  const interpreted = interpretPrimitiveRequest(input)
  if (interpreted) {
    const result = await executeHarnessPrimitive({
      cwd,
      name: interpreted.name,
      input: interpreted.input
    })
    return [
      'Primitive route',
      `primitive: ${interpreted.name}`,
      '',
      JSON.stringify(result, null, 2)
    ].join('\n')
  }

  const suggestions = searchPrimitiveSuggestions(input).slice(0, 5)
  if (suggestions.length > 0) {
    return [
      codingLike
        ? 'I could not fully plan that coding-style request, but these harness primitives look relevant:'
        : 'I did not recognize that GTM task, but I found relevant harness primitives:',
      ...suggestions.map((primitive) => `- ${primitive.name} (${primitive.category})${primitive.available ? '' : ' [planned]'}: ${primitive.description}`),
      '',
      'Try one of:',
      ...INTERACTIVE_EXAMPLES.map((example) => `- ${example}`),
      '- /tool list',
      '- /tool show read_file',
      '- /help'
    ].join('\n')
  }

  return [
    codingLike
      ? 'I could not yet turn that coding-style request into a primitive plan.'
      : 'I did not recognize that GTM task yet.',
    'Try one of:',
    ...INTERACTIVE_EXAMPLES.map((example) => `- ${example}`),
    '- /tool list',
    '- /help'
  ].join('\n')
}

async function handleUnknownInteractiveRequest(cwd: string, input: string) {
  return executePrimitiveHarnessRequest(cwd, input)
}

function searchPrimitiveSuggestions(input: string) {
  const direct = searchHarnessPrimitives(input)
  if (direct.length > 0) return direct
  const keywords = input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
  const seen = new Set<string>()
  const matches = []
  for (const keyword of keywords) {
    for (const primitive of searchHarnessPrimitives(keyword)) {
      if (seen.has(primitive.name)) continue
      seen.add(primitive.name)
      matches.push(primitive)
    }
  }
  return matches
}

function shouldRouteToPrimitiveLoop(input: string) {
  const normalized = input.trim().toLowerCase()
  if (!normalized) return false
  return [
    'read ',
    'open file',
    'list file',
    'list files',
    'show file',
    'search ',
    'find ',
    'run ',
    'exec ',
    'execute ',
    'rename ',
    'replace ',
    'insert ',
    'inspect the source',
    'inspect the repo',
    'inspect the code',
    'fix ',
    'refactor ',
    'implement ',
    'add a ',
    'update the ',
    'change the '
  ].some((prefix) => normalized.startsWith(prefix))
}

function interpretPrimitiveRequest(input: string): { name: string; input: Record<string, unknown> } | null {
  const trimmed = input.trim()
  const lower = trimmed.toLowerCase()

  const readMatch = trimmed.match(/^(?:read|open|show)\s+file\s+(.+)$/i)
  if (readMatch) {
    return { name: 'read_file', input: { path: readMatch[1].trim() } }
  }

  const listMatch = trimmed.match(/^(?:list|show)\s+files(?:\s+in\s+(.+))?$/i)
  if (listMatch) {
    return { name: 'list_files', input: { path: listMatch[1]?.trim() || '.' } }
  }

  const searchMatch = trimmed.match(/^(?:search|find)\s+(.+?)(?:\s+in\s+(.+))?$/i)
  if (searchMatch && !lower.startsWith('show approvals') && !lower.startsWith('show traces')) {
    return {
      name: 'search',
      input: {
        query: searchMatch[1].trim(),
        path: searchMatch[2]?.trim() || '.'
      }
    }
  }

  const runMatch = trimmed.match(/^(?:run|exec(?:ute)?)\s+(.+)$/i)
  if (runMatch) {
    return { name: 'run_command', input: { command: runMatch[1].trim() } }
  }

  const fetchMatch = trimmed.match(/^(?:fetch|get)\s+url\s+(.+)$/i)
  if (fetchMatch) {
    return { name: 'fetch_url', input: { url: fetchMatch[1].trim() } }
  }

  const browserMatch = trimmed.match(/^(?:open|launch)\s+browser\s+(.+)$/i)
  if (browserMatch) {
    return { name: 'open_browser', input: { url: browserMatch[1].trim() } }
  }

  const toolMatch = trimmed.match(/^tool\s+(.+)$/i)
  if (toolMatch) {
    return { name: 'search_tools', input: { query: toolMatch[1].trim() } }
  }

  return null
}

async function runPrimitiveAgentLoop(cwd: string, input: string): Promise<string | null> {
  const available = searchHarnessPrimitives('')
    .filter((primitive) => primitive.available)
    .map((primitive) => ({
      name: primitive.name,
      category: primitive.category,
      description: primitive.description
    }))

  const observations: string[] = []

  try {
    for (let turn = 0; turn < 6; turn += 1) {
      const generated = await generateWithWorkspaceProvider({
        cwd,
        input: {
          system: [
            'You are a harness primitive planner/executor.',
            'Choose up to 5 primitives for the user request.',
            'After seeing observations, either continue with new steps or finish.',
            'Return strict JSON only with the shape {"done":boolean,"summary":"optional text","steps":[{"name":"primitive_name","input":{...}}]}.',
            `Available primitives: ${JSON.stringify(available)}`,
            observations.length > 0 ? `Observations so far: ${JSON.stringify(observations)}` : 'Observations so far: []'
          ].join('\n'),
          prompt: input,
          temperature: 0,
          maxTokens: 320
        }
      })
      const parsed = JSON.parse(generated.text || '{}') as { done?: boolean; summary?: string; steps?: Array<{ name?: string; input?: Record<string, unknown> }> }
      const steps = Array.isArray(parsed.steps)
        ? parsed.steps
            .filter((step) => typeof step?.name === 'string')
            .map((step) => ({ name: String(step.name), input: step.input || {} }))
            .filter((step) => searchHarnessPrimitives(step.name).some((item) => item.name === step.name && item.available))
            .slice(0, 5)
        : []

      if (parsed.done && steps.length === 0) {
        return [
          'Primitive agent loop',
          parsed.summary || 'Planner marked the task complete.',
          '',
          ...observations
        ].join('\n')
      }

      if (steps.length === 0) {
        return observations.length > 0
          ? ['Primitive agent loop', parsed.summary || 'Planner stopped without more executable steps.', '', ...observations].join('\n')
          : null
      }

      const result = steps.length === 1
        ? await executeHarnessPrimitive({ cwd, name: steps[0].name, input: steps[0].input })
        : await executeHarnessPrimitive({ cwd, name: 'batch_tool', input: { steps } })

      observations.push(`turn ${turn + 1}: ${steps.map((step) => step.name).join(' -> ')} => ${compactPrimitiveResult(result)}`)

      if (parsed.done) {
        return [
          'Primitive agent loop',
          `steps: ${steps.map((step) => step.name).join(' -> ')}`,
          '',
          parsed.summary || '',
          JSON.stringify(result, null, 2)
        ].join('\n')
      }
    }

    if (observations.length > 0) {
      return ['Primitive agent loop', ...observations].join('\n')
    }
    return null
  } catch {
    return null
  }
}

function compactPrimitiveResult(result: unknown) {
  const text = JSON.stringify(result)
  if (text.length <= 220) return text
  return `${text.slice(0, 219)}…`
}

export async function executePersistedApprovalAndContinue(args: {
  cwd: string
  approvalId?: string | null
  router?: ReturnType<typeof import('./router.js').createCliRouter>
}): Promise<any> {
  let session = await readInteractiveSession(args.cwd)
  if (!session) {
    return {
      kind: 'session-action',
      executed: false,
      output: 'No active interactive session exists yet. Run `opengtm` or `opengtm session new` first.',
      nextAction: 'Start or reopen an interactive harness session before approving and continuing the runtime.'
    }
  }

  const executed = await executeApprovalAndMaybeResume({
    cwd: args.cwd,
    session,
    router: args.router,
    approvalId: args.approvalId || null
  })
  session = executed.session

  return {
    kind: 'session-action',
    executed: true,
    session: {
      sessionId: session.sessionId,
      status: session.status,
      focusEntity: session.focusEntity,
      focusType: session.focusType,
      lastWorkflowId: session.lastWorkflowId,
      lastTraceId: session.lastTraceId,
      lastApprovalRequestId: session.lastApprovalRequestId,
      advance: session.advance
    },
    actionCards: session.lastActionCards,
    output: executed.output,
    nextAction: 'Use `opengtm session runtime` to inspect the updated runtime lane or keep working in `opengtm`.'
  }
}

export async function executePersistedSessionAdvance(args: {
  cwd: string
  maxSteps?: number
  resume?: boolean
  router?: ReturnType<typeof import('./router.js').createCliRouter>
}): Promise<any> {
  let session = await readInteractiveSession(args.cwd)
  if (!session) {
    return {
      kind: 'session-action',
      executed: false,
      output: 'No active interactive session exists yet. Run `opengtm` or `opengtm session new` first.',
      nextAction: 'Start or reopen an interactive harness session before advancing the runtime.'
    }
  }

  const resuming = Boolean(args.resume && session.advance.runId)

  if (resuming || session.lastActionCards.length === 0) {
    session = await refreshSessionActionCardsFromRuntime(args.cwd, session)
  }

  const stepBudget = computeAdvanceStepBudget({
    requestedSteps: args.maxSteps,
    currentAdvance: session.advance,
    resuming
  })
  const maxSteps = Math.max(1, Math.min(5, stepBudget))
  const runId = resuming && session.advance.runId ? session.advance.runId : randomUUID()
  const totalStepsRequested = resuming
    ? (typeof args.maxSteps === 'number' && Number.isFinite(args.maxSteps) && args.maxSteps > 0
        ? session.advance.stepsExecuted + maxSteps
        : Math.max(session.advance.stepsRequested, session.advance.stepsExecuted + maxSteps))
    : maxSteps
  session = await saveInteractiveSession(args.cwd, updateSessionAdvanceState(session, {
    runId,
    status: 'running',
    startedAt: resuming ? (session.advance.startedAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stepsRequested: totalStepsRequested,
    stepsExecuted: resuming ? session.advance.stepsExecuted : 0,
    stopReason: null,
    lastCardTitle: resuming ? session.advance.lastCardTitle : null,
    lastCommand: resuming ? session.advance.lastCommand : null
  }))
  const seenSignatures = new Set<string>()
  const outputs: string[] = []
  let stepsExecuted = resuming ? session.advance.stepsExecuted : 0
  let stopReason = 'max-steps'

  for (let index = 0; index < maxSteps; index += 1) {
    const card = session.lastActionCards[0]
    if (!card) {
      stopReason = stepsExecuted > 0 ? 'no-further-action-cards' : 'no-action-cards'
      break
    }

    const signature = card.commandArgs.join('\u0000')
    if (seenSignatures.has(signature)) {
      stopReason = 'repeated-card'
      break
    }
    seenSignatures.add(signature)

    const commandFamily = classifyActionCardForAdvance(card)
    if (commandFamily === 'approval') {
      stopReason = 'approval-gate'
      break
    }
    if (commandFamily !== 'workflow') {
      stopReason = 'non-automatable-card'
      break
    }

    const executed = await executeSingleActionCard({
      cwd: args.cwd,
      session,
      card,
      index: 0,
      router: args.router,
      includeFollowThrough: false
    })
    session = await saveInteractiveSession(args.cwd, updateSessionAdvanceState(executed.session, {
      runId,
      status: 'running',
      startedAt: session.advance.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stepsRequested: totalStepsRequested,
      stepsExecuted: stepsExecuted + 1,
      stopReason: null,
      lastCardTitle: card.title,
      lastCommand: `opengtm ${card.commandArgs.join(' ')}`
    }))
    stepsExecuted += 1
    outputs.push(`Advance step ${stepsExecuted}\n\n${executed.output}`)
  }

  session = await refreshSessionActionCardsFromRuntime(args.cwd, session)
  session = await saveInteractiveSession(args.cwd, updateSessionAdvanceState(session, {
    runId,
    status: mapAdvanceStopReasonToStatus(stopReason),
    startedAt: session.advance.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stepsRequested: totalStepsRequested,
    stepsExecuted,
    stopReason,
    lastCardTitle: session.advance.lastCardTitle,
    lastCommand: session.advance.lastCommand
  }))
  session = await saveInteractiveSession(args.cwd, appendSessionAdvanceHistory(session, {
    runId,
    mode: resuming ? 'resume' : 'advance',
    startedAt: session.advance.startedAt,
    finishedAt: new Date().toISOString(),
    stepsRequested: totalStepsRequested,
    stepsExecuted,
    stopReason,
    finalStatus: session.advance.status,
    lastCardTitle: session.advance.lastCardTitle,
    lastCommand: session.advance.lastCommand
  }))
  outputs.unshift([
    resuming ? 'Runtime resume' : 'Runtime advance',
    `  steps requested: ${totalStepsRequested}`,
    `  steps executed: ${stepsExecuted}`,
    `  stop reason: ${stopReason}`
  ].join('\n'))
  outputs.push(`Runtime follow-through\n\n${await renderInteractiveRuntimeFollowThrough(args.cwd, session)}`)

  return {
    kind: 'session-action',
    executed: stepsExecuted > 0,
    stepsExecuted,
    stopReason,
    session: {
      sessionId: session.sessionId,
      status: session.status,
      focusEntity: session.focusEntity,
      focusType: session.focusType,
      lastWorkflowId: session.lastWorkflowId,
      lastTraceId: session.lastTraceId,
      lastApprovalRequestId: session.lastApprovalRequestId,
      advance: session.advance
    },
    actionCards: session.lastActionCards,
    output: outputs.join('\n\n'),
    nextAction: stopReason === 'approval-gate'
      ? 'Resolve the surfaced approval gate, then run `opengtm session advance --resume` if you want the runtime to keep going.'
      : 'Review the runtime follow-through and continue when ready.'
  }
}

async function executeSessionPlan(
  plan: OpenGtmSessionPlan,
  session: OpenGtmInteractiveSession,
  router: ReturnType<typeof import('./router.js').createCliRouter>,
  cwd: string
) {
  const outputs: string[] = [renderSessionPlan(plan)]
  let updatedSession = session

  if (isLinkedLeadMotionPlan(plan)) {
    const linked = await executeLinkedLeadMotionPlan({
      cwd,
      session: updatedSession,
      plan
    })
    updatedSession = await saveInteractiveSession(cwd, updateSessionFromResult(updatedSession, {
      traceId: linked.ops.traceId,
      approvalRequestId: linked.ops.approvalRequestId,
      artifactId: linked.ops.artifactId,
      memoryId: linked.research.memoryId,
      workflowId: linked.ops.workItem.workflowId,
      lineageUpdate: linked.lineageUpdate
    }))

    outputs.push([
      'Vertical runtime lineage',
      `  lead: ${linked.lead.name} <${linked.lead.email}>`,
      `  bootstrap checkpoint artifact: ${linked.bootstrapCheckpointArtifactId}`,
      `  post-research checkpoint artifact: ${linked.postResearchCheckpointArtifactId}`,
      `  plan artifact: ${linked.planArtifactId}`,
      `  plan artifact path: ${linked.planArtifactPath}`,
      `  shared crm db: ${linked.crmDbFile}`
    ].join('\n'))

    outputs.push([
      'Plan step step-1',
      '  specialist: researcher',
      '  label: Run linked research with shared lead context',
      '  support tier: live',
      '',
      renderCliOutput({ parsed: parseCliArgs(['run', 'research', linked.research.workItem.goal]), result: linked.research })
    ].join('\n'))

    outputs.push([
      'Plan step step-2',
      '  specialist: drafter',
      '  label: Run linked outreach drafting with shared lineage',
      '  support tier: live',
      '',
      renderCliOutput({
        parsed: parseCliArgs(['run', 'ops', linked.ops.workItem.goal]),
        result: linked.ops
      })
    ].join('\n'))

    if (linked.ops.approvalRequestId) {
      outputs.push(`Inline approval available: /approve ${linked.ops.approvalRequestId} or /deny ${linked.ops.approvalRequestId}`)
    }
    updatedSession = await refreshSessionActionCardsFromRuntime(cwd, updatedSession)
    outputs.push(`Runtime follow-through\n\n${await renderInteractiveRuntimeFollowThrough(cwd, updatedSession)}`)

    return {
      session: updatedSession,
      output: outputs.join('\n\n')
    }
  }

  if (isLinkedAccountMotionPlan(plan)) {
    const linked = await executeLinkedAccountMotionPlan({
      cwd,
      session: updatedSession,
      plan
    })
    updatedSession = await saveInteractiveSession(cwd, {
      ...updateSessionFromResult(updatedSession, {
        traceId: linked.followup.traceId,
        artifactId: linked.followupDossier.artifactId,
        memoryId: linked.followupDossier.memoryId,
        workflowId: linked.followup.workItem.workflowId,
        lineageUpdate: linked.lineageUpdate
      }),
      focusType: linked.followup.workItem.workflowId === 'ae.deal_risk_scan' ? 'deal' : 'account'
    })

    outputs.push([
      'Vertical runtime lineage',
      `  account: ${linked.account.name} <${linked.account.domain || 'no-domain'}>`,
      `  bootstrap checkpoint artifact: ${linked.bootstrapCheckpointArtifactId}`,
      `  post-health checkpoint artifact: ${linked.postHealthCheckpointArtifactId}`,
      `  plan artifact: ${linked.planArtifactId}`,
      `  plan artifact path: ${linked.planArtifactPath}`,
      `  shared crm db: ${linked.crmDbFile}`
    ].join('\n'))

    outputs.push([
      'Plan step step-1',
      '  specialist: account-health-analyst',
      '  label: Run linked account health with shared account context',
      '  support tier: live',
      '',
      renderCliOutput({ parsed: parseCliArgs(['run', 'research', linked.health.workItem.goal]), result: linked.health })
    ].join('\n'))

    outputs.push([
      'Plan step step-2',
      `  specialist: ${linked.followup.workItem.workflowId === 'cs.renewal_prep' ? 'account-health-analyst' : 'account-health-analyst'}`,
      '  label: Run linked account follow-up with shared dossier lineage',
      '  support tier: live',
      '',
      renderCliOutput({ parsed: parseCliArgs(['run', 'research', linked.followup.workItem.goal]), result: linked.followup })
    ].join('\n'))
    updatedSession = await refreshSessionActionCardsFromRuntime(cwd, updatedSession)
    outputs.push(`Runtime follow-through\n\n${await renderInteractiveRuntimeFollowThrough(cwd, updatedSession)}`)

    return {
      session: updatedSession,
      output: outputs.join('\n\n')
    }
  }

  const shouldAppendFollowThrough = shouldAppendRuntimeFollowThroughForPlan(plan)
  for (const step of plan.steps) {
    if (step.type === 'help') {
      outputs.push(renderInteractiveHelp())
      continue
    }
    if (step.type === 'query') {
      const queryResult = await executePlanQueryStep(step, updatedSession, cwd)
      outputs.push([
        `Plan step ${step.id}`,
        `  specialist: ${step.intent.specialist}`,
        `  label: ${step.label}`,
        `  support tier: ${step.supportTier}`,
        '',
        queryResult
      ].join('\n'))
      continue
    }
    if (step.type === 'unknown') {
      outputs.push(`Supervisor could not execute ${step.id}: ${step.label}`)
      continue
    }
    if (step.intent.kind === 'run-next') {
      const executed = await executeNextActionCard({
        cwd,
        session: updatedSession,
        router,
        index: 0
      })
      updatedSession = executed.session
      outputs.push([
        `Plan step ${step.id}`,
        `  specialist: ${step.intent.specialist}`,
        `  label: ${step.label}`,
        `  support tier: ${step.supportTier}`,
        '',
        executed.output
      ].join('\n'))
      continue
    }

    const commandArgs = await resolvePlanStepArgs(step, updatedSession, cwd)
    const parsed = parseCliArgs(commandArgs)
    const result = await executeInteractiveCommandArgs({
      cwd,
      session: updatedSession,
      commandArgs,
      router
    })
    updatedSession = await saveInteractiveSession(cwd, updateSessionFromResult(updatedSession, result))

    const rendered = renderCliOutput({ parsed, result })
    outputs.push([
      `Plan step ${step.id}`,
      `  specialist: ${step.intent.specialist}`,
      `  label: ${step.label}`,
      `  support tier: ${step.supportTier}`,
      '',
      rendered
    ].join('\n'))

    const nextHint = deriveInteractiveNextHint(result)
    if (nextHint) {
      outputs.push(nextHint)
    }
  }

  if (shouldAppendFollowThrough) {
    updatedSession = await refreshSessionActionCardsFromRuntime(cwd, updatedSession)
    outputs.push(`Runtime follow-through\n\n${await renderInteractiveRuntimeFollowThrough(cwd, updatedSession)}`)
  }

  return {
    session: updatedSession,
    output: outputs.join('\n\n')
  }
}

async function executeInteractiveCommandArgs(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  commandArgs: string[]
  router?: ReturnType<typeof import('./router.js').createCliRouter>
}): Promise<any> {
  const parsed = parseCliArgs(args.commandArgs)
  if (parsed.command !== 'workflow' || parsed.subcommand !== 'run') {
    const router = args.router || (await import('./router.js')).createCliRouter({ cwd: args.cwd })
    return router(args.commandArgs)
  }

  const workflowId = args.commandArgs[2]
  if (!workflowId) {
    throw new Error('No workflow id available for interactive command execution.')
  }

  const goal = args.commandArgs[3]
  const { config, daemon } = await loadSessionRuntime(args.cwd)
  if (!config) {
    throw new Error('No workspace config found. Run "opengtm init" before interactive GTM orchestration.')
  }

  const { handleWorkflowRun } = await import('./handlers/workflows.js')
  return handleWorkflowRun({
    daemon,
    cwd: args.cwd,
    workflowId,
    goal,
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    sessionLineage: args.session.lineage
  })
}

async function executeSingleActionCard(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  card: OpenGtmSessionActionCard
  index: number
  router?: ReturnType<typeof import('./router.js').createCliRouter>
  includeFollowThrough?: boolean
}): Promise<{ session: OpenGtmInteractiveSession; output: string }> {
  const result = await executeInteractiveCommandArgs({
    cwd: args.cwd,
    session: args.session,
    commandArgs: args.card.commandArgs,
    router: args.router
  })
  let updatedSession = await saveInteractiveSession(args.cwd, updateSessionFromResult(args.session, result))
  updatedSession = await refreshSessionActionCardsFromRuntime(args.cwd, updatedSession)

  const sections = [
    renderRuntimeActionCard(args.card, args.index),
    renderCliOutput({ parsed: parseCliArgs(args.card.commandArgs), result })
  ]
  if (args.includeFollowThrough !== false) {
    sections.push(`Runtime follow-through\n\n${await renderInteractiveRuntimeFollowThrough(args.cwd, updatedSession)}`)
  }

  return {
    session: updatedSession,
    output: sections.join('\n\n')
  }
}

async function executeApprovalAndMaybeResume(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  router?: ReturnType<typeof import('./router.js').createCliRouter>
  approvalId: string | null
}) {
  const approvalId = args.approvalId || await findLatestApprovalRequestId(args.cwd, args.session)
  if (!approvalId) {
    throw new Error('No approval id available to approve.')
  }

  const approvalResult = await executeInteractiveCommandArgs({
    cwd: args.cwd,
    session: args.session,
    commandArgs: ['approvals', 'approve', approvalId],
    router: args.router
  })
  let updatedSession = await saveInteractiveSession(args.cwd, updateSessionFromResult(args.session, approvalResult))

  const sections = [
    renderCliOutput({
      parsed: parseCliArgs(['approvals', 'approve', approvalId]),
      result: approvalResult
    })
  ]

  if (updatedSession.advance.status === 'waiting-for-approval') {
    const resumed = await executePersistedSessionAdvance({
      cwd: args.cwd,
      maxSteps: updatedSession.advance.stepsRequested > updatedSession.advance.stepsExecuted
        ? updatedSession.advance.stepsRequested - updatedSession.advance.stepsExecuted
        : 1,
      resume: true,
      router: args.router
    })
    updatedSession = await readInteractiveSession(args.cwd) || updatedSession
    sections.push(resumed.output)
  } else {
    updatedSession = await refreshSessionActionCardsFromRuntime(args.cwd, updatedSession)
    sections.push(`Runtime follow-through\n\n${await renderInteractiveRuntimeFollowThrough(args.cwd, updatedSession)}`)
  }

  return {
    session: updatedSession,
    output: sections.join('\n\n')
  }
}

async function executeNextActionCard(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  router?: ReturnType<typeof import('./router.js').createCliRouter>
  index: number
}): Promise<{ session: OpenGtmInteractiveSession; output: string }> {
  const runtime = await loadInteractiveRuntimeState(args.cwd, args.session)
  const actionItems = buildInteractiveScreenActionItems(args.session, runtime)
  const targetIndex = Number.isFinite(args.index) ? args.index : 0
  const action = actionItems[targetIndex]

  if (!action) {
    return {
      session: args.session,
      output: [
        'Screen action',
        '  no executable action is available for the current workspace.',
        '',
        `Current screen: ${args.session.activeScreen}`
      ].join('\n')
    }
  }

  if (action.disabled) {
    return {
      session: args.session,
      output: [
        'Screen action',
        `  ${action.title} is not available yet.`,
        `  detail: ${action.detail}`
      ].join('\n')
    }
  }

  if (action.card) {
    return executeSingleActionCard({
      cwd: args.cwd,
      session: args.session,
      card: action.card,
      index: targetIndex,
      router: args.router,
      includeFollowThrough: true
    })
  }

  if (action.openUrl) {
    await executeHarnessPrimitive({
      cwd: args.cwd,
      name: 'open_browser',
      input: { url: action.openUrl }
    })
    const updatedSession = await saveInteractiveSession(
      args.cwd,
      sessionWithInteractiveInput(args.session, {
        activeScreen: 'auth',
        interactionMode: 'navigate-actions',
        composeBuffer: ''
      })
    )
    return {
      session: updatedSession,
      output: [
        'Shell action',
        `  opened browser for ${action.openUrl}`,
        '  complete login in the browser, then paste the callback URL into the composer or run /auth complete <redirect-url>.'
      ].join('\n')
    }
  }

  if (action.commandArgs) {
    const result = await executeInteractiveCommandArgs({
      cwd: args.cwd,
      session: args.session,
      commandArgs: action.commandArgs,
      router: args.router
    })
    let updatedSession = await saveInteractiveSession(args.cwd, updateSessionFromResult(args.session, result))
    const parsed = parseCliArgs(action.commandArgs)
    let rendered = renderCliOutput({ parsed, result })

    if (shouldAppendRuntimeFollowThroughForParsed(parsed)) {
      updatedSession = await refreshSessionActionCardsFromRuntime(args.cwd, updatedSession)
      rendered = `${rendered}\n\nRuntime follow-through\n\n${await renderInteractiveRuntimeFollowThrough(args.cwd, updatedSession)}`
    }

    return {
      session: updatedSession,
      output: [
        `Screen action`,
        `  ${action.title}`,
        '',
        rendered
      ].join('\n')
    }
  }

  if (action.commandLine.startsWith('/')) {
    return handleInteractiveInput({
      cwd: args.cwd,
      line: action.commandLine,
      session: args.session,
      router: args.router,
      recordTranscript: false
    })
  }

  return {
    session: args.session,
    output: [
      'Screen action',
      `  ${action.title}`,
      `  detail: ${action.detail}`
    ].join('\n')
  }
}

async function focusInteractiveActionCard(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  delta: number
}) {
  const runtime = await loadInteractiveRuntimeState(args.cwd, args.session)
  const actionItems = buildInteractiveScreenActionItems(args.session, runtime)
  if (actionItems.length === 0) {
    return {
      session: args.session,
      output: 'Operator focus\n  no screen actions are available yet.'
    }
  }

  const nextIndex = cycleInteractiveSelectionIndex(
    args.session.selection.actionCardIndex,
    actionItems.length,
    args.delta
  )
  const focusedAction = actionItems[nextIndex]
  const updatedSession = await saveInteractiveSession(
    args.cwd,
    sessionWithInteractiveInput(
      updateSessionSelection(args.session, {
        ...args.session.selection,
        actionCardIndex: nextIndex,
        actionCardSignature: focusedAction ? buildInteractiveActionCardSignature(focusedAction.card || focusedAction) : null,
        focusedPane: 'actions'
      }),
      {
        interactionMode: 'navigate-actions',
        composeBuffer: ''
      }
    )
  )
  const action = focusedAction
  return {
    session: updatedSession,
    output: [
      'Operator focus',
      `  action card: ${nextIndex + 1}/${actionItems.length}`,
      `  title: ${action.title}`,
      `  detail: ${action.detail}`,
      `  command: ${action.commandArgs ? `opengtm ${action.commandArgs.join(' ')}` : action.commandLine}`,
      '  shortcut: ! or /do [n]'
    ].join('\n')
  }
}

async function focusInteractivePane(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  delta: number
}) {
  const panes: OpenGtmInteractiveFocusedPane[] = ['actions', 'approvals']
  const currentIndex = panes.indexOf(args.session.selection.focusedPane)
  const nextIndex = (Math.max(0, currentIndex) + (args.delta >= 0 ? 1 : -1) + panes.length) % panes.length
  const focusedPane = panes[nextIndex]
  const updatedSession = await saveInteractiveSession(
    args.cwd,
    sessionWithInteractiveInput(
      updateSessionSelection(args.session, {
        ...args.session.selection,
        focusedPane
      }),
      {
        interactionMode: deriveNavigateModeFromFocusedPane(focusedPane, args.session),
        composeBuffer: ''
      }
    )
  )
  return {
    session: updatedSession,
    output: [
      'Operator focus',
      `  pane: ${focusedPane}`,
      `  movement: ${focusedPane === 'actions' ? '[ ] / j k / enter' : '{ } / j k / + - / enter'}`,
      '  hint: use tab/shift-tab or h/l to switch panes again.'
    ].join('\n')
  }
}

async function focusInteractiveApprovalGate(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  delta: number
}) {
  const runtime = await loadInteractiveRuntimeState(args.cwd, args.session)
  if (runtime.pendingApprovalSummaries.length === 0) {
    return {
      session: args.session,
      output: 'Operator focus\n  no pending approval gates are available right now.'
    }
  }

  const nextIndex = cycleInteractiveSelectionIndex(
    args.session.selection.approvalIndex,
    runtime.pendingApprovalSummaries.length,
    args.delta
  )
  const focusedApproval = runtime.pendingApprovalSummaries[nextIndex]
  const updatedSession = await saveInteractiveSession(
    args.cwd,
    sessionWithInteractiveInput(
      updateSessionSelection(args.session, {
        ...args.session.selection,
        approvalIndex: nextIndex,
        approvalId: focusedApproval?.id || null,
        focusedPane: 'approvals'
      }),
      {
        interactionMode: deriveNavigateModeFromFocusedPane('approvals', args.session),
        composeBuffer: ''
      }
    )
  )
  const approval = focusedApproval
  return {
    session: updatedSession,
    output: [
      'Operator focus',
      `  approval gate: ${nextIndex + 1}/${runtime.pendingApprovalSummaries.length}`,
      `  id: ${approval.id}`,
      `  action: ${approval.actionSummary}`,
      `  lane: ${approval.lane || 'n/a'} / target: ${approval.target || 'n/a'}`,
      '  shortcut: + / enter or -'
    ].join('\n')
  }
}

async function executePlanQueryStep(
  step: OpenGtmSessionPlan['steps'][number],
  session: OpenGtmInteractiveSession,
  cwd: string
) {
  if (step.intent.kind === 'entity-summary') {
    const result = await queryEntitySummary(cwd, session, step.intent.entity)
    return renderCliOutput({ parsed: parseCliArgs(['session', 'summary']), result })
  }
  if (step.intent.kind === 'pending-summary') {
    const result = await queryPendingSummary(cwd)
    return renderCliOutput({ parsed: parseCliArgs(['session', 'summary']), result })
  }
  if (step.intent.kind === 'latest-summary' || step.intent.kind === 'explain-block') {
    const result = step.intent.kind === 'latest-summary'
      ? await queryLatestSummary(cwd, session)
      : {
          kind: 'session-query' as const,
          queryType: 'latest-summary' as const,
          specialist: 'policy-checker',
          summary: [(await explainLatestBlock(cwd, session))],
          nextAction: 'Use /approve or /deny if the latest workflow is approval-gated.'
        }
    return renderCliOutput({ parsed: parseCliArgs(['session', 'summary']), result })
  }
  if (step.intent.kind === 'next-summary') {
    const result = await queryNextSummary(cwd, session)
    return renderCliOutput({ parsed: parseCliArgs(['session', 'summary']), result })
  }

  return 'No executable query step was available.'
}

async function resolvePlanStepArgs(
  step: OpenGtmSessionPlan['steps'][number],
  session: OpenGtmInteractiveSession,
  cwd: string
) {
  if ((step.intent.kind === 'approve-latest' || step.intent.kind === 'deny-latest') && step.commandArgs.length < 3) {
    const approvalId = await findLatestApprovalRequestId(cwd, session)
    if (!approvalId) return ['approvals', 'list']
    return ['approvals', step.intent.kind === 'approve-latest' ? 'approve' : 'deny', approvalId]
  }
  return step.commandArgs
}

async function resolveInteractiveAction(args: {
  cwd: string
  line: string
  session: OpenGtmInteractiveSession
}): Promise<
  | { kind: 'help'; intent: ReturnType<typeof parseSessionIntent> }
  | { kind: 'show-commands'; intent: ReturnType<typeof parseSessionIntent> }
  | { kind: 'clear-screen'; intent: ReturnType<typeof parseSessionIntent> }
  | { kind: 'set-screen'; intent: ReturnType<typeof parseSessionIntent>; screen: OpenGtmInteractiveScreen }
  | { kind: 'set-auth-target'; intent: ReturnType<typeof parseSessionIntent>; providerId: string }
  | { kind: 'open-auth-browser'; intent: ReturnType<typeof parseSessionIntent> }
  | { kind: 'complete-auth'; intent: ReturnType<typeof parseSessionIntent>; redirectUrl: string }
  | { kind: 'explain-block'; intent: ReturnType<typeof parseSessionIntent> }
  | { kind: 'query-entity'; intent: ReturnType<typeof parseSessionIntent> }
  | { kind: 'query-pending'; intent: ReturnType<typeof parseSessionIntent> }
  | { kind: 'query-latest'; intent: ReturnType<typeof parseSessionIntent> }
  | { kind: 'query-next'; intent: ReturnType<typeof parseSessionIntent> }
  | { kind: 'focus-pane'; intent: ReturnType<typeof parseSessionIntent>; delta: number }
  | { kind: 'focus-action-card'; intent: ReturnType<typeof parseSessionIntent>; delta: number }
  | { kind: 'focus-approval-gate'; intent: ReturnType<typeof parseSessionIntent>; delta: number }
  | { kind: 'approve-and-continue'; intent: ReturnType<typeof parseSessionIntent>; approvalId: string | null }
  | { kind: 'run-next'; intent: ReturnType<typeof parseSessionIntent>; index: number }
  | { kind: 'primitive-loop'; intent: ReturnType<typeof parseSessionIntent> }
  | { kind: 'delegated'; args: string[]; intent: ReturnType<typeof parseSessionIntent> }
  | { kind: 'unknown'; intent: ReturnType<typeof parseSessionIntent> }
> {
  const input = args.line.trim()
  const lower = input.toLowerCase()
  const intent = parseSessionIntent(input, args.session)

  const quickActionCardSlot = parseInteractiveQuickActionCardSlot(input)
  if (quickActionCardSlot !== null) {
    return { kind: 'run-next', intent, index: quickActionCardSlot }
  }

  if (looksLikeInteractiveOauthRedirect(input)) {
    return {
      kind: 'complete-auth',
      intent,
      redirectUrl: input
    }
  }

  if (shouldRouteToPrimitiveLoop(input)) {
    return { kind: 'primitive-loop', intent }
  }

  if (lower === 'tab' || lower === 'l' || lower === 'right') {
    return { kind: 'focus-pane', intent, delta: 1 }
  }
  if (lower === 'shift-tab' || lower === 'h' || lower === 'left') {
    return { kind: 'focus-pane', intent, delta: -1 }
  }
  if (lower === 'j' || lower === 'down') {
    return args.session.selection.focusedPane === 'approvals'
      ? { kind: 'focus-approval-gate', intent, delta: 1 }
      : { kind: 'focus-action-card', intent, delta: 1 }
  }
  if (lower === 'k' || lower === 'up') {
    return args.session.selection.focusedPane === 'approvals'
      ? { kind: 'focus-approval-gate', intent, delta: -1 }
      : { kind: 'focus-action-card', intent, delta: -1 }
  }
  if (lower === 'enter' || lower === 'open') {
    if (args.session.selection.focusedPane === 'approvals') {
      const approvalId = await findSelectedApprovalRequestId(args.cwd, args.session)
      if (!approvalId) {
        throw new Error('No focused approval id is available. Trigger an approval-gated workflow first.')
      }
      return {
        kind: 'delegated',
        args: ['approvals', 'approve', approvalId],
        intent
      }
    }
    return { kind: 'run-next', intent, index: args.session.selection.actionCardIndex }
  }

  if (input === '[' || input === ']') {
    return { kind: 'focus-action-card', intent, delta: input === ']' ? 1 : -1 }
  }
  if (input === '{' || input === '}') {
    return { kind: 'focus-approval-gate', intent, delta: input === '}' ? 1 : -1 }
  }
  if (input === '!') {
    return { kind: 'run-next', intent, index: args.session.selection.actionCardIndex }
  }
  if (input === '+' || input === '-') {
    const approvalId = await findSelectedApprovalRequestId(args.cwd, args.session)
    if (!approvalId) {
      throw new Error('No focused approval id is available. Trigger an approval-gated workflow first.')
    }
    return {
      kind: 'delegated',
      args: ['approvals', input === '+' ? 'approve' : 'deny', approvalId],
      intent
    }
  }

  if (lower === 'g' || lower === 'go' || lower === 'continue') {
    return { kind: 'delegated', args: ['session', 'advance', '3'], intent }
  }
  if (lower === 'r' || lower === 'resume') {
    return { kind: 'delegated', args: ['session', 'resume', '3'], intent }
  }
  if (lower === 'y' || lower === 'yes') {
    const approvalId = await findLatestApprovalRequestId(args.cwd, args.session)
    if (!approvalId) {
      throw new Error('No approval id available. Trigger an approval-gated workflow first.')
    }
    return { kind: 'delegated', args: ['approvals', 'approve', approvalId], intent }
  }
  if (lower === 'n' || lower === 'no') {
    const approvalId = await findLatestApprovalRequestId(args.cwd, args.session)
    if (!approvalId) {
      throw new Error('No approval id available. Trigger an approval-gated workflow first.')
    }
    return { kind: 'delegated', args: ['approvals', 'deny', approvalId], intent }
  }

  if (input.startsWith('/')) {
    const tokens = tokenizeInteractiveLine(input.slice(1))
    if (tokens.length === 0) return { kind: 'help', intent }
    if (tokens[0] === 'commands') {
      return { kind: 'show-commands', intent }
    }
    if (tokens[0] === 'home') {
      return { kind: 'set-screen', intent, screen: 'home' }
    }
    if (tokens[0] === 'test' || tokens[0] === 'run') {
      return { kind: 'set-screen', intent, screen: 'run' }
    }
    if (tokens[0] === 'inspect') {
      return { kind: 'set-screen', intent, screen: 'inspect' }
    }
    if (tokens[0] === 'clear' || tokens[0] === 'cls') {
      return { kind: 'clear-screen', intent }
    }
    if (tokens[0] === 'compact') {
      return { kind: 'delegated', args: ['session', 'compact'], intent }
    }
    if (tokens[0] === 'new') {
      return { kind: 'delegated', args: ['session', 'new'], intent }
    }
    if (tokens[0] === 'model') {
      if (tokens[1]) {
        return { kind: 'delegated', args: ['models', 'use', tokens[1]], intent }
      }
      return { kind: 'delegated', args: ['models', 'list'], intent }
    }
    if (tokens[0] === 'provider' && tokens[1] && tokens[1] !== 'list') {
      return { kind: 'delegated', args: ['provider', 'use', tokens[1]], intent }
    }
    if (tokens[0] === 'auth' && tokens.length === 1) {
      return { kind: 'set-screen', intent, screen: 'auth' }
    }
    if (tokens[0] === 'auth' && tokens[1] === 'browser') {
      return { kind: 'open-auth-browser', intent }
    }
    if (tokens[0] === 'auth' && tokens[1] === 'complete') {
      const redirectUrl = tokens.slice(2).join(' ').trim()
      if (!redirectUrl) {
        throw new Error('Paste the full OAuth redirect URL after `/auth complete`.')
      }
      return { kind: 'complete-auth', intent, redirectUrl }
    }
    if (tokens[0] === 'auth' && tokens[1] === 'provider' && tokens[2]) {
      return { kind: 'set-auth-target', providerId: tokens[2], intent }
    }

    if (tokens[0] === 'approve' || tokens[0] === 'deny') {
      const wantsContinue = tokens.includes('continue') || tokens.includes('--continue')
      const explicitApprovalId = tokens.find((token, index) =>
        index > 0 && token !== 'continue' && token !== '--continue'
      ) || null
      if (tokens[0] === 'approve' && wantsContinue) {
        return {
          kind: 'approve-and-continue',
          approvalId: explicitApprovalId,
          intent
        }
      }
      const approvalId = explicitApprovalId || await findLatestApprovalRequestId(args.cwd, args.session)
      if (!approvalId) {
        throw new Error('No approval id available. Run /approvals or trigger an approval-gated workflow first.')
      }
      return {
        kind: 'delegated',
        args: ['approvals', tokens[0], approvalId],
        intent
      }
    }
    if (tokens[0] === 'cards' && tokens[1] === 'refresh') {
      return {
        kind: 'delegated',
        args: ['session', 'cards', '--refresh'],
        intent
      }
    }
    if (tokens[0] === 'resume') {
      const parsedSteps = Number(tokens[1] || '3')
      return {
        kind: 'delegated',
        args: ['session', 'resume', Number.isFinite(parsedSteps) && parsedSteps > 0 ? String(parsedSteps) : '3'],
        intent
      }
    }
    if (tokens[0] === 'continue' || tokens[0] === 'advance') {
      const parsedSteps = Number(tokens[1] || '3')
      return {
        kind: 'delegated',
        args: ['session', 'advance', Number.isFinite(parsedSteps) && parsedSteps > 0 ? String(parsedSteps) : '3'],
        intent
      }
    }
    if (tokens[0] === 'do' || tokens[0] === 'run-next') {
      const parsedIndex = Number(tokens[1] || '1')
      return {
        kind: 'run-next',
        index: Number.isFinite(parsedIndex) && parsedIndex > 0 ? parsedIndex - 1 : 0,
        intent
      }
    }

    const directCommand = DIRECT_SLASH_COMMANDS[tokens[0]]
    if (directCommand) return { kind: 'delegated', args: directCommand, intent }
    if (tokens[0] === 'workflow' && tokens.length === 1) return { kind: 'delegated', args: ['workflow', 'list'], intent }
    if (tokens[0] === 'why' || tokens[0] === 'blocked') return { kind: 'explain-block', intent }

    return { kind: 'delegated', args: tokens, intent }
  }

  if (intent.kind === 'entity-summary') {
    return { kind: 'query-entity', intent }
  }
  if (intent.kind === 'pending-summary' || intent.kind === 'show-approvals') {
    return lower.includes('show approvals') || lower === 'approvals'
      ? { kind: 'delegated', args: ['approvals', 'list'], intent }
      : { kind: 'query-pending', intent }
  }
  if (intent.kind === 'latest-summary') {
    return { kind: 'query-latest', intent }
  }
  if (intent.kind === 'next-summary') {
    return { kind: 'query-next', intent }
  }
  if (intent.kind === 'run-next') {
    return { kind: 'run-next', intent, index: 0 }
  }
  if (intent.kind === 'resume-advance') {
    return { kind: 'delegated', args: ['session', 'resume'], intent }
  }
  if (intent.kind === 'show-traces') {
    return { kind: 'delegated', args: ['traces', 'list'], intent }
  }
  if (intent.kind === 'show-memory') {
    return { kind: 'delegated', args: ['memory', 'list'], intent }
  }
  if (intent.kind === 'show-artifacts') {
    return { kind: 'delegated', args: ['artifacts', 'list'], intent }
  }
  if (intent.kind === 'workflow-catalog') {
    return { kind: 'delegated', args: ['workflow', 'list'], intent }
  }
  if (intent.kind === 'show-sandbox') {
    return { kind: 'delegated', args: ['sandbox', 'status'], intent }
  }
  if (intent.kind === 'show-status') {
    return { kind: 'delegated', args: ['status'], intent }
  }
  if (intent.kind === 'show-session') {
    return { kind: 'delegated', args: ['session', 'status'], intent }
  }
  if (intent.kind === 'show-history') {
    return { kind: 'delegated', args: ['session', 'transcript'], intent }
  }
  if (intent.kind === 'learn-review') {
    return { kind: 'delegated', args: ['learn', 'review'], intent }
  }
  if (intent.kind === 'explain-block') {
    return { kind: 'explain-block', intent }
  }
  if (intent.kind === 'approve-latest') {
    const approvalId = tokenizeInteractiveLine(input).slice(1)[0] || await findLatestApprovalRequestId(args.cwd, args.session)
    if (!approvalId) throw new Error('No approval id available to approve.')
    return { kind: 'delegated', args: ['approvals', 'approve', approvalId], intent }
  }
  if (intent.kind === 'deny-latest') {
    const approvalId = tokenizeInteractiveLine(input).slice(1)[0] || await findLatestApprovalRequestId(args.cwd, args.session)
    if (!approvalId) throw new Error('No approval id available to deny.')
    return { kind: 'delegated', args: ['approvals', 'deny', approvalId], intent }
  }
  if (intent.kind === 'draft-outreach') {
    const goal = intent.entity ? `Draft outreach for ${intent.entity}` : input
    return { kind: 'delegated', args: ['workflow', 'run', 'sdr.outreach_compose', goal], intent }
  }
  if (intent.kind === 'outreach-sequence') {
    const goal = intent.entity ? `Outreach sequence for ${intent.entity}` : input
    return { kind: 'delegated', args: ['workflow', 'run', 'sdr.outreach_sequence', goal], intent }
  }
  if (intent.kind === 'inbound-triage') {
    const goal = intent.entity ? `Inbound triage for ${intent.entity}` : input
    return { kind: 'delegated', args: ['workflow', 'run', 'sdr.inbound_triage', goal], intent }
  }
  if (intent.kind === 'account-health') {
    const goal = intent.entity ? `Account health for ${intent.entity}` : input
    return { kind: 'delegated', args: ['workflow', 'run', 'cs.health_score', goal], intent }
  }
  if (intent.kind === 'account-brief') {
    const goal = intent.entity ? `Account brief for ${intent.entity}` : input
    return { kind: 'delegated', args: ['workflow', 'run', 'ae.account_brief', goal], intent }
  }
  if (intent.kind === 'deal-risk') {
    const goal = intent.entity ? `Deal risk for ${intent.entity}` : input
    return { kind: 'delegated', args: ['workflow', 'run', 'ae.deal_risk_scan', goal], intent }
  }
  if (intent.kind === 'expansion-signal') {
    const goal = intent.entity ? `Expansion signal for ${intent.entity}` : input
    return { kind: 'delegated', args: ['workflow', 'run', 'ae.expansion_signal', goal], intent }
  }
  if (intent.kind === 'renewal-prep') {
    const goal = intent.entity ? `Renewal prep for ${intent.entity}` : input
    return { kind: 'delegated', args: ['workflow', 'run', 'cs.renewal_prep', goal], intent }
  }
  if (intent.kind === 'usage-analytics') {
    const goal = intent.entity ? `Usage analytics for ${intent.entity}` : input
    return { kind: 'delegated', args: ['workflow', 'run', 'de.usage_analytics', goal], intent }
  }
  if (intent.kind === 'canonical-roundtrip') {
    return { kind: 'delegated', args: ['workflow', 'run', 'crm.roundtrip', input], intent }
  }
  if (intent.kind === 'research-account') {
    const goal = intent.entity ? `Research ${intent.entity}` : input
    return { kind: 'delegated', args: ['workflow', 'run', 'sdr.lead_research', goal], intent }
  }
  if (intent.kind === 'resume-last-task' && args.session.lastWorkflowId) {
    const goal = args.session.focusEntity
      ? `Resume ${args.session.lastWorkflowId} for ${args.session.focusEntity}`
      : `Resume ${args.session.lastWorkflowId}`
    return { kind: 'delegated', args: ['workflow', 'run', args.session.lastWorkflowId, goal], intent }
  }

  if (intent.kind === 'unknown') {
    return { kind: 'primitive-loop', intent }
  }

  return { kind: 'unknown', intent }
}


function parseInteractiveQuickActionCardSlot(input: string) {
  if (!/^\d+$/.test(input.trim())) return null
  const parsedIndex = Number(input.trim())
  if (!Number.isFinite(parsedIndex) || parsedIndex <= 0) return null
  return parsedIndex - 1
}

function tokenizeInteractiveLine(input: string): string[] {
  const tokens = input.match(/"([^"]*)"|'([^']*)'|[^\s]+/g) || []
  return tokens.map((token) => token.replace(/^['"]|['"]$/g, ''))
}

function looksLikeInteractiveOauthRedirect(input: string) {
  try {
    const url = new URL(input)
    const parsed = parseOauthRedirect(input)
    return url.pathname.endsWith('/auth/callback') && Boolean(parsed.code || parsed.error) && Boolean(parsed.state)
  } catch {
    return false
  }
}

function renderInteractiveHelp() {
  return [
    'OpenGTM interactive slash commands',
    '',
    '  /help               Show this command guide',
    '  /commands           Show the live command catalog for the current shell state',
    '  /clear, /cls        Clear transient terminal output (context stays)',
    '  /compact            Summarize the transcript and preserve the current GTM state',
    '  /new                Start a fresh session thread',
    '  /home               Open the overview workspace',
    '  /test               Open the manual-test workspace',
    '  /inspect            Open traces/transcript inspection',
    '  /status             Show control-plane status',
    '  /session            Show current session status',
    '  /history            Show recent session transcript entries',
    '',
    'Provider/model controls',
    '  /auth               Open the auth workspace and show auth status',
    '  /auth provider <id> Change the auth workspace target without switching the shell provider',
    '  /auth login <id>    Start auth for the target provider (OAuth or API-key setup)',
    '  /auth browser       Reopen the pending OAuth browser URL (OAuth providers only)',
    '  /auth complete <url>  Complete OAuth from a pasted callback URL',
    '  /provider           List providers',
    '  /provider <id>      Switch provider quickly',
    '  /model              List available models',
    '  /model <id>         Switch active model',
    '',
    'Runtime controls',
    '  /next               Show runtime-recommended next actions',
    '  /cards              Show persisted runtime action cards',
    '  /cards refresh      Recompute runtime action cards from current state',
    '  /do [n]             Execute runtime action card n',
    '  /continue [n]       Autoplay up to n workflow cards until a gate/stop',
    '  /resume [n]         Resume the last runtime advance after a stop/gate',
    '  /progress           Show supervisor progress and recent advance history',
    '',
    'Approvals',
    '  /approvals          Open the approvals workspace and list gates',
    '  /approve [id]       Approve latest or specified approval',
    '  /approve continue   Approve and continue the paused runtime lane',
    '  /deny [id]          Deny latest or specified approval',
    '',
    'Navigation keys',
    '  1..9                Execute visible action-card slot',
    '  g / r               Quick continue / resume the supervisor lane',
    '  y / n               Quick approve / deny the latest pending gate',
    '  [ / ]               Move action-card focus left / right',
    '  { / }               Move approval-gate focus left / right',
    '  tab / shift-tab     Move pane focus between actions and approvals',
    '  h/l + j/k           Vim-style pane switch and list movement',
    '  ! / + / -           Run focused action / approve focused gate / deny focused gate',
    '  enter / open        Run focused action or approve focused gate',
    '  ctrl+k              Open command palette',
    '  ctrl+l              Clear screen output',
    '',
    'Diagnostics and extension',
    '  /workflow           List workflows',
    '  /traces             List traces',
    '  /memory             List memory',
    '  /artifacts          List artifacts',
    '  /skills             List skills',
    '  /agents             List agents',
    '  /sandbox            Show sandbox status',
    '  /exit               Close the session',
    '',
    'Natural-language examples',
    ...INTERACTIVE_EXAMPLES.map((example) => `  ${example}`),
    '  http://127.0.0.1:1455/auth/callback?code=...&state=...',
    '  Turn this into a skill'
  ].join('\n')
}

function renderIntentRoute(intent: ReturnType<typeof parseSessionIntent>, body: string) {
  const route = [
    'Supervisor route',
    `  intent: ${intent.kind}`,
    `  specialist: ${intent.specialist}`,
    `  confidence: ${intent.confidence}`,
    `  entity: ${intent.entity || 'n/a'}`,
    `  reason: ${intent.reason}`
  ].join('\n')

  return `${route}\n\n${body}`
}

function renderSessionPlan(plan: OpenGtmSessionPlan) {
  return [
    'Supervisor plan',
    `  objective: ${plan.objective}`,
    `  entity: ${plan.entity || 'n/a'}`,
    `  confidence: ${plan.confidence}`,
    `  steps: ${plan.steps.length}`,
    ...plan.steps.map(
      (step) =>
        `  - ${step.id}: ${step.intent.specialist} -> ${step.label} [${step.supportTier}]`
    )
  ].join('\n')
}

function renderRuntimeActionCard(card: OpenGtmSessionActionCard, index: number) {
  return [
    'Runtime action card',
    `  slot: ${index + 1}`,
    `  title: ${card.title}`,
    `  reason: ${card.reason}`,
    `  command: opengtm ${card.commandArgs.join(' ')}`
  ].join('\n')
}

export async function buildInteractivePromptLabel(cwd: string, session: OpenGtmInteractiveSession) {
  const runtime = await loadInteractiveRuntimeState(cwd, session)
  const actionFocus = resolveInteractiveActionCardFocus(session, runtime)
  const approvalFocus = resolveInteractiveApprovalFocus(session, runtime)
  const bits = [
    `screen:${session.activeScreen}`,
    session.focusType && session.focusEntity ? `${session.focusType}:${session.focusEntity}` : null,
    runtime.pendingApprovals > 0 ? `approvals:${runtime.pendingApprovals}` : null,
    actionFocus.total > 0 ? `action:${actionFocus.index + 1}/${actionFocus.total}` : null,
    approvalFocus.total > 0 ? `gate:${approvalFocus.index + 1}/${approvalFocus.total}` : null,
    `pane:${session.selection.focusedPane === 'actions' ? 'act' : 'gate'}`,
    runtime.provider ? `${runtime.provider}/${runtime.model}` : null,
    runtime.nextHint ? `next:${runtime.nextHint}` : null
  ].filter(Boolean)

  return bits.length > 0 ? `opengtm[${bits.join(' | ')}]› ` : 'opengtm› '
}

async function renderInteractiveWelcome(cwd: string, session: OpenGtmInteractiveSession) {
  const runtime = await loadInteractiveRuntimeState(cwd, session)
  return [
    'OpenGTM Agent Harness',
    `session: ${session.sessionId}`,
    `transcript: ${session.transcriptPath}`,
    `runtime: ${runtime.provider}/${runtime.model} | approvals ${runtime.pendingApprovals} | focus ${session.focusEntity || 'none'}`,
    `next: ${runtime.nextLabel || 'Research an account or lead to start the runtime loop'}`,
    '',
    'Try (Claude/Codex-style slash + natural language):',
    ...INTERACTIVE_EXAMPLES.map((example) => `- ${example}`),
    '- /help',
    '- /model',
    '- /new',
    '- /clear',
    '- /now',
    ''
  ].join('\n')
}

function buildInteractiveTuiGovernanceLines(
  session: OpenGtmInteractiveSession,
  runtime: OpenGtmInteractiveRuntimeState
) {
  return [
    `provider auth: ${runtime.providerConfigured ? 'configured' : 'missing'}`,
    `sandbox: ${runtime.sandboxRuntime} / ${runtime.sandboxProfile}${runtime.sandboxAvailable ? '' : ' (limited)'}`,
    `pending approvals: ${runtime.pendingApprovals}`,
    `latest trace: ${runtime.latestTrace ? `${runtime.latestTrace.id} / ${runtime.latestTrace.status}` : 'none'}`,
    `lead phase: ${runtime.leadPhase || 'n/a'}`,
    `relationship: ${runtime.leadRelationshipState || 'n/a'} / do-not-send ${runtime.leadDoNotSend || 'n/a'}`,
    `approach: ${runtime.leadRecommendedApproach || 'n/a'}`,
    `account phase: ${runtime.accountPhase || 'n/a'} / deal phase ${runtime.dealPhase || 'n/a'}`,
    `last workflow: ${runtime.lastWorkflowId || 'none'}`,
    `gate: ${session.advance.status === 'waiting-for-approval' ? 'approval required' : session.advance.stopReason || 'clear'}`
  ]
}

function buildInteractiveTuiLineageLines(runtime: OpenGtmInteractiveRuntimeState) {
  const lines = [
    summarizeInteractiveTuiLineage('lead', runtime.lineage?.lead),
    summarizeInteractiveTuiLineage('account', runtime.lineage?.account),
    summarizeInteractiveTuiLineage('deal', runtime.lineage?.deal)
  ]
  return lines.length > 0 ? lines : ['none']
}

function summarizeInteractiveTuiLineage(
  label: string,
  lineage: OpenGtmInteractiveRuntimeLineageEntry | null | undefined
) {
  if (!lineage?.entity) {
    return `${label}: none`
  }
  return `${label}: ${lineage.entity} · checkpoint ${lineage.checkpointId || 'none'} · artifacts ${lineage.sourceArtifacts ?? 0}`
}

function buildInteractiveTuiSupervisorLines(session: OpenGtmInteractiveSession) {
  return [
    `status: ${session.advance.status}`,
    `steps: ${session.advance.stepsExecuted} / ${session.advance.stepsRequested || 0}`,
    `stop: ${session.advance.stopReason || 'none'}`,
    `last card: ${session.advance.lastCardTitle || 'none'}`,
    `last command: ${session.advance.lastCommand || 'none'}`
  ]
}

function buildInteractiveTuiRecentRunLines(session: OpenGtmInteractiveSession) {
  if (!session.advanceHistory.length) {
    return ['No bounded runtime runs yet. Use /continue 3 to let the supervisor chain motions.']
  }

  return session.advanceHistory.slice(0, 3).flatMap((entry, index) => {
    const lines = [
      `[run ${index + 1}] ${entry.mode} / ${entry.finalStatus}`,
      `steps: ${entry.stepsExecuted} / ${entry.stepsRequested}`,
      `stop: ${entry.stopReason || 'none'}`
    ]
    if (entry.lastCardTitle) {
      lines.push(`card: ${entry.lastCardTitle}`)
    }
    if (index < Math.min(session.advanceHistory.length, 3) - 1) {
      lines.push('')
    }
    return lines
  })
}

function buildInteractiveTuiActivityLines(session: OpenGtmInteractiveSession) {
  if (!session.eventFeed.length) {
    return ['No recent operator/runtime events yet.']
  }
  return session.eventFeed.slice(0, 5).map((event, index) => {
    const timestamp = String(event.createdAt || '').split('T')[1]?.slice(0, 8) || 'now'
    return `[${index + 1}] ${timestamp} · ${event.kind} · ${event.text}`
  })
}

function buildInteractiveTuiStatusLines(
  session: OpenGtmInteractiveSession,
  runtime: OpenGtmInteractiveRuntimeState,
  actionFocus: OpenGtmInteractiveFocusTarget,
  approvalFocus: OpenGtmInteractiveFocusTarget
) {
  return [
    `mode ${session.interactionMode}`,
    `pane ${session.selection.focusedPane}`,
    session.uiOverlay !== 'none' ? `overlay ${session.uiOverlay}` : null,
    session.flash ? `flash ${session.flash.kind}` : null,
    actionFocus.total > 0 ? `action ${actionFocus.index + 1}/${actionFocus.total}` : 'action none',
    approvalFocus.total > 0 ? `gate ${approvalFocus.index + 1}/${approvalFocus.total}` : 'gate none',
    runtime.leadPhase ? `lead ${runtime.leadPhase}` : null
  ].filter(Boolean) as string[]
}


function buildInteractiveTuiPrimaryControlLines(
  session: OpenGtmInteractiveSession,
  runtime: OpenGtmInteractiveRuntimeState,
  actionFocus: OpenGtmInteractiveFocusTarget,
  approvalFocus: OpenGtmInteractiveFocusTarget
) {
  const lines = [
    `pane: ${session.selection.focusedPane} · tab/shift-tab or h/l`,
    session.advance.status === 'waiting-for-approval'
      ? 'clear gate: /approve continue · quick y'
      : session.advance.status === 'stopped' || session.advance.stopReason === 'approval-resolved'
        ? 'resume lane: /resume · quick r'
        : 'advance lane: /continue 3 · quick g'
  ]

  if (actionFocus.total > 0) {
    lines.push(`selected action: ${actionFocus.index + 1}/${actionFocus.total} · cycle [ / ]`)
    lines.push('run focused action: ! / enter · /do 1 · quick 1')
  }

  if (approvalFocus.total > 0) {
    lines.push(`selected gate: ${approvalFocus.index + 1}/${approvalFocus.total} · cycle { / }`)
    lines.push('approve focused gate: + / enter · deny focused gate: -')
  }

  lines.push('move focused list: j / k')
  lines.push('inspect cards: /cards')
  lines.push('inspect progress: /progress')
  lines.push('inspect transcript: /history')
  lines.push('switch model: /model <id> · switch provider: /provider <id>')
  lines.push('session reset: /new · screen clear: /clear')
  return lines
}

function buildInteractiveTuiAlertLines(
  session: OpenGtmInteractiveSession,
  runtime: OpenGtmInteractiveRuntimeState,
  approvalFocus: OpenGtmInteractiveFocusedApprovalTarget
) {
  if (session.interactionMode !== 'blocked' || !approvalFocus.approval) {
    return []
  }

  return [
    `gate: ${approvalFocus.index + 1}/${approvalFocus.total}`,
    `action: ${approvalFocus.approval.actionSummary}`,
    `lane: ${approvalFocus.approval.lane || 'n/a'} / target ${approvalFocus.approval.target || 'n/a'}`,
    `lead phase: ${runtime.leadPhase || 'approval-gated'}`,
    'review keys: enter / + approves · - denies · tab switches panes'
  ]
}

function buildInteractiveTuiFlashLines(session: OpenGtmInteractiveSession) {
  if (!session.flash) {
    return []
  }

  return [
    `${session.flash.kind}: ${session.flash.text}`
  ]
}

function buildInteractiveTuiApprovalLines(
  runtime: OpenGtmInteractiveRuntimeState,
  approvalFocus: OpenGtmInteractiveFocusTarget
) {
  if (runtime.pendingApprovalSummaries.length === 0) {
    return ['none']
  }

  return runtime.pendingApprovalSummaries.flatMap((approval, index) => {
    const lines = [
      `${approvalFocus.total > 0 && index === approvalFocus.index ? '▶ ' : ''}[gate ${index + 1}] ${approval.actionSummary}`,
      `    id: ${approval.id}`,
      `    lane: ${approval.lane || 'n/a'} · target: ${approval.target || 'n/a'}`,
      `    shortcut: /approve ${approval.id} · /deny ${approval.id}`,
      ...(index === approvalFocus.index ? ['    quick: + focused · - focused'] : []),
      ...(index === 0 ? ['    quick: y latest · n latest'] : [])
    ]
    if (index < runtime.pendingApprovalSummaries.length - 1) {
      lines.push('')
    }
    return lines
  })
}

function resolveInteractiveActionCardFocus(
  session: OpenGtmInteractiveSession,
  runtime: OpenGtmInteractiveRuntimeState
): OpenGtmInteractiveFocusedActionTarget {
  const actionItems = buildInteractiveScreenActionItems(session, runtime)
  if (actionItems.length === 0) {
    return {
      index: 0,
      total: 0,
      action: null
    }
  }
  const preferredIndex = session.selection.actionCardSignature
    ? actionItems.findIndex((action) =>
        buildInteractiveActionCardSignature(action.card || action) === session.selection.actionCardSignature
      )
    : -1
  const index = preferredIndex >= 0
    ? preferredIndex
    : clampInteractiveSelectionIndex(session.selection.actionCardIndex, actionItems.length)
  return {
    index,
    total: actionItems.length,
    action: actionItems[index] || null
  }
}

function resolveInteractiveApprovalFocus(
  session: OpenGtmInteractiveSession,
  runtime: OpenGtmInteractiveRuntimeState
): OpenGtmInteractiveFocusedApprovalTarget {
  if (runtime.pendingApprovalSummaries.length === 0) {
    return {
      index: 0,
      total: 0,
      approval: null
    }
  }
  const preferredIndex = session.selection.approvalId
    ? runtime.pendingApprovalSummaries.findIndex((approval) => approval.id === session.selection.approvalId)
    : -1
  const index = preferredIndex >= 0
    ? preferredIndex
    : clampInteractiveSelectionIndex(session.selection.approvalIndex, runtime.pendingApprovalSummaries.length)
  return {
    index,
    total: runtime.pendingApprovalSummaries.length,
    approval: runtime.pendingApprovalSummaries[index] || null
  }
}

function buildInteractiveTuiFocusedActionLines(actionFocus: OpenGtmInteractiveFocusedActionTarget) {
  if (!actionFocus.action) {
    return ['none']
  }
  return [
    `slot: ${actionFocus.index + 1}/${actionFocus.total}`,
    `title: ${actionFocus.action.title}`,
    `reason: ${actionFocus.action.detail}`,
    `command: ${actionFocus.action.commandArgs ? `opengtm ${actionFocus.action.commandArgs.join(' ')}` : actionFocus.action.commandLine}`,
    'shortcut: ! or /do [n]'
  ]
}

function buildInteractiveTuiFocusedApprovalLines(approvalFocus: OpenGtmInteractiveFocusedApprovalTarget) {
  if (!approvalFocus.approval) {
    return ['none']
  }
  return [
    `gate: ${approvalFocus.index + 1}/${approvalFocus.total}`,
    `id: ${approvalFocus.approval.id}`,
    `action: ${approvalFocus.approval.actionSummary}`,
    `lane: ${approvalFocus.approval.lane || 'n/a'} / target: ${approvalFocus.approval.target || 'n/a'}`,
    'shortcut: + / enter or -'
  ]
}

function buildInteractiveHelpOverlayLines(session: OpenGtmInteractiveSession) {
  if (session.uiOverlay !== 'help') {
    return []
  }

  const modeLine = session.interactionMode === 'compose'
    ? 'compose: type GTM asks, edit with arrows/backspace/delete, enter to submit'
    : session.interactionMode === 'navigate-approvals'
      ? 'navigate-approvals: j/k or { } move gates, enter/+ approves, - denies'
      : session.interactionMode === 'blocked'
        ? 'blocked: resolve the active approval gate, or switch panes to inspect state'
        : 'navigate-actions: j/k or [ ] move actions, enter/! runs the focused action'

  return [
    `mode guide: ${modeLine}`,
    'pane switch: tab / shift-tab or h / l',
    'quick actions: 1..9, g resume/advance, r resume, y approve-latest, n deny-latest, ctrl+l clear',
    'compose controls: ctrl+a home · ctrl+e end · ctrl+u clear · ctrl+w delete word',
    'palette: ctrl+k opens command palette',
    'compose entry: / or : enters command compose mode from navigation (/help for slash docs)',
    'focus actions: [ / ] or j / k',
    'focus approvals: { / } or j / k',
    'close overlay: ? or esc',
    buildInteractiveLaneOverlayHint(session),
    buildInteractiveLaneNextHint(session),
    'gtm examples: Research Acme · Draft outreach for Acme · Check account health for Acme'
  ]
}

function buildInteractivePaletteOverlayLines(session: OpenGtmInteractiveSession) {
  if (session.uiOverlay !== 'palette') {
    return []
  }

  const items = buildInteractiveCommandPaletteItems(session)
  if (items.length === 0) {
    return ['no commands available']
  }

  const currentIndex = Math.max(0, Math.min(session.uiOverlayIndex, items.length - 1))
  return [
    'enter runs the highlighted command · j/k cycles · esc closes',
    ...items.map((item, index) =>
      `${index === currentIndex ? '▶' : ' '} ${item.label} — ${item.detail} (${item.commandLine})`
    )
  ]
}

function buildInteractivePalettePreviewLines(session: OpenGtmInteractiveSession) {
  if (session.uiOverlay !== 'palette') {
    return []
  }

  const items = buildInteractiveCommandPaletteItems(session)
  if (items.length === 0) {
    return []
  }

  const currentIndex = Math.max(0, Math.min(session.uiOverlayIndex, items.length - 1))
  const item = items[currentIndex]
  if (!item) return []

  return [
    `selection: ${currentIndex + 1}/${items.length}`,
    `label: ${item.label}`,
    `detail: ${item.detail}`,
    `command: ${item.commandLine}`,
    'hint: enter to run · j/k to move'
  ]
}

function buildInteractiveLaneOverlayHint(session: OpenGtmInteractiveSession) {
  if (session.leadLane.phase) {
    return `lead lane: ${session.leadLane.phase} / relationship ${session.leadLane.relationshipState || 'n/a'} / do-not-send ${session.leadLane.doNotSend === null ? 'n/a' : session.leadLane.doNotSend ? 'hold' : 'clear'}`
  }
  if (session.accountLane.phase) {
    return `account lane: ${session.accountLane.phase}`
  }
  if (session.dealLane.phase) {
    return `deal lane: ${session.dealLane.phase}`
  }
  return 'lane: no active GTM motion hydrated yet'
}

function buildInteractiveLaneNextHint(session: OpenGtmInteractiveSession) {
  if (session.leadLane.phase === 'draft-ready') {
    return `lane next: draft outreach for ${session.focusEntity || 'Acme'}`
  }
  if (session.leadLane.phase === 'follow-through' || session.leadLane.phase === 'sequence-ready') {
    return `lane next: build outreach sequence for ${session.focusEntity || 'Acme'}`
  }
  if (session.accountLane.phase === 'expansion-ready') {
    return `lane next: run expansion signal for ${session.focusEntity || 'Acme'}`
  }
  if (session.accountLane.phase) {
    return `lane next: run renewal prep for ${session.focusEntity || 'Acme'}`
  }
  if (session.dealLane.phase === 'brief-ready') {
    return `lane next: generate account brief for ${session.focusEntity || 'Acme'}`
  }
  if (session.dealLane.phase) {
    return `lane next: re-check deal risk for ${session.focusEntity || 'Acme'}`
  }
  return 'lane next: ask /next for the best runtime recommendation'
}

function buildInteractiveTuiShortcuts(
  session: OpenGtmInteractiveSession,
  pendingApprovals: number,
  actionCardCount: number
) {
  if (session.uiOverlay === 'palette') {
    return ['enter', 'j/k', 'esc', 'ctrl+k']
  }
  if (session.uiOverlay === 'help') {
    return ['?', 'esc', 'ctrl+k', '/next']
  }
  if (session.interactionMode === 'blocked') {
    return ['enter', '+', '-', 'tab', '?', 'ctrl+k']
  }
  if (session.interactionMode === 'compose') {
    return ['enter', 'esc', 'ctrl+w', 'ctrl+k', 'ctrl+l', '?']
  }
  if (session.interactionMode === 'navigate-approvals') {
    return ['enter', '+', '-', 'j/k', 'tab', 'ctrl+k', 'ctrl+l']
  }
  if (session.interactionMode === 'navigate-actions') {
    return ['enter', 'j/k', '/', 'tab', 'ctrl+k', 'ctrl+l']
  }
  const shortcuts = ['?', 'ctrl+k', 'ctrl+l', '/next', '/cards', '/model', '/progress', '/exit']
  if (actionCardCount > 0) {
    shortcuts.splice(1, 0, '/do 1')
  }
  if (
    session.advance.status === 'waiting-for-approval'
    || session.advance.status === 'stopped'
    || session.advance.stopReason === 'approval-resolved'
  ) {
    shortcuts.splice(2, 0, pendingApprovals > 0 && session.advance.status === 'waiting-for-approval' ? '/approve continue' : '/resume')
  } else {
    shortcuts.splice(2, 0, '/continue 3')
  }
  return shortcuts
}

function isTuiDisabled() {
  const flag = String(process.env.OPENGTM_NO_TUI || '').toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on'
}

function compactInteractiveNextHint(
  actionCard?: { title?: string; commandArgs?: string[] } | null,
  fallback?: string | null
) {
  const firstCommand = actionCard?.commandArgs?.[0]
  if (firstCommand === 'approvals') {
    return actionCard?.commandArgs?.[1] === 'deny' ? '/deny' : '/approve'
  }
  if (firstCommand === 'workflow') {
    const title = String(actionCard?.title || '')
      .replace(/^Run\s+/i, '')
      .replace(/\s+workflow$/i, '')
      .trim()
    if (title) {
      const firstWord = title.split(/\s+/)[0] || title
      const compactTitle = firstWord.toLowerCase()
      return compactTitle.length > 18 ? `${compactTitle.slice(0, 18)}…` : compactTitle
    }
    const workflowId = actionCard?.commandArgs?.[2] || ''
    const compactWorkflow = workflowId.replace(/^[^.]+\./, '')
    return compactWorkflow.length > 18 ? `${compactWorkflow.slice(0, 18)}…` : compactWorkflow
  }

  const trimmed = String(fallback || actionCard?.title || '').trim()
  if (!trimmed) return 'none'
  if (trimmed.startsWith('/approve')) return '/approve'
  if (trimmed.startsWith('/deny')) return '/deny'
  const normalized = trimmed
    .replace(/^Generate\s+/i, '')
    .replace(/^Prepare\s+/i, 'prep ')
    .replace(/^Research\s+/i, 'research ')
    .replace(/^Draft\s+/i, 'draft ')
    .replace(/\s+for\s+.+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.length > 18 ? `${normalized.slice(0, 18)}…` : normalized
}

function resolveInteractiveAuthProviderId(
  currentProviderId: string,
  authTargetProviderId?: string | null,
  authTargetLocked = false
) {
  if (authTargetLocked && authTargetProviderId && getProviderCatalogEntry(authTargetProviderId)) {
    return authTargetProviderId
  }
  const provider = getProviderCatalogEntry(currentProviderId)
  if (provider && provider.authMode !== 'none') {
    return provider.id
  }
  return 'openai'
}

async function buildInteractiveAuthRuntimeState(
  cwd: string,
  currentProviderId: string,
  authTargetProviderId?: string | null,
  authTargetLocked = false
) {
  const config = await loadOpenGtmConfig(cwd)
  const providerId = resolveInteractiveAuthProviderId(currentProviderId, authTargetProviderId, authTargetLocked)
  const provider = getProviderCatalogEntry(providerId) || getProviderCatalogEntry('openai')
  const pendingPkce = provider ? await getProviderPendingPkce(cwd, provider.id) : null
  const authProfile = provider ? config?.auth?.[provider.id] || null : null
  const currentConfigured = config?.auth || {}

  return {
    shellProviderId: currentProviderId,
    shellProviderLabel: getProviderCatalogEntry(currentProviderId)?.label || currentProviderId,
    providerId: provider?.id || providerId,
    providerLabel: provider?.label || providerId,
    authMode: authProfile?.authMode || provider?.authMode || 'none',
    backend: authProfile?.backend || (pendingPkce ? 'oauth-pkce' : null),
    configured: Boolean(authProfile?.configured),
    maskedValue: authProfile?.maskedValue || null,
    accountId: authProfile?.accountId || null,
    pendingPkce,
    providers: listProviderCatalog().map((entry) => ({
      id: entry.id,
      label: entry.label,
      authMode: entry.authMode,
      configured: entry.authMode === 'none'
        ? true
        : Boolean(currentConfigured[entry.id]?.configured),
      current: entry.id === (provider?.id || providerId)
    })),
    models: listModelsForProvider(provider?.id || providerId, config?.preferences?.currentModel || null).map((id) => ({
      id,
      current: id === config?.preferences?.currentModel
    }))
  }
}

function buildInteractiveStarterActionItems(session: OpenGtmInteractiveSession): OpenGtmInteractiveUiActionItem[] {
  const focusLead = session.focusEntity || 'Pat Example'
  const focusAccount = session.focusEntity || 'Acme'

  return [
    {
      id: 'starter-canonical',
      title: 'Run canonical roundtrip',
      detail: 'Exercise the end-to-end GTM harness with the live canonical workflow.',
      commandArgs: ['workflow', 'run', 'crm.roundtrip', focusLead],
      commandLine: `/workflow run crm.roundtrip ${focusLead}`
    },
    {
      id: 'starter-research',
      title: 'Research demo account',
      detail: 'Start with lead/account research and let the runtime generate next actions.',
      commandArgs: ['workflow', 'run', 'sdr.lead_research', `Research ${focusAccount}`],
      commandLine: `/workflow run sdr.lead_research Research ${focusAccount}`
    },
    {
      id: 'starter-outreach',
      title: 'Draft outreach',
      detail: 'Jump straight to a draft-ready motion for manual verification.',
      commandArgs: ['workflow', 'run', 'sdr.outreach_compose', `Draft outreach for ${focusLead}`],
      commandLine: `/workflow run sdr.outreach_compose Draft outreach for ${focusLead}`
    },
    {
      id: 'starter-health',
      title: 'Check account health',
      detail: 'Run a customer-health workflow to exercise a second lane.',
      commandArgs: ['workflow', 'run', 'cs.health_score', `Account health for ${focusAccount}`],
      commandLine: `/workflow run cs.health_score Account health for ${focusAccount}`
    }
  ]
}

function buildRuntimeActionItems(actionCards: OpenGtmSessionActionCard[]): OpenGtmInteractiveUiActionItem[] {
  return actionCards.map((card, index) => ({
    id: `runtime-${index}`,
    title: card.title || `Runtime action ${index + 1}`,
    detail: card.reason || `Run ${card.commandArgs.join(' ')}`,
    card,
    commandArgs: card.commandArgs,
    commandLine: `/${card.commandArgs.join(' ')}`
  }))
}

export function buildInteractiveScreenActionItems(
  session: OpenGtmInteractiveSession,
  runtime: OpenGtmInteractiveRuntimeState
): OpenGtmInteractiveUiActionItem[] {
  const runtimeItems = buildRuntimeActionItems(runtime.actionCards || [])

  if (session.activeScreen === 'auth') {
    const authTargetSwitches = runtime.auth.providers
      .filter((provider) => provider.id !== runtime.auth.providerId && provider.authMode !== 'none')
      .map((provider) => ({
        id: `auth-target-${provider.id}`,
        title: `Target ${provider.label}`,
        detail: `Switch the auth workspace to ${provider.authMode} setup for ${provider.label}.`,
        commandLine: `/auth provider ${provider.id}`
      }))

    return [
      {
        id: 'auth-login',
        title: runtime.auth.providerId === 'openai'
          ? (runtime.auth.configured ? `Reconnect ${runtime.auth.providerLabel}` : `Sign in with ${runtime.auth.providerLabel}`)
          : `Configure ${runtime.auth.providerLabel}`,
        detail: runtime.auth.providerId === 'openai'
          ? (runtime.auth.configured
              ? 'Refresh or replace the current provider session from the shell.'
              : 'Start the browser-based PKCE login flow.')
          : 'This provider uses API-key auth. Run the command with --api-key-env or switch the auth target to OpenAI OAuth.',
        commandArgs: ['auth', 'login', runtime.auth.providerId],
        commandLine: `/auth login ${runtime.auth.providerId}`,
        disabled: runtime.auth.providerId !== 'openai'
      },
      {
        id: 'auth-browser',
        title: 'Open pending browser session',
        detail: runtime.auth.pendingPkce
          ? 'Reopen the saved authorization URL.'
          : 'No pending OAuth URL is available yet.',
        commandLine: '/auth browser',
        openUrl: runtime.auth.pendingPkce?.authUrl || null,
        disabled: !runtime.auth.pendingPkce?.authUrl
      },
      {
        id: 'auth-provider',
        title: `Use ${runtime.auth.providerLabel} in shell`,
        detail: 'Switch the active harness provider to the current auth target.',
        commandArgs: ['provider', 'use', runtime.auth.providerId],
        commandLine: `/provider ${runtime.auth.providerId}`
      },
      {
        id: 'auth-models',
        title: 'Review models',
        detail: 'Inspect or change the active model after login.',
        commandArgs: ['models', 'list'],
        commandLine: '/model'
      },
      {
        id: 'auth-logout',
        title: 'Clear stored auth',
        detail: runtime.auth.configured || runtime.auth.pendingPkce
          ? 'Remove stored auth state for the current login target.'
          : 'No stored auth is currently configured.',
        commandArgs: ['auth', 'logout', runtime.auth.providerId],
        commandLine: `/auth logout ${runtime.auth.providerId}`,
        disabled: !runtime.auth.configured && !runtime.auth.pendingPkce
      },
      ...authTargetSwitches
    ]
  }

  if (session.activeScreen === 'approvals') {
    return [
      {
        id: 'approval-continue',
        title: 'Approve and continue',
        detail: runtime.pendingApprovals > 0
          ? 'Resolve the focused approval gate and resume the paused lane.'
          : 'No approval gate is currently pending.',
        commandArgs: ['session', 'approve-continue'],
        commandLine: '/approve continue',
        disabled: runtime.pendingApprovals === 0
      },
      {
        id: 'approval-list',
        title: 'List approvals',
        detail: 'Inspect the full approval queue.',
        commandArgs: ['approvals', 'list'],
        commandLine: '/approvals'
      },
      {
        id: 'approval-resume',
        title: 'Resume runtime',
        detail: 'Continue the bounded runtime lane after a manual resolution.',
        commandArgs: ['session', 'resume', '3'],
        commandLine: '/resume'
      },
      {
        id: 'approval-refresh',
        title: 'Refresh next actions',
        detail: 'Recompute action cards from the current runtime state.',
        commandArgs: ['session', 'cards', '--refresh'],
        commandLine: '/cards refresh'
      }
    ]
  }

  if (session.activeScreen === 'inspect') {
    return [
      {
        id: 'inspect-history',
        title: 'Review transcript',
        detail: 'Inspect recent shell messages and pasted callback data.',
        commandArgs: ['session', 'transcript'],
        commandLine: '/history'
      },
      {
        id: 'inspect-traces',
        title: 'Review traces',
        detail: 'Inspect the latest trace and rerun/replay targets.',
        commandArgs: ['traces', 'list'],
        commandLine: '/traces'
      },
      {
        id: 'inspect-progress',
        title: 'Review runtime progress',
        detail: 'Inspect bounded supervisor history and stop reasons.',
        commandArgs: ['session', 'progress'],
        commandLine: '/progress'
      },
      {
        id: 'inspect-status',
        title: 'Review control plane',
        detail: 'Inspect provider, sandbox, and runtime status.',
        commandArgs: ['status'],
        commandLine: '/status'
      }
    ]
  }

  if (session.activeScreen === 'run') {
    return runtimeItems.length > 0 ? runtimeItems : buildInteractiveStarterActionItems(session)
  }

  if (runtimeItems.length > 0) {
    return runtimeItems
  }

  return [
    {
      id: 'home-auth',
      title: 'Open auth workspace',
      detail: 'Connect the harness to OAuth before manual testing.',
      commandArgs: ['auth', 'status'],
      commandLine: '/auth'
    },
    {
      id: 'home-test',
      title: 'Open test workspace',
      detail: 'Go straight to manual workflow exercises and runtime cards.',
      commandLine: '/test'
    },
    ...buildInteractiveStarterActionItems(session).slice(0, 2)
  ]
}

async function renderInteractiveRuntimeFollowThrough(cwd: string, session: OpenGtmInteractiveSession) {
  const { config, daemon } = await loadSessionRuntime(cwd)
  const { handleSessionRuntime } = await import('./handlers/session.js')
  const runtime = await handleSessionRuntime({
    cwd,
    config,
    daemon
  })
  return renderCliOutput({
    parsed: parseCliArgs(['session', 'runtime']),
    result: runtime
  })
}

export async function loadInteractiveRuntimeState(cwd: string, session: OpenGtmInteractiveSession): Promise<OpenGtmInteractiveRuntimeState> {
  const config = await loadOpenGtmConfig(cwd)
  const daemon = createLocalDaemon({
    rootDir: path.join(cwd, config?.runtimeDir || DEFAULT_RUNTIME_DIR)
  })
  const { handleSessionRuntime } = await import('./handlers/session.js')
  const runtime = await handleSessionRuntime({
    cwd,
    config,
    daemon
  })
  const auth = await buildInteractiveAuthRuntimeState(
    cwd,
    runtime.controlPlane.provider.id,
    session.authTargetProviderId,
    session.authTargetLocked
  )

  return {
    pendingApprovals: runtime.inventory.pendingApprovals,
    pendingApprovalSummaries: runtime.inventory.pendingApprovalPreviews || [],
    provider: runtime.controlPlane.provider.id,
    model: runtime.controlPlane.provider.model,
    providerConfigured: Boolean(runtime.controlPlane.provider.configured),
    sandboxProfile: runtime.controlPlane.sandbox.profile,
    sandboxRuntime: runtime.controlPlane.sandbox.runtime,
    sandboxAvailable: Boolean(runtime.controlPlane.sandbox.available),
    latestTrace: runtime.inventory.latestTrace || null,
    leadPhase: runtime.leadRuntime?.phase || null,
    leadRelationshipState: runtime.leadRuntime?.relationshipState || null,
    leadDoNotSend: runtime.leadRuntime?.doNotSend || null,
    leadRecommendedApproach: runtime.leadRuntime?.recommendedApproach || null,
    accountPhase: runtime.accountRuntime?.phase || null,
    dealPhase: runtime.dealRuntime?.phase || null,
    lineage: runtime.session?.lineage || null,
    lastWorkflowId: runtime.session?.lastWorkflowId || session.lastWorkflowId,
    recommendedActions: runtime.recommendedActions || [],
    actionCards: runtime.actionCards || [],
    nextHint: compactInteractiveNextHint(runtime.actionCards?.[0], runtime.recommendedActions?.[0]),
    nextLabel: runtime.actionCards?.[0]
      ? `${runtime.actionCards[0].title || 'Next step'} — opengtm ${(runtime.actionCards[0].commandArgs || []).join(' ')}`
      : (runtime.recommendedActions?.[0] || null),
    auth
  }
}

async function refreshSessionActionCardsFromRuntime(cwd: string, session: OpenGtmInteractiveSession) {
  const { config, daemon } = await loadSessionRuntime(cwd)
  const { handleSessionRuntime } = await import('./handlers/session.js')
  const runtime = await handleSessionRuntime({
    cwd,
    config,
    daemon
  })
  return saveInteractiveSession(
    cwd,
    updateSessionCustomerRuntime(
      updateSessionLeadLane(
        updateSessionActionCards(session, runtime.actionCards || []),
        deriveLeadLaneStateFromRuntime(runtime.leadRuntime || null)
      ),
      runtime
    )
  )
}

export async function refreshPersistedSessionActionCards(cwd: string) {
  const session = await readInteractiveSession(cwd)
  if (!session) return null
  return refreshSessionActionCardsFromRuntime(cwd, session)
}

function classifyActionCardForAdvance(card: OpenGtmSessionActionCard) {
  const commandFamily = card.commandArgs[0] || ''
  if (commandFamily === 'approvals') return 'approval'
  if (commandFamily === 'workflow') return 'workflow'
  return 'non-automatable'
}

async function explainLatestBlock(cwd: string, session: OpenGtmInteractiveSession) {
  const { daemon } = await loadSessionRuntime(cwd)
  const { listRecords } = await import('@opengtm/storage')
  const approvals = listRecords<OpenGtmApprovalRequest>(daemon.storage, 'approval_requests')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  const traces = listRecords<OpenGtmRunTrace>(daemon.storage, 'run_traces')
    .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))

  const latestApproval = approvals.find((item) => item.id === session.lastApprovalRequestId) || approvals[0]
  const latestTrace = traces.find((trace) => trace.id === session.lastTraceId)
    || (latestApproval ? traces.find((trace) => trace.workItemId === latestApproval.workItemId) : null)
    || traces[0]

  if (latestApproval?.status === 'pending') {
    return [
      `Latest workflow is waiting for approval: ${latestApproval.actionSummary}`,
      `Approval id: ${latestApproval.id}`,
      'Use /approve or /deny to continue.'
    ].join('\n')
  }

  if (latestApproval?.status === 'denied') {
    return [
      `Latest workflow was denied: ${latestApproval.actionSummary}`,
      `Approval id: ${latestApproval.id}`,
      latestTrace ? `Trace status: ${latestTrace.status}` : 'Trace: unavailable'
    ].join('\n')
  }

  if (latestTrace?.status === 'failed' || latestTrace?.status === 'cancelled') {
    return [
      `Latest trace is ${latestTrace.status}.`,
      `Trace id: ${latestTrace.id}`,
      `Workflow: ${latestTrace.workflowId || 'lane-only'}`
    ].join('\n')
  }

  return 'No blocked or approval-gated workflow is currently active. Try a live workflow such as `Research Acme` or `Draft outreach for Pat Example`.'
}

function deriveInteractiveNextHint(result: any) {
  if (result?.approvalRequestId) {
    return `Inline approval available: /approve ${result.approvalRequestId} or /deny ${result.approvalRequestId}`
  }
  if (result?.traceId) {
    return `Trace shortcut: /traces (latest trace ${result.traceId})`
  }
  return null
}

function shouldAppendRuntimeFollowThroughForPlan(plan: OpenGtmSessionPlan) {
  return plan.steps.some((step) =>
    step.type === 'workflow'
    || step.intent.kind === 'approve-latest'
    || step.intent.kind === 'deny-latest'
  )
}

function shouldAppendRuntimeFollowThroughForParsed(parsed: ReturnType<typeof parseCliArgs>) {
  return (parsed.command === 'workflow' && parsed.subcommand === 'run')
    || (parsed.command === 'approvals' && ['approve', 'deny'].includes(parsed.subcommand))
}

async function findLatestApprovalRequestId(cwd: string, session: OpenGtmInteractiveSession) {
  if (session.lastApprovalRequestId) return session.lastApprovalRequestId
  const { daemon } = await loadSessionRuntime(cwd)
  const { listRecords } = await import('@opengtm/storage')
  const approvals = listRecords<OpenGtmApprovalRequest>(daemon.storage, 'approval_requests')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))

  return approvals.find((item) => item.status === 'pending')?.id || approvals[0]?.id || null
}

async function findSelectedApprovalRequestId(cwd: string, session: OpenGtmInteractiveSession) {
  const runtime = await loadInteractiveRuntimeState(cwd, session)
  if (runtime.pendingApprovalSummaries.length === 0) return null
  return resolveInteractiveApprovalFocus(session, runtime).approval?.id || null
}

function buildInteractiveActionCardSignature(card: {
  title?: string | null
  commandArgs?: string[] | null
  commandLine?: string | null
}) {
  const command = Array.isArray(card.commandArgs)
    ? card.commandArgs.join(' ')
    : String(card.commandLine || '')
  return `${card.title || 'action'}::${command}`
}

function updateSessionFromResult(session: OpenGtmInteractiveSession, result: any): OpenGtmInteractiveSession {
  const nextActionCards = Array.isArray(result?.actionCards)
    ? result.actionCards
    : Array.isArray(result?.session?.lastActionCards)
      ? result.session.lastActionCards
      : session.lastActionCards
  const nextLeadLane = result?.session?.leadLane
    ? normalizeLeadLaneState(result.session.leadLane)
    : transitionLeadLaneState(session.leadLane, {
        workflowId: result?.workflow?.id
          || result?.workItem?.workflowId
          || result?.workflowId
          || result?.session?.lastWorkflowId
          || session.lastWorkflowId
          || null,
        traceStatus: result?.traceStatus || result?.trace?.status || result?.summary?.workflowState || null,
        approvalStatus: result?.approval?.status || result?.summary?.approvalState || null,
        approvalRequested: Boolean(result?.approvalRequestId),
        action: result?.action || null,
        focusEntity: session.focusEntity || null
      })
  const nextAccountLane = result?.session?.accountLane
    ? normalizeAccountLaneState(result.session.accountLane)
    : transitionAccountLaneState(session.accountLane, {
        workflowId: result?.workflow?.id
          || result?.workItem?.workflowId
          || result?.workflowId
          || result?.session?.lastWorkflowId
          || session.lastWorkflowId
          || null,
        traceStatus: result?.traceStatus || result?.trace?.status || result?.summary?.workflowState || null
      })
  const nextDealLane = result?.session?.dealLane
    ? normalizeDealLaneState(result.session.dealLane)
    : transitionDealLaneState(session.dealLane, {
        workflowId: result?.workflow?.id
          || result?.workItem?.workflowId
          || result?.workflowId
          || result?.session?.lastWorkflowId
          || session.lastWorkflowId
          || null,
        traceStatus: result?.traceStatus || result?.trace?.status || result?.summary?.workflowState || null
      })
  const approvalPending = Boolean(result?.approvalRequestId)
    || result?.approval?.status === 'pending'
    || result?.summary?.approvalState === 'pending'
    || result?.traceStatus === 'awaiting-approval'
    || result?.trace?.status === 'awaiting-approval'
    || result?.summary?.workflowState === 'awaiting-approval'
  const nextSelection = clampInteractiveSelectionState(
    normalizeInteractiveSelectionState(result?.session?.selection || session.selection),
    { actionCardCount: nextActionCards.length }
  )
  const nextLineage = result?.session?.lineage
    ? normalizeSessionLineageState(result.session.lineage)
    : mergeSessionLineageState(session.lineage, result?.lineageUpdate)
  const nextAdvanceHistory = normalizeAdvanceHistory(result?.session?.advanceHistory || session.advanceHistory)

  return {
    ...session,
    sessionId: result?.session?.sessionId || session.sessionId,
    createdAt: result?.session?.createdAt || session.createdAt,
    status: result?.session?.status || session.status,
    updatedAt: new Date().toISOString(),
    transcriptPath: result?.session?.transcriptPath || session.transcriptPath,
    lastTraceId: result?.traceId || result?.trace?.id || result?.session?.lastTraceId || session.lastTraceId,
    lastApprovalRequestId: result?.approvalRequestId || result?.approval?.id || result?.session?.lastApprovalRequestId || session.lastApprovalRequestId,
    lastArtifactId: result?.artifactId || result?.artifact?.id || result?.session?.lastArtifactId || session.lastArtifactId,
    lastMemoryId: result?.memoryId || result?.session?.lastMemoryId || session.lastMemoryId,
    lastWorkflowId: result?.workflow?.id || result?.workItem?.workflowId || result?.workflowId || result?.session?.lastWorkflowId || session.lastWorkflowId,
    authTargetProviderId: result?.session?.authTargetProviderId ?? session.authTargetProviderId ?? null,
    authTargetLocked: result?.session?.authTargetLocked ?? session.authTargetLocked ?? false,
    focusEntity: result?.session?.focusEntity || session.focusEntity,
    focusType: result?.session?.focusType || session.focusType,
    lastIntent: result?.session?.lastIntent || session.lastIntent,
    lastSpecialist: result?.session?.lastSpecialist || session.lastSpecialist,
    lastActionCards: nextActionCards,
    advance: normalizeAdvanceState(result?.session?.advance || session.advance),
    advanceHistory: nextAdvanceHistory,
    leadLane: nextLeadLane,
    accountLane: nextAccountLane,
    dealLane: nextDealLane,
    lineage: nextLineage,
    selection: approvalPending
      ? {
          ...nextSelection,
          focusedPane: 'approvals'
        }
      : nextSelection
  }
}

function updateSessionActionCards(
  session: OpenGtmInteractiveSession,
  actionCards: OpenGtmSessionActionCard[]
): OpenGtmInteractiveSession {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    lastActionCards: actionCards,
    selection: clampInteractiveSelectionState(session.selection, {
      actionCardCount: actionCards.length
    })
  }
}

function updateSessionLeadLane(
  session: OpenGtmInteractiveSession,
  leadLane: OpenGtmLeadLaneState
): OpenGtmInteractiveSession {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    leadLane: normalizeLeadLaneState(leadLane)
  }
}

function updateSessionCustomerLanes(
  session: OpenGtmInteractiveSession,
  summary: string[]
): OpenGtmInteractiveSession {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    accountLane: normalizeAccountLaneState(deriveAccountLaneStateFromSummary(summary)),
    dealLane: normalizeDealLaneState(deriveDealLaneStateFromSummary(summary))
  }
}

function updateSessionCustomerRuntime(
  session: OpenGtmInteractiveSession,
  runtime: {
    accountRuntime?: { phase?: string | null } | null
    dealRuntime?: { phase?: string | null } | null
  }
): OpenGtmInteractiveSession {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    accountLane: normalizeAccountLaneState(deriveAccountLaneStateFromRuntime(runtime.accountRuntime || null)),
    dealLane: normalizeDealLaneState(deriveDealLaneStateFromRuntime(runtime.dealRuntime || null))
  }
}

function updateSessionSelection(
  session: OpenGtmInteractiveSession,
  selection: OpenGtmInteractiveSelectionState
): OpenGtmInteractiveSession {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    selection: normalizeInteractiveSelectionState(selection)
  }
}

function appendSessionAdvanceHistory(
  session: OpenGtmInteractiveSession,
  entry: OpenGtmInteractiveAdvanceHistoryEntry
): OpenGtmInteractiveSession {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    advanceHistory: [entry, ...session.advanceHistory].slice(0, 20)
  }
}

function updateSessionAdvanceState(
  session: OpenGtmInteractiveSession,
  advance: OpenGtmInteractiveAdvanceState
): OpenGtmInteractiveSession {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    advance
  }
}

function createIdleAdvanceState(): OpenGtmInteractiveAdvanceState {
  return {
    runId: null,
    status: 'idle',
    startedAt: null,
    updatedAt: null,
    stepsRequested: 0,
    stepsExecuted: 0,
    stopReason: null,
    lastCardTitle: null,
    lastCommand: null
  }
}

function createEmptyAdvanceHistory(): OpenGtmInteractiveAdvanceHistoryEntry[] {
  return []
}

function createDefaultInteractiveSelectionState(): OpenGtmInteractiveSelectionState {
  return {
    actionCardIndex: 0,
    approvalIndex: 0,
    actionCardSignature: null,
    approvalId: null,
    focusedPane: 'actions'
  }
}

function createDefaultInteractiveScreen(): OpenGtmInteractiveScreen {
  return 'home'
}

function normalizeAdvanceState(
  advance: OpenGtmInteractiveAdvanceState | null | undefined
): OpenGtmInteractiveAdvanceState {
  return {
    ...createIdleAdvanceState(),
    ...(advance || {})
  }
}

function normalizeAdvanceHistory(
  history: OpenGtmInteractiveAdvanceHistoryEntry[] | null | undefined
) {
  return Array.isArray(history) ? history.slice(0, 20) : createEmptyAdvanceHistory()
}

function normalizeInteractiveSelectionState(
  selection: OpenGtmInteractiveSelectionState | null | undefined
): OpenGtmInteractiveSelectionState {
  return {
    actionCardIndex: normalizeInteractiveSelectionIndex(selection?.actionCardIndex),
    approvalIndex: normalizeInteractiveSelectionIndex(selection?.approvalIndex),
    actionCardSignature: selection?.actionCardSignature || null,
    approvalId: selection?.approvalId || null,
    focusedPane: normalizeInteractiveFocusedPane(selection?.focusedPane)
  }
}

function normalizeInteractiveFocusedPane(
  focusedPane: OpenGtmInteractiveFocusedPane | null | undefined
): OpenGtmInteractiveFocusedPane {
  return focusedPane === 'approvals' ? 'approvals' : 'actions'
}

function normalizeInteractiveInteractionMode(
  interactionMode: OpenGtmInteractiveInteractionMode | null | undefined
): OpenGtmInteractiveInteractionMode {
  if (
    interactionMode === 'compose'
    || interactionMode === 'navigate-actions'
    || interactionMode === 'navigate-approvals'
    || interactionMode === 'blocked'
  ) {
    return interactionMode
  }
  return 'compose'
}

function normalizeInteractiveScreen(
  activeScreen: OpenGtmInteractiveScreen | null | undefined
): OpenGtmInteractiveScreen {
  if (
    activeScreen === 'auth'
    || activeScreen === 'run'
    || activeScreen === 'approvals'
    || activeScreen === 'inspect'
    || activeScreen === 'home'
  ) {
    return activeScreen
  }
  return createDefaultInteractiveScreen()
}

function normalizeInteractiveUiOverlay(
  uiOverlay: OpenGtmInteractiveSession['uiOverlay'] | null | undefined
): OpenGtmInteractiveSession['uiOverlay'] {
  return uiOverlay === 'help' || uiOverlay === 'palette' ? uiOverlay : 'none'
}

function normalizeInteractiveFlash(
  flash: OpenGtmInteractiveSession['flash'] | null | undefined
): OpenGtmInteractiveSession['flash'] {
  if (!flash || !flash.text) return null
  const kind = flash.kind === 'success' || flash.kind === 'warn' ? flash.kind : 'info'
  return {
    kind,
    text: String(flash.text)
  }
}

function normalizeInteractiveSelectionIndex(index: number | null | undefined) {
  if (!Number.isFinite(index)) return 0
  return Math.max(0, Math.trunc(Number(index)))
}

function clampInteractiveSelectionIndex(index: number, total: number) {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.min(normalizeInteractiveSelectionIndex(index), total - 1)
}

function clampInteractiveSelectionState(
  selection: OpenGtmInteractiveSelectionState,
  counts: { actionCardCount?: number; approvalCount?: number }
): OpenGtmInteractiveSelectionState {
  return {
    actionCardIndex:
      typeof counts.actionCardCount === 'number'
        ? clampInteractiveSelectionIndex(selection.actionCardIndex, counts.actionCardCount)
        : normalizeInteractiveSelectionIndex(selection.actionCardIndex),
    approvalIndex:
      typeof counts.approvalCount === 'number'
        ? clampInteractiveSelectionIndex(selection.approvalIndex, counts.approvalCount)
        : normalizeInteractiveSelectionIndex(selection.approvalIndex),
    actionCardSignature: selection.actionCardSignature || null,
    approvalId: selection.approvalId || null,
    focusedPane: normalizeInteractiveFocusedPane(selection.focusedPane)
  }
}

function cycleInteractiveSelectionIndex(index: number, total: number, delta: number) {
  if (!Number.isFinite(total) || total <= 0) return 0
  const current = clampInteractiveSelectionIndex(index, total)
  const normalizedDelta = Number.isFinite(delta) && delta !== 0 ? Math.trunc(delta) : 1
  return (current + normalizedDelta + total) % total
}

function mapAdvanceStopReasonToStatus(stopReason: string) {
  if (stopReason === 'approval-gate') return 'waiting-for-approval' as const
  if (stopReason === 'no-action-cards' || stopReason === 'no-further-action-cards') return 'completed' as const
  if (stopReason === 'max-steps') return 'stopped' as const
  if (stopReason === 'repeated-card' || stopReason === 'non-automatable-card') return 'stopped' as const
  return 'completed' as const
}

function computeAdvanceStepBudget(args: {
  requestedSteps?: number
  currentAdvance: OpenGtmInteractiveAdvanceState
  resuming: boolean
}) {
  if (!args.resuming) {
    return args.requestedSteps ?? 3
  }

  if (typeof args.requestedSteps === 'number' && Number.isFinite(args.requestedSteps) && args.requestedSteps > 0) {
    return args.requestedSteps
  }

  const remaining = args.currentAdvance.stepsRequested - args.currentAdvance.stepsExecuted
  return remaining > 0 ? remaining : 1
}

function updateSessionFromIntent(
  session: OpenGtmInteractiveSession,
  intent: ReturnType<typeof parseSessionIntent>
): OpenGtmInteractiveSession {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    focusEntity: intent.entity || session.focusEntity,
    focusType:
      intent.kind === 'deal-risk'
        ? 'deal'
        : ['account-health', 'renewal-prep', 'expansion-signal', 'account-brief'].includes(intent.kind)
          ? 'account'
          : ['research-account', 'draft-outreach'].includes(intent.kind)
            ? 'lead'
            : session.focusType,
    lastIntent: intent.kind,
    lastSpecialist: intent.specialist
  }
}

export async function loadOrCreateInteractiveSession(cwd: string) {
  const existing = await readInteractiveSession(cwd)
  if (existing?.status === 'active') {
    return existing
  }

  return createFreshInteractiveSession(cwd)
}

export async function createFreshInteractiveSession(cwd: string) {
  const { sessionsDir, metaPath } = await resolveSessionPaths(cwd)
  await mkdir(sessionsDir, { recursive: true })
  const sessionId = randomUUID()
  const transcriptPath = path.join(sessionsDir, `${sessionId}.jsonl`)
  const session: OpenGtmInteractiveSession = {
    sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    transcriptPath,
    status: 'active',
    lastTraceId: null,
    lastApprovalRequestId: null,
    lastArtifactId: null,
    lastMemoryId: null,
    lastWorkflowId: null,
    authTargetProviderId: null,
    authTargetLocked: false,
    focusEntity: null,
    focusType: null,
    lastIntent: null,
    lastSpecialist: null,
    lineage: createEmptySessionLineageState(),
    leadLane: createEmptyLeadLaneState(),
    accountLane: createEmptyAccountLaneState(),
    dealLane: createEmptyDealLaneState(),
    lastActionCards: [],
    advance: createIdleAdvanceState(),
    advanceHistory: createEmptyAdvanceHistory(),
    activeScreen: createDefaultInteractiveScreen(),
    selection: createDefaultInteractiveSelectionState(),
    interactionMode: 'compose',
    composeBuffer: '',
    composeCursor: 0,
    composeHistory: [],
    composeHistoryIndex: null,
    uiOverlay: 'none',
    uiOverlayIndex: 0,
    flash: null,
    eventFeed: []
  }
  return saveInteractiveSession(cwd, session)
}

export async function readInteractiveSession(cwd: string): Promise<OpenGtmInteractiveSession | null> {
  const { metaPath } = await resolveSessionPaths(cwd)
  try {
    return normalizeInteractiveSession(JSON.parse(await readFile(metaPath, 'utf-8')) as OpenGtmInteractiveSession)
  } catch {
    return null
  }
}

export async function saveInteractiveSession(cwd: string, session: OpenGtmInteractiveSession) {
  const { metaPath } = await resolveSessionPaths(cwd)
  await mkdir(path.dirname(metaPath), { recursive: true })
  const normalized = normalizeInteractiveSession(session)
  await writeFile(metaPath, JSON.stringify(normalized, null, 2), 'utf-8')
  return normalized
}

export async function readInteractiveTranscript(cwd: string, limit = 20) {
  const session = await readInteractiveSession(cwd)
  if (!session) {
    return {
      session: null,
      entries: []
    }
  }

  try {
    const raw = await readFile(session.transcriptPath, 'utf-8')
    const entries = parseInteractiveTranscriptEntries(raw).slice(-limit)

    return { session, entries }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ENOENT')) {
      return { session, entries: [] }
    }
    return {
      session,
      entries: [],
      error: `Interactive transcript is unreadable: ${message}`
    }
  }
}

function parseInteractiveTranscriptEntries(raw: string) {
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        const parsed = JSON.parse(line)
        const validated = validateUserSessionMessageEnvelope(parsed)
        if (!validated.ok) {
          throw new Error('invalid envelope shape')
        }
        return {
          role: parsed.role,
          content: parsed.content,
          createdAt: parsed.createdAt
        } as OpenGtmInteractiveTranscriptEntry
      } catch {
        throw new Error(`transcript line ${index + 1} is unreadable`)
      }
    })
}

async function readInteractiveTranscriptEntries(cwd: string): Promise<OpenGtmInteractiveTranscriptReadResult> {
  const session = await readInteractiveSession(cwd)
  if (!session) {
    return {
      session: null,
      entries: []
    }
  }

  try {
    const raw = await readFile(session.transcriptPath, 'utf-8')
    return {
      session,
      entries: parseInteractiveTranscriptEntries(raw)
    }
  } catch {
    return { session, entries: [] }
  }
}

async function readInteractiveTranscriptEntriesForCompaction(
  cwd: string
): Promise<OpenGtmInteractiveTranscriptCompactionReadResult> {
  const session = await readInteractiveSession(cwd)
  if (!session) {
    return {
      session: null,
      entries: [],
      raw: ''
    }
  }

  let raw = ''
  try {
    raw = await readFile(session.transcriptPath, 'utf-8')
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as any).code) : ''
    if (code !== 'ENOENT') {
      throw new Error(`Interactive transcript could not be read safely for compaction: ${code || String(error)}`)
    }
    return {
      session,
      entries: [],
      raw: ''
    }
  }
  let entries: OpenGtmInteractiveTranscriptEntry[] = []
  try {
    entries = parseInteractiveTranscriptEntries(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Interactive transcript is unreadable; refusing to compact and overwrite history: ${message}`)
  }

  return { session, entries, raw }
}

function createInteractiveTranscriptEnvelope(
  session: OpenGtmInteractiveSession,
  role: 'user' | 'assistant',
  content: string
) {
  const envelope = {
    id: randomUUID(),
    kind: 'user.session.message' as const,
    source: { kind: role === 'user' ? 'user' as const : 'system' as const, id: role === 'user' ? 'operator' : 'opengtm' },
    target: { kind: 'system' as const, id: 'interactive-harness' },
    createdAt: new Date().toISOString(),
    sessionMessageId: randomUUID(),
    sessionId: session.sessionId,
    role,
    content,
    delivery: {
      channel: 'cli',
      visibility: 'private' as const
    }
  }
  const validated = validateUserSessionMessageEnvelope(envelope)
  if (!validated.ok) {
    throw new Error(`Invalid session envelope: ${JSON.stringify(validated.error)}`)
  }
  return envelope
}

function buildInteractiveCompactSummary(
  session: OpenGtmInteractiveSession,
  entries: OpenGtmInteractiveTranscriptEntry[]
) {
  const recentLines = entries
    .slice(-6)
    .map((entry) => `${entry.role || 'unknown'}: ${sanitizeInteractiveCompactContent(String(entry.content || '').replace(/\s+/g, ' ').trim())}`)
    .filter(Boolean)

  return [
    'Compacted OpenGTM session summary',
    `focus: ${session.focusType || 'none'} / ${session.focusEntity || 'none'}`,
    `last intent: ${session.lastIntent || 'none'} / specialist ${session.lastSpecialist || 'none'}`,
    `last workflow: ${session.lastWorkflowId || 'none'}`,
    `advance: ${session.advance.status} / stop ${session.advance.stopReason || 'none'} / steps ${session.advance.stepsExecuted}/${session.advance.stepsRequested}`,
    `lead lane: ${session.leadLane.phase || 'idle'} / relationship ${session.leadLane.relationshipState || 'n/a'} / do-not-send ${session.leadLane.doNotSend === null ? 'n/a' : session.leadLane.doNotSend ? 'hold' : 'clear'}`,
    `account lane: ${session.accountLane.phase || 'idle'}`,
    `deal lane: ${session.dealLane.phase || 'idle'}`,
    recentLines.length > 0 ? 'recent transcript:' : 'recent transcript: none',
    ...recentLines.map((line) => `- ${line}`)
  ].join('\n')
}

function sanitizeInteractiveCompactContent(content: string) {
  return content
    .replace(/\b(access_token|refresh_token|api[_-]?key|code|state)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/("(?:access_token|refresh_token|apiKey|api_key)"\s*:\s*")([^"]+)"/gi, '$1[redacted]"')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._-]+/gi, '$1 [redacted]')
}

function createInteractiveCompactErrorResult(args: {
  session: OpenGtmInteractiveSession | null
  error: string
  previousEntryCount?: number
}) {
  return {
    kind: 'session-compact' as const,
    session: args.session
      ? {
          sessionId: args.session.sessionId,
          status: args.session.status,
          transcriptPath: args.session.transcriptPath
        }
      : null,
    backupPath: null,
    previousEntryCount: args.previousEntryCount ?? 0,
    compactedEntryCount: 0,
    summaryPreview: 'none',
    error: args.error,
    nextAction: 'Repair the transcript file or start a fresh session before retrying compaction.'
  }
}

export async function compactInteractiveSession(cwd: string) {
  const currentSession = await readInteractiveSession(cwd)
  if (!currentSession) {
    return {
      kind: 'session-compact',
      session: null,
      previousEntryCount: 0,
      compactedEntryCount: 0,
      summaryPreview: 'No active interactive session exists yet.',
      nextAction: 'Run `opengtm` to start an interactive harness session first.'
    }
  }

  let session = currentSession
  let entries: OpenGtmInteractiveTranscriptEntry[] = []
  let raw = ''
  try {
    const readResult = await readInteractiveTranscriptEntriesForCompaction(cwd)
    if (!readResult.session) {
      return {
        kind: 'session-compact',
        session: null,
        previousEntryCount: 0,
        compactedEntryCount: 0,
        summaryPreview: 'No active interactive session exists yet.',
        nextAction: 'Run `opengtm` to start an interactive harness session first.'
      }
    }
    session = readResult.session
    entries = readResult.entries
    raw = readResult.raw
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return createInteractiveCompactErrorResult({
      session: currentSession,
      error: message
    })
  }

  const summary = buildInteractiveCompactSummary(session, entries)
  const compactedEntries = [
    createInteractiveTranscriptEnvelope(session, 'assistant', summary)
  ]
  const backupPath = entries.length > 0
    ? `${session.transcriptPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
    : null
  let updatedSession = session
  try {
    if (backupPath) {
      await writeFile(backupPath, raw, 'utf-8')
    }
    await writeFile(
      session.transcriptPath,
      `${compactedEntries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
      'utf-8'
    )
    updatedSession = await saveInteractiveSession(cwd, {
      ...session,
      updatedAt: new Date().toISOString()
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return createInteractiveCompactErrorResult({
      session,
      error: `Interactive transcript compaction could not be completed safely: ${message}`,
      previousEntryCount: entries.length
    })
  }

  return {
    kind: 'session-compact',
    session: {
      sessionId: updatedSession.sessionId,
      status: updatedSession.status,
      transcriptPath: updatedSession.transcriptPath
    },
    backupPath,
    previousEntryCount: entries.length,
    compactedEntryCount: compactedEntries.length,
    summaryPreview: summary.split('\n').slice(0, 4).join('\n'),
    nextAction: 'Continue in `opengtm`; the transcript is compacted but the current GTM state is preserved.'
  }
}

async function appendSessionMessage(
  cwd: string,
  session: OpenGtmInteractiveSession,
  role: 'user' | 'assistant',
  content: string
) {
  const envelope = createInteractiveTranscriptEnvelope(session, role, content)
  await mkdir(path.dirname(session.transcriptPath), { recursive: true })
  await appendFile(session.transcriptPath, `${JSON.stringify(envelope)}\n`, 'utf-8')
  await saveInteractiveSession(cwd, {
    ...session,
    updatedAt: new Date().toISOString()
  })
}

async function resolveSessionPaths(cwd: string) {
  const config = await loadOpenGtmConfig(cwd)
  const runtimeDir = config?.runtimeDir || DEFAULT_RUNTIME_DIR
  const sessionsDir = path.join(cwd, runtimeDir, 'sessions')
  const metaPath = path.join(sessionsDir, SESSION_META_FILE)
  return { sessionsDir, metaPath }
}

async function loadSessionRuntime(cwd: string) {
  const config = await loadOpenGtmConfig(cwd)
  const runtimeDir = config?.runtimeDir || DEFAULT_RUNTIME_DIR
  const daemon = createLocalDaemon({
    rootDir: path.join(cwd, runtimeDir)
  })
  return { config, daemon }
}

function normalizeInteractiveSession(session: OpenGtmInteractiveSession): OpenGtmInteractiveSession {
  return {
    ...session,
    authTargetProviderId: session.authTargetProviderId || null,
    authTargetLocked: Boolean(session.authTargetLocked),
    lineage: normalizeSessionLineageState(session.lineage),
    leadLane: normalizeLeadLaneState(session.leadLane),
    accountLane: normalizeAccountLaneState(session.accountLane),
    dealLane: normalizeDealLaneState(session.dealLane),
    lastActionCards: Array.isArray(session.lastActionCards) ? session.lastActionCards : [],
    advance: normalizeAdvanceState(session.advance),
    advanceHistory: normalizeAdvanceHistory(session.advanceHistory),
    activeScreen: normalizeInteractiveScreen(session.activeScreen),
    selection: clampInteractiveSelectionState(
      normalizeInteractiveSelectionState(session.selection),
      {
        actionCardCount: Array.isArray(session.lastActionCards) ? session.lastActionCards.length : 0
      }
    ),
    interactionMode: normalizeInteractiveInteractionMode(session.interactionMode),
    composeBuffer: typeof session.composeBuffer === 'string' ? session.composeBuffer : '',
    composeCursor: clampInteractiveComposeCursor(
      Number.isFinite(session.composeCursor) ? Number(session.composeCursor) : 0,
      typeof session.composeBuffer === 'string' ? session.composeBuffer : ''
    ),
    composeHistory: normalizeInteractiveComposeHistory(session.composeHistory),
    composeHistoryIndex: normalizeInteractiveComposeHistoryIndex(session.composeHistoryIndex),
    uiOverlay: normalizeInteractiveUiOverlay(session.uiOverlay),
    uiOverlayIndex: normalizeInteractiveSelectionIndex(session.uiOverlayIndex),
    flash: normalizeInteractiveFlash(session.flash),
    eventFeed: normalizeInteractiveEventFeed(session.eventFeed)
  }
}
