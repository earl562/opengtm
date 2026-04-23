import path from 'node:path'
import { createLocalDaemon } from '@opengtm/daemon'
import { listRecords, readArtifactBlob } from '@opengtm/storage'
import type { OpenGtmApprovalRequest, OpenGtmArtifactRecord, OpenGtmMemoryRecord, OpenGtmRunTrace } from '@opengtm/types'
import { collectCanonicalRuntimeEvidence } from './canonical-crm.js'
import { DEFAULT_RUNTIME_DIR, loadOpenGtmConfig } from './config.js'
import { deriveAccountLanePhaseState, deriveDealLanePhaseState } from './customer-lanes.js'
import type { OpenGtmInteractiveSession } from './interactive.js'
import { deriveLeadLanePhaseState } from './lead-lane.js'

export interface OpenGtmSessionActionCard {
  title: string
  reason: string
  commandArgs: string[]
}

export interface OpenGtmSessionQueryResult {
  kind: 'session-query'
  queryType: 'entity-summary' | 'pending-summary' | 'latest-summary' | 'next-summary'
  specialist: string
  entity?: string | null
  summary: string[]
  recommendedActions?: string[]
  actionCards?: OpenGtmSessionActionCard[]
  traces?: Array<{ id: string; workflowId: string | null; status: string }>
  approvals?: Array<{ id: string; status: string; actionSummary: string }>
  artifacts?: Array<{ id: string; title: string; path: string | null }>
  memory?: Array<{ id: string; memoryType: string; path: string }>
  nextAction: string
}

