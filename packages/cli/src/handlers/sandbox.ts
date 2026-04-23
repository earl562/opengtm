import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createArtifactRecord } from '@opengtm/core'
import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import type { OpenGtmConfig } from '../config.js'
import { getSandboxProfile, isSeatbeltAvailable, listSandboxProfiles } from '../catalog.js'
import { writeArtifactBlob, upsertRecord } from '@opengtm/storage'

const execFileAsync = promisify(execFile)

export async function handleSandbox(args: {
  cwd: string
  daemon: OpenGtmLocalDaemon
  config: OpenGtmConfig | null
  action: 'status' | 'profile-list' | 'explain' | 'run'
  profileId?: string
  passthrough?: string[]
  preview?: boolean
}) {
  const available = isSeatbeltAvailable()
  const currentProfileId = args.profileId || args.config?.preferences?.sandboxProfile || 'read-only'
  const profile = getSandboxProfile(currentProfileId)

  if (!profile && args.action !== 'profile-list') {
    throw new Error(`Unknown sandbox profile: ${currentProfileId}`)
  }

  if (args.action === 'status') {
    return {
      kind: 'sandbox',
      action: 'status',
      available,
      runtime: process.platform === 'darwin' ? 'seatbelt' : 'unsupported',
      currentProfile: currentProfileId,
      profiles: listSandboxProfiles().map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description
      })),
      nextAction: available
        ? 'Use `opengtm sandbox explain` to inspect the current policy or `opengtm sandbox run --profile read-only -- <command...>` to execute under Seatbelt.'
        : 'Seatbelt is not available in this environment. You can still inspect profiles and governance copy from this CLI.'
    }
  }

  if (args.action === 'profile-list') {
    return {
      kind: 'sandbox',
      action: 'profile-list',
      available,
      runtime: process.platform === 'darwin' ? 'seatbelt' : 'unsupported',
      currentProfile: currentProfileId,
      profiles: listSandboxProfiles().map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        restrictions: item.restrictions
      })),
      nextAction: 'Use `opengtm sandbox explain --profile <id>` to view the concrete Seatbelt policy.'
    }
  }

  if (args.action === 'explain') {
    return {
      kind: 'sandbox',
      action: 'explain',
      available,
      runtime: process.platform === 'darwin' ? 'seatbelt' : 'unsupported',
      currentProfile: profile?.id || currentProfileId,
      profile: {
        id: profile?.id || currentProfileId,
        label: profile?.label || currentProfileId,
        description: profile?.description || 'unknown',
        restrictions: profile?.restrictions || [],
        policy: profile?.policy || ''
      },
      nextAction: 'Use `opengtm sandbox run --preview --profile <id> -- <command...>` to preview execution before a real sandboxed run.'
    }
  }

  if (!args.passthrough || args.passthrough.length === 0) {
    throw new Error('Sandbox run requires a command after `--`.')
  }

  const command = args.passthrough
  const artifactPayload: Record<string, unknown> = {
    profile: profile?.id || currentProfileId,
    policy: profile?.policy || '',
    command,
    preview: Boolean(args.preview),
    available,
    runtime: process.platform === 'darwin' ? 'seatbelt' : 'unsupported'
  }

  if (args.preview || !available) {
    return {
      kind: 'sandbox',
      action: 'run',
      available,
      runtime: process.platform === 'darwin' ? 'seatbelt' : 'unsupported',
      currentProfile: profile?.id || currentProfileId,
      profile: {
        id: profile?.id || currentProfileId,
        label: profile?.label || currentProfileId,
        description: profile?.description || 'unknown',
        restrictions: profile?.restrictions || [],
        policy: profile?.policy || ''
      },
      command,
      status: args.preview ? 'preview' : 'unavailable',
      stdout: '',
      stderr: '',
      nextAction: args.preview
        ? 'Preview generated. Remove `--preview` to execute the command under Seatbelt.'
        : 'Seatbelt is unavailable in this environment.'
    }
  }

  try {
    const result = await execFileAsync('/usr/bin/sandbox-exec', ['-p', profile?.policy || '', ...command], {
      cwd: args.cwd
    })
    const artifactRef = await maybeWriteSandboxArtifact(args, {
      ...artifactPayload,
      status: 'completed',
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    })

    const response = {
      kind: 'sandbox',
      action: 'run',
      available,
      runtime: 'seatbelt',
      currentProfile: profile?.id || currentProfileId,
      profile: {
        id: profile?.id || currentProfileId,
        label: profile?.label || currentProfileId,
        description: profile?.description || 'unknown',
        restrictions: profile?.restrictions || [],
        policy: profile?.policy || ''
      },
      command,
      status: 'completed',
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      artifactId: artifactRef?.artifactId || null,
      artifactPath: artifactRef?.artifactPath || null,
      nextAction: 'Review the sandbox run output and linked artifact for governance evidence.'
    }

    return response
  } catch (error: any) {
    const stdout = String(error?.stdout || '').trim()
    const stderr = String(error?.stderr || '').trim()
    const message = String(error?.message || 'sandbox execution failed')
    const artifactRef = await maybeWriteSandboxArtifact(args, {
      ...artifactPayload,
      status: 'failed',
      error: message,
      stdout,
      stderr
    })

    return {
      kind: 'sandbox',
      action: 'run',
      available,
      runtime: 'seatbelt',
      currentProfile: profile?.id || currentProfileId,
      profile: {
        id: profile?.id || currentProfileId,
        label: profile?.label || currentProfileId,
        description: profile?.description || 'unknown',
        restrictions: profile?.restrictions || [],
        policy: profile?.policy || ''
      },
      command,
      status: stderr.includes('Operation not permitted') ? 'blocked' : 'failed',
      stdout,
      stderr,
      artifactId: artifactRef?.artifactId || null,
      artifactPath: artifactRef?.artifactPath || null,
      error: message,
      nextAction: stderr.includes('Operation not permitted')
        ? 'This environment blocked sandbox_apply. Retry from a normal macOS terminal outside nested sandboxing.'
        : 'Review stderr and the linked artifact, then retry with a simpler command or a different profile.'
    }
  }
}

async function maybeWriteSandboxArtifact(
  args: { daemon: OpenGtmLocalDaemon; config: OpenGtmConfig | null },
  payload: Record<string, unknown>
) {
  if (!args.config) return null

  const artifact = createArtifactRecord({
    workspaceId: args.config.workspaceId,
    initiativeId: args.config.initiativeId,
    kind: 'analysis',
    lane: 'ops-automate',
    title: `Sandbox run: ${Array.isArray(payload.command) ? payload.command.join(' ') : 'command'}`,
    provenance: ['opengtm:sandbox', `runtime:${process.platform}`]
  })
  const artifactPath = writeArtifactBlob(args.daemon.storage, {
    workspaceSlug: 'global',
    artifactId: artifact.id,
    content: payload
  })
  upsertRecord(args.daemon.storage, 'artifacts', {
    ...artifact,
    contentRef: artifactPath
  } as any)

  return {
    artifactId: artifact.id,
    artifactPath
  }
}
