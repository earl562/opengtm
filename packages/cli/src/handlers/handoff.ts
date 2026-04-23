import { createLocalDaemon } from '@opengtm/daemon'
import { DEFAULT_RUNTIME_DIR, loadOpenGtmConfig } from '../config.js'
import { loadOrCreateInteractiveSession, readInteractiveSession, type OpenGtmInteractiveSession } from '../interactive.js'

export async function handleHandoff(args: {
  cwd: string
  sessionId?: string
  format?: 'markdown' | 'json' | 'text'
}): Promise<any> {
  const cwd = args.cwd
  const sessionId = args.sessionId || 'current'
  const format = args.format || 'markdown'
  
  const config = await loadOpenGtmConfig(cwd)
  const runtimeDir = config?.runtimeDir || DEFAULT_RUNTIME_DIR
  const daemon = createLocalDaemon({
    rootDir: `${cwd}/${runtimeDir}`
  })
  
  let session: OpenGtmInteractiveSession
  if (sessionId === 'current') {
    try {
      session = await loadOrCreateInteractiveSession(cwd)
    } catch (error) {
      return {
        kind: 'handoff.result',
        success: false,
        error: `No current interactive session found: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  } else {
    try {
      const current = await readInteractiveSession(cwd)
      if (!current || current.sessionId !== sessionId) {
        throw new Error('Only the current interactive session is addressable in this build.')
      }
      session = current
    } catch (error) {
      return {
        kind: 'handoff.result',
        success: false,
        error: `Session ${sessionId} not found: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  const handoffData = {
    sessionId: session.sessionId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    focusEntity: session.focusEntity,
    focusType: session.focusType,
    lastIntent: session.lastIntent,
    lastSpecialist: session.lastSpecialist,
    lastActionCards: session.lastActionCards,
    advance: session.advance,
    composeBuffer: session.composeBuffer,
    composeHistory: session.composeHistory,
    interactionMode: session.interactionMode,
    uiOverlay: session.uiOverlay,
    // Include runtime context
    lineage: session.lineage,
    leadLane: session.leadLane,
    accountLane: session.accountLane,
    dealLane: session.dealLane
  }

  let output: string
  if (format === 'json') {
    output = JSON.stringify(handoffData, null, 2)
  } else if (format === 'text') {
    output = `
Session Handoff
===============
Session ID: ${handoffData.sessionId}
Status: ${handoffData.status}
Focus: ${handoffData.focusEntity || 'none'} (${handoffData.focusType || 'none'})
Last Intent: ${handoffData.lastIntent || 'none'}
Last Specialist: ${handoffData.lastSpecialist || 'none'}
Last Action Cards: ${handoffData.lastActionCards.length}
Advance Status: ${handoffData.advance.status}
Compose Buffer: "${handoffData.composeBuffer}"
Compose History: ${handoffData.composeHistory.length} entries
Interaction Mode: ${handoffData.interactionMode}
UI Overlay: ${handoffData.uiOverlay}
    `.trim()
  } else {
    output = `
# Session Handoff

**Session ID:** \`${handoffData.sessionId}\`
**Status:** ${handoffData.status}
**Created:** ${new Date(handoffData.createdAt).toLocaleString()}
**Updated:** ${new Date(handoffData.updatedAt).toLocaleString()}

## Context
- **Focus Entity:** ${handoffData.focusEntity || 'none'}
- **Focus Type:** ${handoffData.focusType || 'none'}
- **Last Intent:** ${handoffData.lastIntent || 'none'}
- **Last Specialist:** ${handoffData.lastSpecialist || 'none'}

## Runtime State
- **Advance Status:** ${handoffData.advance.status}
- **Action Cards:** ${handoffData.lastActionCards.length} cards
- **Composition:** "${handoffData.composeBuffer}"
- **History:** ${handoffData.composeHistory.length} entries
- **Interaction Mode:** ${handoffData.interactionMode}
- **UI Overlay:** ${handoffData.uiOverlay}

## Lane States
- **Lead Lane:** ${JSON.stringify(handoffData.leadLane)}
- **Account Lane:** ${JSON.stringify(handoffData.accountLane)}
- **Deal Lane:** ${JSON.stringify(handoffData.dealLane)}

## Usage
To restore this session in a new terminal:
\`\`\bash
opengtm session new --session-id ${handoffData.sessionId} --handoff
\`\`\`
    `.trim()
  }

  return {
    kind: 'handoff.result',
    success: true,
    sessionId: handoffData.sessionId,
    format,
    data: handoffData,
    output
  }
}
