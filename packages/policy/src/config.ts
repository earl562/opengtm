import { readFile } from 'node:fs/promises'
import path from 'node:path'

export interface OpenGtmPolicyConfig {
  version: string
  requireApprovalForActions: string[]
  escalateForActions: string[]
}

export const DEFAULT_POLICY_CONFIG: OpenGtmPolicyConfig = {
  version: '1',
  requireApprovalForActions: ['write-repo', 'mutate-connector', 'send-message', 'browser-act'],
  escalateForActions: ['send-message', 'browser-act']
}

export async function loadPolicyConfig({
  cwd,
  fileName = 'policy.json'
}: {
  cwd: string
  fileName?: string
}): Promise<OpenGtmPolicyConfig> {
  try {
    const filePath = path.join(cwd, '.opengtm', fileName)
    const content = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(content)
    return {
      version: String(parsed.version || DEFAULT_POLICY_CONFIG.version),
      requireApprovalForActions: Array.isArray(parsed.requireApprovalForActions)
        ? parsed.requireApprovalForActions.map(String)
        : DEFAULT_POLICY_CONFIG.requireApprovalForActions,
      escalateForActions: Array.isArray(parsed.escalateForActions)
        ? parsed.escalateForActions.map(String)
        : DEFAULT_POLICY_CONFIG.escalateForActions
    }
  } catch {
    return DEFAULT_POLICY_CONFIG
  }
}
