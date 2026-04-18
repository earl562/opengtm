import type { OpenGtmLocalDaemon } from '@opengtm/daemon'

export async function handleResearchRun(args: {
  daemon: OpenGtmLocalDaemon
  goal: string
  workspaceId?: string
  initiativeId?: string
}) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const workItem = args.daemon.createWorkItem({
    workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    ownerLane: 'research',
    title: `Research: ${args.goal}`,
    goal: args.goal
  })

  return { workItem }
}