export async function queryEntitySummary(cwd: string, session: OpenGtmInteractiveSession, entity: string | null): Promise<OpenGtmSessionQueryResult> {
  const { traces, approvals, artifacts, memory } = await loadRuntimeRecords(cwd)
  const normalizedEntity = entity?.toLowerCase() || null
  const preferDealFocus = session.focusType === 'deal'
  const leadDossier = hydrateLeadDossierData(resolveLeadDossierData(artifacts, memory, session, normalizedEntity), session)
  const dealArtifacts = artifacts
    .filter((artifact) => String(artifact.title || '').startsWith('Deal dossier:'))
    .filter((artifact) => {
      if (!normalizedEntity || preferDealFocus) return artifact.id === session.lastArtifactId || artifact.id === session.lastMemoryId
      const content = safeReadArtifactJson(artifact.contentRef)
      const opportunityName = String((content as any)?.opportunity?.name || '').toLowerCase()
      return opportunityName.includes(normalizedEntity)
    })
    .slice(0, 1)
  const dossierArtifacts = artifacts
    .filter((artifact) => String(artifact.title || '').startsWith('Account dossier:'))
    .filter((artifact) => {
      if ((!normalizedEntity && !preferDealFocus)) return artifact.id === session.lastArtifactId
      if (!normalizedEntity) return false
      const content = safeReadArtifactJson(artifact.contentRef)
      const dossierName = String((content as any)?.account?.name || '').toLowerCase()
      return dossierName.includes(normalizedEntity)
    })
    .slice(0, 1)
  const matchingArtifacts = artifacts
    .filter((artifact) => artifact.contentRef)
    .filter((artifact) => {
      if (!normalizedEntity) return artifact.id === session.lastArtifactId
      const titleMatch = artifact.title.toLowerCase().includes(normalizedEntity)
      const content = safeReadArtifact(artifact.contentRef)
      return titleMatch || content.toLowerCase().includes(normalizedEntity)
    })
    .slice(0, 3)

  const matchingMemory = memory
    .filter((record) => {
      if (!normalizedEntity) return record.id === session.lastMemoryId
      const content = safeReadArtifact(record.contentRef)
      return content.toLowerCase().includes(normalizedEntity)
    })
    .slice(0, 3)

  const latestTrace = traces.find((trace) => trace.id === session.lastTraceId) || traces[0] || null
  const primaryDealDossier = dealArtifacts[0] ? safeReadArtifactJson(dealArtifacts[0].contentRef) as any : null
  const primaryDossier = dossierArtifacts[0] ? safeReadArtifactJson(dossierArtifacts[0].contentRef) as any : null
  const actionCards = primaryDealDossier
    ? buildDealActionCardsForProgression({
        accountName: primaryDealDossier.account?.name || session.focusEntity || entity || 'this account',
        lastWorkflowId: session.lastWorkflowId,
        traceStatus: latestTrace?.status || null
      })
    : primaryDossier
      ? buildAccountActionCardsForProgression({
          accountName: primaryDossier.account?.name || session.focusEntity || entity || 'this account',
          healthScore: Number(primaryDossier.health?.score ?? 0),
          lastWorkflowId: session.lastWorkflowId,
          traceStatus: latestTrace?.status || null
        })
      : leadDossier
        ? buildLeadActionCardsForProgression({
            leadName: leadDossier.lead?.name || entity || session.lineage.lead?.entityName || 'this lead',
            lastWorkflowId: session.lastWorkflowId,
            traceStatus: latestTrace?.status || null,
            relationshipState: leadDossier.relationship?.state || null,
            doNotSend: Boolean(leadDossier.preflight?.doNotSend),
            recommendedApproach: leadDossier.recommendedApproach || null,
            latestOutreachSummary: leadDossier.preflight?.latestOutreachSummary || null
          })
        : (entity || session.lineage.lead?.entityName)
          ? buildLeadActionCards(entity || session.lineage.lead?.entityName || 'this lead')
        : buildIdleActionCards()
  const dealSummary = primaryDealDossier
    ? [
        `Current GTM deal focus: ${primaryDealDossier.opportunity?.name || entity || 'latest active deal'}`,
        `Deal phase: ${deriveDealLanePhaseState({
          lastWorkflowId: session.lastWorkflowId,
          traceStatus: latestTrace?.status || null
        }).phase}`,
        `Risk score: ${primaryDealDossier.riskScore ?? 'n/a'}`,
        `Top risk: ${Array.isArray(primaryDealDossier.risks) ? primaryDealDossier.risks[0] || 'none' : 'none'}`,
        `Next action: ${Array.isArray(primaryDealDossier.nextActions) ? primaryDealDossier.nextActions[0] || 'none' : 'none'}`
      ]
    : []
  const dossierSummary = primaryDossier
    ? [
        `Current GTM focus: ${primaryDossier.account?.name || entity || 'latest active focus'}`,
        `Account phase: ${deriveAccountLanePhaseState({
          lastWorkflowId: session.lastWorkflowId,
          traceStatus: latestTrace?.status || null,
          healthScore: Number(primaryDossier.health?.score ?? 0)
        }).phase}`,
        `Health score: ${primaryDossier.health?.score ?? 'n/a'} (${primaryDossier.health?.trend || 'n/a'})`,
        `Top risk: ${Array.isArray(primaryDossier.risks) ? primaryDossier.risks[0] || 'none' : 'none'}`,
        `Top opportunity: ${Array.isArray(primaryDossier.opportunities) ? primaryDossier.opportunities[0] || 'none' : 'none'}`
      ]
    : []
  const leadSummary = leadDossier
    ? [
        `Current lead motion: ${leadDossier.lead?.name || entity || session.focusEntity || 'latest active lead'}`,
        `Lead phase: ${deriveLeadLanePhaseState({
          lastWorkflowId: session.lastWorkflowId,
          traceStatus: latestTrace?.status || null,
          relationshipState: leadDossier.relationship?.state || null,
          doNotSend: Boolean(leadDossier.preflight?.doNotSend)
        }).label}`,
        `Relationship state: ${leadDossier.relationship?.state || 'n/a'}`,
        `Do-not-send: ${leadDossier.preflight?.doNotSend ? 'hold current send' : 'clear to draft'}`,
        `Recommended approach: ${leadDossier.recommendedApproach || 'n/a'}`
      ]
    : []
  return {
    kind: 'session-query',
    queryType: 'entity-summary',
    specialist: 'researcher',
    entity,
    summary: [
      ...(dealSummary.length > 0
        ? dealSummary
        : dossierSummary.length > 0
          ? dossierSummary
          : leadSummary.length > 0
            ? leadSummary
            : [entity
              ? `Current GTM focus: ${entity}`
              : 'No explicit GTM focus entity is set yet; summarizing the latest interactive context instead.']),
      `Matching artifacts: ${matchingArtifacts.length}`,
      `Matching memory records: ${matchingMemory.length}`,
      latestTrace ? `Latest trace: ${latestTrace.workflowId || 'lane-only'} / ${latestTrace.status}` : 'Latest trace: none'
    ],
    recommendedActions: actionCards.map((card) => formatActionCardSummary(card)),
    actionCards,
    traces: latestTrace ? [{ id: latestTrace.id, workflowId: latestTrace.workflowId, status: latestTrace.status }] : [],
    artifacts: [
      ...dealArtifacts,
      ...dossierArtifacts.filter((artifact) => artifact.id !== dealArtifacts[0]?.id),
      ...matchingArtifacts.filter((artifact) => artifact.id !== dossierArtifacts[0]?.id && artifact.id !== dealArtifacts[0]?.id)
    ].slice(0, 3).map((artifact) => ({
      id: artifact.id,
      title: artifact.title,
      path: artifact.contentRef
    })),
    memory: matchingMemory.map((record) => ({
      id: record.id,
      memoryType: record.memoryType,
      path: record.contentRef
    })),
      nextAction: leadDossier
        ? deriveLeadLanePhaseState({
            lastWorkflowId: session.lastWorkflowId,
            traceStatus: latestTrace?.status || null,
            relationshipState: leadDossier.relationship?.state || null,
            doNotSend: Boolean(leadDossier.preflight?.doNotSend)
          }).nextAction
        : matchingArtifacts.length > 0
          ? 'Inspect the referenced artifacts or ask for another GTM action such as drafting outreach.'
          : 'Research this entity first to populate richer GTM context.'
  }
}

