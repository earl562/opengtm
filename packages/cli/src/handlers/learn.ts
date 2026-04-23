import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createArtifactRecord } from '@opengtm/core'
import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { listRecords, upsertRecord, writeArtifactBlob } from '@opengtm/storage'
import type { OpenGtmConfig } from '../config.js'

function toSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export async function handleLearnReview(args: {
  cwd: string
  daemon: OpenGtmLocalDaemon
  config: OpenGtmConfig | null
}) {
  if (!args.config) {
    throw new Error('No workspace config found. Run "opengtm init" before generating learning reviews.')
  }

  const approvals = listRecords<any>(args.daemon.storage, 'approval_requests')
  const feedback = listRecords<any>(args.daemon.storage, 'feedback_records')
  const traces = listRecords<any>(args.daemon.storage, 'run_traces')

  const deniedApprovals = approvals.filter((item) => item.status === 'denied')
  const reviseFeedback = feedback.filter((item) => item.action === 'revise')
  const deniedFeedback = feedback.filter((item) => item.action === 'deny')

  const byWorkflow = [...feedback, ...traces]
    .reduce<Record<string, number>>((summary, item) => {
      const workflowId = item.workflowId || 'unknown'
      summary[workflowId] = (summary[workflowId] || 0) + 1
      return summary
    }, {})
  const dominantWorkflow = Object.entries(byWorkflow).sort((a, b) => b[1] - a[1])[0]?.[0] || 'workflow'

  const candidateSkillId = `learned_${toSlug(dominantWorkflow)}_${new Date().toISOString().slice(0, 10)}`
  const candidateDir = path.join(args.cwd, '.opengtm', 'skills', 'generated', candidateSkillId)
  const candidatePath = path.join(candidateDir, 'skill.json')

  const evidenceCount = deniedApprovals.length + reviseFeedback.length + deniedFeedback.length
  let generatedSkillPath: string | null = null
  if (evidenceCount > 0) {
    await mkdir(candidateDir, { recursive: true })
    const candidateSkill = {
      id: candidateSkillId,
      name: `Generated review skill for ${dominantWorkflow}`,
      version: '0.1.0-review',
      persona: 'cross',
      summary: `Review artifact generated from ${evidenceCount} negative or revision-oriented learning signals.`,
      triggers: [{ type: 'intent', match: `review ${dominantWorkflow}` }],
      preconditions: ['operator reviews the generated scaffold before promotion'],
      steps: [
        { id: 'collect-failures', description: 'Collect denied approvals and revision feedback' },
        { id: 'extract-patterns', description: 'Summarize repeated failure/revision causes' },
        { id: 'propose-fix', description: 'Emit a reviewable improvement procedure' }
      ],
      antiPatterns: ['do not auto-promote without human review'],
      validations: ['candidate links back to trace and feedback evidence'],
      requiredConnectors: [],
      tags: ['generated', 'review-required', 'learning'],
      composition: 'serial'
    }
    await writeFile(candidatePath, `${JSON.stringify(candidateSkill, null, 2)}\n`, 'utf-8')
    generatedSkillPath = candidatePath
  }

  const artifact = createArtifactRecord({
    workspaceId: args.config.workspaceId,
    initiativeId: args.config.initiativeId,
    kind: 'analysis',
    lane: 'research',
    title: 'Harness learning review',
    sourceIds: feedback.map((item) => item.id).filter(Boolean),
    provenance: ['opengtm:learning-review', `workflow:${dominantWorkflow}`]
  })
  const artifactPath = writeArtifactBlob(args.daemon.storage, {
    workspaceSlug: 'global',
    artifactId: artifact.id,
    content: {
      dominantWorkflow,
      approvals: {
        total: approvals.length,
        denied: deniedApprovals.length
      },
      feedback: {
        total: feedback.length,
        revise: reviseFeedback.length,
        deny: deniedFeedback.length
      },
      candidateSkillPath: generatedSkillPath,
      recommendation: evidenceCount > 0
        ? 'Review the generated skill scaffold and decide whether to promote it into the workspace skill set.'
        : 'No repeated negative signals detected yet; keep collecting feedback and approval outcomes.'
    }
  })
  upsertRecord(args.daemon.storage, 'artifacts', {
    ...artifact,
    contentRef: artifactPath
  } as any)

  return {
    kind: 'learn',
    action: 'review',
    dominantWorkflow,
    evidence: {
      deniedApprovals: deniedApprovals.length,
      reviseFeedback: reviseFeedback.length,
      deniedFeedback: deniedFeedback.length
    },
    generated: Boolean(generatedSkillPath),
    candidateSkillPath: generatedSkillPath,
    artifactId: artifact.id,
    artifactPath,
    nextAction: generatedSkillPath
      ? `Review ${generatedSkillPath} and ${artifactPath} before promoting any learned behavior.`
      : `Review ${artifactPath}; no candidate skill scaffold was generated yet.`
  }
}
