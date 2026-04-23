import path from 'node:path'
import { DEFAULT_RUNTIME_DIR, type OpenGtmConfig } from '../config.js'
import {
  compactInteractiveSession,
  createFreshInteractiveSession,
  executePersistedApprovalAndContinue,
  executePersistedSessionActionCard,
  executePersistedSessionAdvance,
  refreshPersistedSessionActionCards,
  type OpenGtmInteractiveSession,
  readInteractiveSession,
  readInteractiveTranscript
} from '../interactive.js'
import { createLocalDaemon, type OpenGtmLocalDaemon } from '@opengtm/daemon'
import { getProviderCatalogEntry, isSeatbeltAvailable } from '../catalog.js'
import { summarizeAccountRuntime, summarizeDealRuntime } from '../customer-lanes.js'
import { summarizeLeadRuntime, toLeadRuntimeSummary } from '../lead-lane.js'
import { queryNextSummary } from '../session-queries.js'

export async function handleSessionStatus(args: {
  cwd: string
  config: OpenGtmConfig | null
}) {
  const { approvals } = await loadSessionInventory(args.cwd, args.config)
  const session = deriveLiveInteractiveSession(await readInteractiveSession(args.cwd), approvals)
  const nextAction = session?.advance?.status === 'waiting-for-approval'
    ? 'Resolve the surfaced approval, then run `opengtm session resume` to continue the runtime advance lane.'
    : session?.advance?.stopReason === 'approval-resolved'
      ? 'The approval gate is cleared. Run `opengtm session resume` to continue the runtime advance lane.'
    : session?.advance?.status === 'stopped'
      ? 'Run `opengtm session resume` to continue the last bounded runtime advance lane.'
      : session?.status === 'active'
        ? 'Run `opengtm` to reopen the active interactive harness session, or `opengtm session transcript` to inspect the latest messages.'
        : 'Run `opengtm` to start an interactive harness session.'
  return {
    kind: 'session-status',
    session,
    advance: session?.advance || null,
    nextAction
  }
}

export async function handleSessionRuntime(args: {
  cwd: string
  config: OpenGtmConfig | null
  daemon: OpenGtmLocalDaemon
}) {
  const { approvals, traces } = await loadSessionInventory(args.cwd, args.config, args.daemon)
  const session = deriveLiveInteractiveSession(await readInteractiveSession(args.cwd), approvals)
  const currentProviderId = args.config?.preferences?.currentProvider || 'mock'
  const provider = getProviderCatalogEntry(currentProviderId)
  const currentAuth = args.config?.auth?.[currentProviderId] || null
  const latestTrace = traces.at(-1) || null
  const nextGuidance = session ? await queryNextSummary(args.cwd, session) : null
  const runtimeNextAction = session?.advance?.status === 'waiting-for-approval'
    ? 'Resolve the surfaced approval, then run `opengtm session resume` to continue the runtime advance lane.'
    : session?.advance?.stopReason === 'approval-resolved'
      ? 'The approval gate is cleared. Run `opengtm session resume` to continue the runtime advance lane.'
    : session?.advance?.status === 'stopped'
      ? 'Run `opengtm session resume` to continue the last bounded runtime advance lane.'
      : (nextGuidance?.nextAction || (session?.focusEntity
          ? 'Continue the current GTM motion, inspect pending approvals, or ask the harness for more context.'
          : 'Set a GTM focus with a task like `Research Acme` or inspect the current runtime state.'))

  return {
    kind: 'session-runtime',
    session: session
        ? {
            sessionId: session.sessionId,
            status: session.status,
            focusEntity: session.focusEntity,
            focusType: session.focusType,
            lastIntent: session.lastIntent,
            lastSpecialist: session.lastSpecialist,
            lastWorkflowId: session.lastWorkflowId,
            lastTraceId: session.lastTraceId,
            advance: session.advance,
            leadLane: session.leadLane,
            accountLane: session.accountLane,
            dealLane: session.dealLane,
            lineage: {
            lead: session.lineage.lead
              ? {
                  entity: session.lineage.lead.entityName,
                  checkpointId: session.lineage.lead.checkpoint.id,
                  sourceArtifacts: session.lineage.lead.sourceArtifactIds.length
                }
              : null,
            account: session.lineage.account
              ? {
                  entity: session.lineage.account.entityName,
                  checkpointId: session.lineage.account.checkpoint.id,
                  sourceArtifacts: session.lineage.account.sourceArtifactIds.length
                }
              : null,
            deal: session.lineage.deal
              ? {
                  entity: session.lineage.deal.entityName,
                  checkpointId: session.lineage.deal.checkpoint.id,
                  sourceArtifacts: session.lineage.deal.sourceArtifactIds.length
                }
              : null
          }
        }
      : null,
    controlPlane: {
      provider: {
        id: currentProviderId,
        label: provider?.label || currentProviderId,
        configured: currentProviderId === 'mock' ? true : Boolean(currentAuth?.configured),
        model: args.config?.preferences?.currentModel || 'mock-0'
      },
      sandbox: {
        runtime: process.platform === 'darwin' ? 'seatbelt' : 'unsupported',
        available: isSeatbeltAvailable(),
        profile: args.config?.preferences?.sandboxProfile || 'read-only'
      }
    },
    inventory: {
      pendingApprovals: approvals.filter((approval) => approval.status === 'pending').length,
      pendingApprovalPreviews: approvals
        .filter((approval) => approval.status === 'pending')
        .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
        .slice(0, 3)
        .map((approval) => ({
          id: approval.id,
          lane: approval.lane || null,
          target: approval.target || null,
          actionSummary: approval.actionSummary || 'Approval request'
        })),
      totalApprovals: approvals.length,
      traces: traces.length,
      latestTrace: latestTrace
        ? {
            id: latestTrace.id,
            workflowId: latestTrace.workflowId || null,
            status: latestTrace.status
          }
        : null
    },
    leadRuntime: summarizeLeadRuntime(nextGuidance?.summary || [])
      || toLeadRuntimeSummary(session?.leadLane),
    accountRuntime: summarizeAccountRuntime(nextGuidance?.summary || [])
      || (session?.accountLane?.phase ? { phase: session.accountLane.phase } : null),
    dealRuntime: summarizeDealRuntime(nextGuidance?.summary || [])
      || (session?.dealLane?.phase ? { phase: session.dealLane.phase } : null),
    recommendedActions: nextGuidance?.recommendedActions || [],
    actionCards: nextGuidance?.actionCards || [],
    nextAction: runtimeNextAction
  }
}