export async function queryPendingSummary(cwd: string): Promise<OpenGtmSessionQueryResult> {
  const { approvals, traces } = await loadRuntimeRecords(cwd)
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending').slice(0, 5)
  const awaitingApprovalTraces = traces.filter((trace) => trace.status === 'awaiting-approval').slice(0, 5)
  const actionCards = pendingApprovals[0] ? buildApprovalActionCards(pendingApprovals[0]) : []

  return {
    kind: 'session-query',
    queryType: 'pending-summary',
    specialist: 'policy-checker',
    summary: [
      `Pending approvals: ${pendingApprovals.length}`,
      `Awaiting-approval traces: ${awaitingApprovalTraces.length}`
    ],
    recommendedActions: actionCards.map((card) => formatActionCardSummary(card)),
    actionCards,
    approvals: pendingApprovals.map((approval) => ({
      id: approval.id,
      status: approval.status,
      actionSummary: approval.actionSummary
    })),
    traces: awaitingApprovalTraces.map((trace) => ({
      id: trace.id,
      workflowId: trace.workflowId,
      status: trace.status
    })),
    nextAction: pendingApprovals.length > 0
      ? 'Use /approve or /deny to resolve the latest approval gate.'
      : 'No approvals are currently pending.'
  }
}

export async function queryLatestSummary(cwd: string, session: OpenGtmInteractiveSession): Promise<OpenGtmSessionQueryResult> {
  const { traces, approvals, artifacts } = await loadRuntimeRecords(cwd)
  const latestTrace = traces.find((trace) => trace.id === session.lastTraceId) || traces[0] || null
  const latestApproval = approvals.find((approval) => approval.id === session.lastApprovalRequestId) || approvals[0] || null
  const latestArtifact = artifacts.find((artifact) => artifact.id === session.lastArtifactId) || artifacts[0] || null
  const latestArtifactJson = latestArtifact?.contentRef ? safeReadArtifactJson(latestArtifact.contentRef) as any : null
  const actionCards = latestApproval?.status === 'pending'
    ? buildApprovalActionCards(latestApproval)
    : String(latestArtifact?.title || '').startsWith('Deal dossier:')
      ? buildDealActionCardsForProgression({
          accountName: latestArtifactJson?.account?.name || session.focusEntity || 'this account',
          lastWorkflowId: session.lastWorkflowId,
          traceStatus: latestTrace?.status || null
        })
      : String(latestArtifact?.title || '').startsWith('Account dossier:')
        ? buildAccountActionCardsForProgression({
            accountName: latestArtifactJson?.account?.name || session.focusEntity || 'this account',
            healthScore: Number(latestArtifactJson?.health?.score ?? 0),
            lastWorkflowId: session.lastWorkflowId,
            traceStatus: latestTrace?.status || null
          })
        : session.lineage.lead
          ? buildLeadActionCards(session.lineage.lead.entityName)
          : buildIdleActionCards()

  return {
    kind: 'session-query',
    queryType: 'latest-summary',
    specialist: 'supervisor',
    summary: [
      latestTrace ? `Latest trace: ${latestTrace.workflowId || 'lane-only'} / ${latestTrace.status}` : 'Latest trace: none',
      latestApproval ? `Latest approval: ${latestApproval.status} / ${latestApproval.actionSummary}` : 'Latest approval: none',
      latestArtifact ? `Latest artifact: ${latestArtifact.title}` : 'Latest artifact: none'
    ],
    recommendedActions: actionCards.map((card) => formatActionCardSummary(card)),
    actionCards,
    traces: latestTrace ? [{ id: latestTrace.id, workflowId: latestTrace.workflowId, status: latestTrace.status }] : [],
    approvals: latestApproval ? [{ id: latestApproval.id, status: latestApproval.status, actionSummary: latestApproval.actionSummary }] : [],
    artifacts: latestArtifact ? [{ id: latestArtifact.id, title: latestArtifact.title, path: latestArtifact.contentRef }] : [],
    nextAction: latestApproval?.status === 'pending'
      ? 'Resolve the latest approval or ask why it is blocked.'
      : 'Continue with another GTM task or inspect traces/artifacts for more detail.'
  }
}

export async function queryNextSummary(cwd: string, session: OpenGtmInteractiveSession): Promise<OpenGtmSessionQueryResult> {
  const runtime = await loadRuntimeRecords(cwd)
  const guidance = deriveRuntimeGuidance(runtime, session)
  return {
    kind: 'session-query',
    queryType: 'next-summary',
    specialist: 'supervisor',
    summary: guidance.summary,
    recommendedActions: guidance.recommendedActions,
    actionCards: guidance.actionCards,
    traces: guidance.trace ? [{
      id: guidance.trace.id,
      workflowId: guidance.trace.workflowId,
      status: guidance.trace.status
    }] : [],
    approvals: guidance.approval ? [{
      id: guidance.approval.id,
      status: guidance.approval.status,
      actionSummary: guidance.approval.actionSummary
    }] : [],
    artifacts: guidance.artifacts.map((artifact) => ({
      id: artifact.id,
      title: artifact.title,
      path: artifact.contentRef
    })),
    memory: guidance.memory.map((record) => ({
      id: record.id,
      memoryType: record.memoryType,
      path: record.contentRef
    })),
    nextAction: guidance.nextAction
  }
}

export function deriveRuntimeGuidance(
  runtime: Awaited<ReturnType<typeof loadRuntimeRecords>>,
  session: OpenGtmInteractiveSession
) {
  const approval = runtime.approvals.find((item) => item.status === 'pending' && item.id === session.lastApprovalRequestId)
    || runtime.approvals.find((item) => item.status === 'pending')
    || null
  const approvalLinkedTrace = approval
    ? runtime.traces.find((item) => item.workItemId === approval.workItemId) || null
    : null
  const trace = approvalLinkedTrace
    || runtime.traces.find((item) => item.id === session.lastTraceId)
    || runtime.traces[0]
    || null

  if (approval) {
    const actionCards = buildApprovalActionCards(approval)
    return {
      summary: [
        `Runtime is paused on approval: ${approval.actionSummary}`,
        trace ? `Blocked workflow: ${trace.workflowId || 'lane-only'} / ${trace.status}` : 'Blocked workflow: unavailable',
        `Current focus: ${session.focusEntity || 'none'}`
      ],
      recommendedActions: actionCards.map((card) => formatActionCardSummary(card)),
      actionCards,
      nextAction: 'Resolve the latest approval gate before starting a new GTM motion.',
      approval,
      trace,
      artifacts: collectCurrentArtifacts(runtime.artifacts, session),
      memory: collectCurrentMemory(runtime.memory, session)
    }
  }

  const dealArtifact = resolveDealDossierArtifact(runtime.artifacts, session)
  const dealDossier = dealArtifact ? safeReadArtifactJson(dealArtifact.contentRef) as any : null
  if (dealDossier) {
    const accountName = dealDossier.account?.name || session.focusEntity || 'this account'
    const dealPhase = deriveDealLanePhaseState({
      lastWorkflowId: session.lastWorkflowId,
      traceStatus: trace?.status || null
    })
    const actionCards = buildDealActionCardsForProgression({
      accountName,
      lastWorkflowId: session.lastWorkflowId,
      traceStatus: trace?.status || null
    })
    return {
      summary: [
        `Current deal motion: ${dealDossier.opportunity?.name || session.focusEntity || 'latest active deal'}`,
        `Deal phase: ${dealPhase.phase}`,
        `Risk score: ${dealDossier.riskScore ?? 'n/a'}`,
        `Top risk: ${Array.isArray(dealDossier.risks) ? dealDossier.risks[0] || 'none' : 'none'}`
      ],
      recommendedActions: actionCards.map((card) => formatActionCardSummary(card)),
      actionCards,
      nextAction: dealPhase.nextAction,
      approval: null,
      trace,
      artifacts: dealArtifact ? [dealArtifact] : [],
      memory: collectCurrentMemory(runtime.memory, session)
    }
  }

  const accountArtifact = resolveAccountDossierArtifact(runtime.artifacts, session)
  const accountDossier = accountArtifact ? safeReadArtifactJson(accountArtifact.contentRef) as any : null
  const leadDossier = hydrateLeadDossierData(resolveLeadDossierData(runtime.artifacts, runtime.memory, session, session.focusEntity), session)
  if (accountDossier) {
    const accountName = accountDossier.account?.name || session.focusEntity || 'this account'
    const healthScore = Number(accountDossier.health?.score ?? 0)
    const accountPhase = deriveAccountLanePhaseState({
      lastWorkflowId: session.lastWorkflowId,
      traceStatus: trace?.status || null,
      healthScore
    })
    const actionCards = buildAccountActionCardsForProgression({
      accountName,
      healthScore,
      lastWorkflowId: session.lastWorkflowId,
      traceStatus: trace?.status || null
    })
    return {
      summary: [
        `Current account motion: ${accountName}`,
        `Account phase: ${accountPhase.phase}`,
        `Health score: ${accountDossier.health?.score ?? 'n/a'} (${accountDossier.health?.trend || 'n/a'})`,
        `Top opportunity: ${Array.isArray(accountDossier.opportunities) ? accountDossier.opportunities[0] || 'none' : 'none'}`
      ],
      recommendedActions: actionCards.map((card) => formatActionCardSummary(card)),
      actionCards,
      nextAction: accountPhase.nextAction,
      approval: null,
      trace,
      artifacts: accountArtifact ? [accountArtifact] : [],
      memory: collectCurrentMemory(runtime.memory, session)
    }
  }

  if (session.lineage.lead || leadDossier) {
    const leadName = leadDossier?.lead?.name || session.lineage.lead?.entityName || 'this lead'
    const leadPhase = deriveLeadLanePhaseState({
      lastWorkflowId: session.lastWorkflowId,
      traceStatus: trace?.status || null,
      relationshipState: leadDossier?.relationship?.state || null,
      doNotSend: Boolean(leadDossier?.preflight?.doNotSend)
    })
    const actionCards = buildLeadActionCardsForProgression({
      leadName,
      lastWorkflowId: session.lastWorkflowId,
      traceStatus: trace?.status || null,
      relationshipState: leadDossier?.relationship?.state || null,
      doNotSend: Boolean(leadDossier?.preflight?.doNotSend),
      recommendedApproach: leadDossier?.recommendedApproach || null,
      latestOutreachSummary: leadDossier?.preflight?.latestOutreachSummary || null
    })
    return {
      summary: [
        `Current lead motion: ${leadName}`,
        `Lead phase: ${leadPhase.label}`,
        leadDossier ? `Relationship state: ${leadDossier.relationship?.state || 'n/a'}` : `Latest workflow: ${session.lastWorkflowId || 'none'}`,
        leadDossier ? `Do-not-send: ${leadDossier.preflight?.doNotSend ? 'hold current send' : 'clear to draft'}` : (trace ? `Latest trace: ${trace.workflowId || 'lane-only'} / ${trace.status}` : 'Latest trace: none'),
        leadDossier?.recommendedApproach ? `Recommended approach: ${leadDossier.recommendedApproach}` : null,
      ].filter(Boolean) as string[],
      recommendedActions: actionCards.map((card) => formatActionCardSummary(card)),
      actionCards,
      nextAction: leadPhase.nextAction,
      approval: null,
      trace,
      artifacts: collectCurrentArtifacts(runtime.artifacts, session),
      memory: collectCurrentMemory(runtime.memory, session)
    }
  }

  const idleCards = buildIdleActionCards()
  return {
    summary: [
      'No active GTM motion is hydrated yet.',
      trace ? `Latest trace: ${trace.workflowId || 'lane-only'} / ${trace.status}` : 'Latest trace: none',
      `Current provider posture: ${session.lastWorkflowId || 'idle'}`
    ],
    recommendedActions: idleCards.map((card) => formatActionCardSummary(card)),
    actionCards: idleCards,
    nextAction: 'Research an account or lead to establish the first GTM motion.',
    approval: null,
    trace,
    artifacts: collectCurrentArtifacts(runtime.artifacts, session),
    memory: collectCurrentMemory(runtime.memory, session)
  }
}