export async function handleSessionTranscript(args: {
  cwd: string
  limit?: number
}) {
  const transcript = await readInteractiveTranscript(args.cwd, normalizeSessionTranscriptLimit(args.limit))
  return {
    kind: 'session-transcript',
    session: transcript.session,
    entries: transcript.entries,
    error: transcript.error || null,
    nextAction: transcript.session
      ? (transcript.error
          ? 'Repair or replace the transcript file before relying on history, or run `opengtm session new` to rotate to a fresh session.'
          : 'Run `opengtm` to continue the session, or `opengtm session new` to rotate to a fresh session.')
      : 'Run `opengtm` to start the first interactive harness session.'
  }
}

export async function handleSessionCompact(args: {
  cwd: string
}) {
  return compactInteractiveSession(args.cwd)
}

export async function handleSessionNew(args: {
  cwd: string
}) {
  const session = await createFreshInteractiveSession(args.cwd)
  return {
    kind: 'session-status',
    session,
    nextAction: 'A fresh session was created. Run `opengtm` to enter it immediately.'
  }
}

export async function handleSessionDo(args: {
  cwd: string
  index?: number
}): Promise<any> {
  return executePersistedSessionActionCard({
    cwd: args.cwd,
    index: args.index
  })
}

export async function handleSessionApproveContinue(args: {
  cwd: string
  approvalId?: string | null
}): Promise<any> {
  return executePersistedApprovalAndContinue({
    cwd: args.cwd,
    approvalId: args.approvalId || null
  })
}

export async function handleSessionAdvance(args: {
  cwd: string
  maxSteps?: number
  resume?: boolean
}): Promise<any> {
  return executePersistedSessionAdvance({
    cwd: args.cwd,
    maxSteps: args.maxSteps,
    resume: args.resume
  })
}

export async function handleSessionCards(args: {
  cwd: string
  refresh?: boolean
}) {
  const session = args.refresh
    ? await refreshPersistedSessionActionCards(args.cwd)
    : await readInteractiveSession(args.cwd)
  return {
    kind: 'session-cards',
    refreshed: Boolean(args.refresh),
    session: session
      ? {
          sessionId: session.sessionId,
          status: session.status,
          focusEntity: session.focusEntity,
          focusType: session.focusType
        }
      : null,
    actionCards: session?.lastActionCards || [],
    nextAction: session?.lastActionCards?.length
      ? 'Run `opengtm session do [n]` or use `/do [n]` inside the live session to execute a card.'
      : 'No action cards are currently persisted. Ask the harness “What should I do next?” first.'
  }
}

export async function handleSessionProgress(args: {
  cwd: string
  config: OpenGtmConfig | null
}) {
  const { approvals } = await loadSessionInventory(args.cwd, args.config)
  const session = deriveLiveInteractiveSession(await readInteractiveSession(args.cwd), approvals)
  return {
    kind: 'session-progress',
    session: session
      ? {
          sessionId: session.sessionId,
          status: session.status,
          focusEntity: session.focusEntity,
          focusType: session.focusType
        }
      : null,
    advance: session?.advance || null,
    history: session?.advanceHistory || [],
    nextAction: session?.advance?.status === 'waiting-for-approval'
      ? 'Resolve the surfaced approval, then run `opengtm session resume` to continue the active supervisor lane.'
      : session?.advance?.stopReason === 'approval-resolved'
        ? 'The approval gate is cleared. Run `opengtm session resume` to continue the active supervisor lane.'
      : 'Use `opengtm session advance`, `opengtm session resume`, or reopen `opengtm` to continue the runtime loop.'
  }
}

function normalizeSessionTranscriptLimit(limit?: number) {
  if (limit === undefined) return 20
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
    throw new Error('Transcript limit must be a positive integer.')
  }
  return limit
}

async function loadSessionInventory(
  cwd: string,
  config: OpenGtmConfig | null,
  daemonArg?: OpenGtmLocalDaemon
) {
  const { listRecords } = await import('@opengtm/storage')
  const daemon = daemonArg || createLocalDaemon({
    rootDir: path.join(cwd, config?.runtimeDir || DEFAULT_RUNTIME_DIR)
  })
  const traces = listRecords<any>(daemon.storage, 'run_traces')
  const approvals = listRecords<any>(daemon.storage, 'approval_requests')
  return { traces, approvals }
}

function deriveLiveInteractiveSession(
  session: OpenGtmInteractiveSession | null,
  approvals: Array<{ id?: string; status?: string }>
) {
  if (!session) return null
  if (session.advance.status !== 'waiting-for-approval') return session
  const stillPending = approvals.some((approval) =>
    approval.id === session.lastApprovalRequestId && approval.status === 'pending'
  )
  if (stillPending) return session
  return {
    ...session,
    advance: {
      ...session.advance,
      status: 'stopped' as const,
      stopReason: 'approval-resolved',
      updatedAt: new Date().toISOString()
    }
  }
}