async function loadRuntimeRecords(cwd: string) {
  const config = await loadOpenGtmConfig(cwd)
  const daemon = createLocalDaemon({
    rootDir: path.join(cwd, config?.runtimeDir || DEFAULT_RUNTIME_DIR)
  })

  const traces = listRecords<OpenGtmRunTrace>(daemon.storage, 'run_traces')
    .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))
  const approvals = listRecords<OpenGtmApprovalRequest>(daemon.storage, 'approval_requests')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  const artifacts = listRecords<OpenGtmArtifactRecord>(daemon.storage, 'artifacts')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  const memory = listRecords<OpenGtmMemoryRecord>(daemon.storage, 'memory_records')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))

  return { traces, approvals, artifacts, memory }
}

function collectCurrentArtifacts(artifacts: OpenGtmArtifactRecord[], session: OpenGtmInteractiveSession) {
  const prioritized = [
    session.lastArtifactId,
    session.lineage.deal?.dossierArtifactId,
    session.lineage.account?.dossierArtifactId,
    session.lineage.lead?.lastArtifactId
  ].filter(Boolean) as string[]

  return artifacts
    .filter((artifact) => prioritized.includes(artifact.id))
    .slice(0, 3)
}

function collectCurrentMemory(memory: OpenGtmMemoryRecord[], session: OpenGtmInteractiveSession) {
  const prioritized = [
    session.lastMemoryId,
    session.lineage.deal?.dossierMemoryId,
    session.lineage.account?.dossierMemoryId,
    session.lineage.lead?.lastMemoryId
  ].filter(Boolean) as string[]

  return memory
    .filter((record) => prioritized.includes(record.id))
    .slice(0, 3)
}

function resolveAccountDossierArtifact(artifacts: OpenGtmArtifactRecord[], session: OpenGtmInteractiveSession) {
  return artifacts.find((artifact) => artifact.id === session.lineage.account?.dossierArtifactId)
    || artifacts.find((artifact) => artifact.id === session.lastArtifactId && String(artifact.title || '').startsWith('Account dossier:'))
    || null
}

function resolveDealDossierArtifact(artifacts: OpenGtmArtifactRecord[], session: OpenGtmInteractiveSession) {
  return artifacts.find((artifact) => artifact.id === session.lineage.deal?.dossierArtifactId)
    || artifacts.find((artifact) => artifact.id === session.lastArtifactId && String(artifact.title || '').startsWith('Deal dossier:'))
    || null
}

function resolveLeadDossierData(
  artifacts: OpenGtmArtifactRecord[],
  memory: OpenGtmMemoryRecord[],
  session: OpenGtmInteractiveSession,
  entity: string | null | undefined
) {
  const prioritizedArtifact = artifacts.find((artifact) =>
    String(artifact.title || '').startsWith('Lead dossier:')
    && (
      artifact.id === session.lastArtifactId
      || artifact.id === session.lineage.lead?.lastArtifactId
      || artifact.sourceIds?.some((sourceId: string) => session.lineage.lead?.sourceArtifactIds.includes(sourceId))
      || String(artifact.title || '').toLowerCase().includes(String(entity || '').toLowerCase())
    )
  )
  if (prioritizedArtifact?.contentRef) {
    return safeReadArtifactJson(prioritizedArtifact.contentRef) as any
  }
  const prioritizedMemory = memory.find((record) =>
    record.id === session.lastMemoryId
    || record.id === session.lineage.lead?.lastMemoryId
    || record.retrievalHints?.includes('lead-dossier')
  )
  return prioritizedMemory?.contentRef ? safeReadArtifactJson(prioritizedMemory.contentRef) as any : null
}

function hydrateLeadDossierData(leadDossier: any, session: OpenGtmInteractiveSession) {
  if (!leadDossier || !session.lineage.lead) return leadDossier
  const runtimeEvidence = collectCanonicalRuntimeEvidence({
    dbFile: session.lineage.lead.crmDbFile,
    leadId: session.lineage.lead.lead.id,
    accountId: leadDossier.account?.crmAccountId || null
  })
  const outreachSubjects = [
    ...runtimeEvidence.activities.lead.map((activity) => activity.subject),
    ...runtimeEvidence.activities.account.map((activity) => activity.subject)
  ].filter((subject) => /approved outreach draft|outreach|follow-up/i.test(subject))
  const outreachTypes = [
    ...runtimeEvidence.activities.lead.map((activity) => activity.type),
    ...runtimeEvidence.activities.account.map((activity) => activity.type)
  ]
  const doNotSend = outreachSubjects.length > 0 && outreachTypes.includes('email')
  return {
    ...leadDossier,
    preflight: {
      ...leadDossier.preflight,
      doNotSend,
      recentOutreachCount: outreachSubjects.length,
      latestOutreachSummary: outreachSubjects[0] || leadDossier.preflight?.latestOutreachSummary || null,
      blockedReason: doNotSend
        ? 'Recent outbound activity already exists in CRM evidence; prefer follow-through over another first-touch send.'
        : null
    }
  }
}

function buildApprovalActionCards(approval: OpenGtmApprovalRequest) {
  return [
    createActionCard(
      'Approve blocked motion',
      'Resume the paused GTM motion from the current approval gate.',
      ['approvals', 'approve', approval.id]
    ),
    createActionCard(
      'Deny blocked motion',
      'Stop the paused GTM motion and keep the operator in control.',
      ['approvals', 'deny', approval.id]
    ),
    createActionCard(
      'Inspect trace evidence',
      'Review the latest runtime evidence before deciding.',
      ['traces', 'list']
    )
  ]
}

function buildDealActionCards(accountName: string) {
  return [
    createActionCard(
      'Generate account brief',
      'Turn the deal-risk context into an AE-ready account brief.',
      ['workflow', 'run', 'ae.account_brief', `Account brief for ${accountName}`]
    ),
    createActionCard(
      'Re-check deal risk',
      'Refresh the current deal-risk assessment using the latest dossier lineage.',
      ['workflow', 'run', 'ae.deal_risk_scan', `Deal risk for ${accountName}`]
    ),
    createActionCard(
      'Inspect runtime artifacts',
      'Review the latest dossier and trace artifacts before acting.',
      ['artifacts', 'list']
    )
  ]
}

function buildAccountActionCards(accountName: string, healthScore: number) {
  const primaryWorkflowCard = healthScore >= 75
    ? createActionCard(
        'Run expansion-signal workflow',
        'Follow the healthy account signal into an expansion motion.',
        ['workflow', 'run', 'ae.expansion_signal', `Expansion signal for ${accountName}`]
      )
    : createActionCard(
        'Run renewal-prep workflow',
        'Follow the account-health signal into a renewal-prep motion.',
        ['workflow', 'run', 'cs.renewal_prep', `Renewal prep for ${accountName}`]
      )

  return [
    primaryWorkflowCard,
    createActionCard(
      'Generate account brief',
      'Summarize the current customer context for AE review.',
      ['workflow', 'run', 'ae.account_brief', `Account brief for ${accountName}`]
    ),
    createActionCard(
      'Scan deal risk',
      'Branch the account motion into a deal-risk assessment.',
      ['workflow', 'run', 'ae.deal_risk_scan', `Deal risk for ${accountName}`]
    )
  ]
}

function buildDealActionCardsForProgression(args: {
  accountName: string
  lastWorkflowId: string | null
  traceStatus: string | null
}) {
  if (args.traceStatus === 'awaiting-approval') {
    return buildDealActionCards(args.accountName)
  }

  if (args.lastWorkflowId === 'ae.account_brief') {
    return [
      createActionCard(
        'Inspect runtime artifacts',
        'Review the latest deal dossier and trace artifacts before the next move.',
        ['artifacts', 'list']
      ),
      createActionCard(
        'Re-check deal risk',
        'Refresh the current deal-risk assessment using the latest dossier lineage.',
        ['workflow', 'run', 'ae.deal_risk_scan', `Deal risk for ${args.accountName}`]
      ),
      createActionCard(
        'Generate account brief',
        'Produce another AE-ready account brief after updated evidence arrives.',
        ['workflow', 'run', 'ae.account_brief', `Account brief for ${args.accountName}`]
      )
    ]
  }

  return buildDealActionCards(args.accountName)
}

function buildAccountActionCardsForProgression(args: {
  accountName: string
  healthScore: number
  lastWorkflowId: string | null
  traceStatus: string | null
}) {
  if (args.traceStatus === 'awaiting-approval') {
    return buildAccountActionCards(args.accountName, args.healthScore)
  }

  if (args.lastWorkflowId === 'cs.renewal_prep' || args.lastWorkflowId === 'ae.expansion_signal') {
    return [
      createActionCard(
        'Generate account brief',
        'Summarize the current customer context for AE review after the follow-up motion.',
        ['workflow', 'run', 'ae.account_brief', `Account brief for ${args.accountName}`]
      ),
      createActionCard(
        'Scan deal risk',
        'Branch the account motion into a deal-risk assessment.',
        ['workflow', 'run', 'ae.deal_risk_scan', `Deal risk for ${args.accountName}`]
      ),
      createActionCard(
        'Refresh account health',
        'Recompute the account health after the latest follow-up motion.',
        ['workflow', 'run', 'cs.health_score', `Account health for ${args.accountName}`]
      )
    ]
  }

  if (args.lastWorkflowId === 'ae.account_brief') {
    return [
      createActionCard(
        'Scan deal risk',
        'Branch the account motion into a deal-risk assessment after the brief.',
        ['workflow', 'run', 'ae.deal_risk_scan', `Deal risk for ${args.accountName}`]
      ),
      createActionCard(
        'Refresh account health',
        'Recompute the account health after the brief.',
        ['workflow', 'run', 'cs.health_score', `Account health for ${args.accountName}`]
      ),
      createActionCard(
        'Inspect runtime artifacts',
        'Review the latest customer artifacts before taking another motion.',
        ['artifacts', 'list']
      )
    ]
  }

  return buildAccountActionCards(args.accountName, args.healthScore)
}

function buildLeadActionCards(leadName: string, context?: {
  relationshipState?: string | null
  recommendedApproach?: string | null
  doNotSend?: boolean
  latestOutreachSummary?: string | null
}) {
  const draftReason = context?.doNotSend
    ? `Hold the first-touch send because recent outreach exists (${context.latestOutreachSummary || 'recent outbound evidence'}); inspect the trace or continue with follow-through instead.`
    : context?.recommendedApproach
      ? `${context.recommendedApproach}`
      : 'Continue the lead motion into an approval-gated outbound draft.'
  return [
    createActionCard(
      'Draft outreach',
      draftReason,
      ['workflow', 'run', 'sdr.outreach_compose', `Draft outreach for ${leadName}`]
    ),
    createActionCard(
      'Build outreach sequence',
      context?.relationshipState === 'customer'
        ? 'Expand the customer motion into a sequenced enablement or expansion follow-up plan.'
        : 'Expand the lead motion into a sequenced follow-up plan.',
      ['workflow', 'run', 'sdr.outreach_sequence', `Outreach sequence for ${leadName}`]
    ),
    createActionCard(
      'Run canonical workflow',
      'Exercise the full canonical GTM roundtrip on the active lead.',
      ['workflow', 'run', 'crm.roundtrip', `${leadName}`]
    )
  ]
}

function buildLeadActionCardsForProgression(args: {
  leadName: string
  lastWorkflowId: string | null
  traceStatus: string | null
  relationshipState?: string | null
  doNotSend?: boolean
  recommendedApproach?: string | null
  latestOutreachSummary?: string | null
}) {
  if (args.traceStatus === 'awaiting-approval') {
    return buildLeadActionCards(args.leadName, args)
  }

  if (args.lastWorkflowId === 'sdr.outreach_compose') {
    return [
      createActionCard(
        'Build outreach sequence',
        args.doNotSend
          ? `Recent outreach is already on record (${args.latestOutreachSummary || 'see latest outbound activity'}); continue with sequenced follow-up instead of another first-touch draft.`
          : 'Expand the drafted outreach into a sequenced follow-up plan.',
        ['workflow', 'run', 'sdr.outreach_sequence', `Outreach sequence for ${args.leadName}`]
      ),
      createActionCard(
        'Run canonical workflow',
        'Exercise the full canonical GTM roundtrip on the active lead.',
        ['workflow', 'run', 'crm.roundtrip', `${args.leadName}`]
      ),
      createActionCard(
        'Research a fresh angle',
        'Refresh lead context before another outbound iteration.',
        ['workflow', 'run', 'sdr.lead_research', `Research ${args.leadName}`]
      )
    ]
  }

  if (args.lastWorkflowId === 'sdr.outreach_sequence') {
    return [
      createActionCard(
        'Run canonical workflow',
        'Exercise the full canonical GTM roundtrip on the active lead.',
        ['workflow', 'run', 'crm.roundtrip', `${args.leadName}`]
      ),
      createActionCard(
        'Research a fresh angle',
        'Refresh lead context before another outbound iteration.',
        ['workflow', 'run', 'sdr.lead_research', `Research ${args.leadName}`]
      ),
      createActionCard(
        'Draft outreach',
        'Prepare a new approval-gated outbound draft.',
        ['workflow', 'run', 'sdr.outreach_compose', `Draft outreach for ${args.leadName}`]
      )
    ]
  }

  return buildLeadActionCards(args.leadName, args)
}

function buildIdleActionCards() {
  return [
    createActionCard(
      'Research a lead',
      'Start the runtime with a concrete lead research motion.',
      ['workflow', 'run', 'sdr.lead_research', 'Research Acme']
    ),
    createActionCard(
      'Check account health',
      'Start the runtime with a customer-health motion.',
      ['workflow', 'run', 'cs.health_score', 'Account health for Acme']
    ),
    createActionCard(
      'Inspect control plane',
      'Review provider, sandbox, and runtime posture before acting.',
      ['status']
    )
  ]
}

function createActionCard(title: string, reason: string, commandArgs: string[]): OpenGtmSessionActionCard {
  return { title, reason, commandArgs }
}

function formatActionCardSummary(card: OpenGtmSessionActionCard) {
  return `${card.title} (${renderCommandArgs(card.commandArgs)})`
}

function renderCommandArgs(commandArgs: string[]) {
  return `opengtm ${commandArgs.join(' ')}`
}

function safeReadArtifact(path: string | null) {
  if (!path) return ''
  try {
    const value = readArtifactBlob(path)
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return ''
  }
}

function safeReadArtifactJson(path: string | null) {
  if (!path) return null
  try {
    return readArtifactBlob(path, { parseJson: true })
  } catch {
    return null
  }
}
