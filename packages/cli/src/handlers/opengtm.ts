import { runIntegratedRuntimeSmokeHarness } from '@opengtm/evals'

interface OpenGtmSmokeScenarioSummary {
  name: string
  description: string
  promptCount: number
  lane: string
  workflowState: string
  connectorStatus: string | null
  connectorStatuses: string[]
  approvalCount: number
  omittedPromptSections: string[]
}

export interface OpenGtmSmokeSummary {
  harness: 'integrated-runtime-smoke'
  scenarioCount: number
  approvalCount: number
  connectorStatusSummary: Record<string, number>
  nextAction: string
  scenarios: OpenGtmSmokeScenarioSummary[]
}

export async function handleOpenGtmSmoke(): Promise<OpenGtmSmokeSummary> {
  const results = await runIntegratedRuntimeSmokeHarness()

  const scenarios = results.map((result) => {
    const connectorStatuses = result.loopResult.steps
      .map((step) => step.connectorStatus)
      .filter((status): status is NonNullable<typeof status> => Boolean(status))
    const omittedPromptSections = Array.from(new Set(
      result.loopResult.steps.flatMap((step) => step.omittedPromptSections ?? [])
    ))

      return {
        name: result.name,
        description: result.description,
        promptCount: result.prompts.length,
        lane: result.loopResult.steps.at(-1)?.phase ?? 'unknown',
        workflowState: result.loopResult.status,
        connectorStatus: connectorStatuses.at(-1) ?? null,
        connectorStatuses,
      approvalCount: result.loopResult.approvalRequests?.length ?? 0,
      omittedPromptSections
    }
  })

  const connectorStatusSummary = scenarios.reduce<Record<string, number>>((summary, scenario) => {
    const key = scenario.connectorStatus ?? 'none'
    summary[key] = (summary[key] || 0) + 1
    return summary
  }, {})

  return {
    harness: 'integrated-runtime-smoke',
    scenarioCount: results.length,
    approvalCount: scenarios.reduce((count, scenario) => count + scenario.approvalCount, 0),
    connectorStatusSummary,
    nextAction: 'Use this smoke report to confirm harness governance before wiring live GTM workflows.',
    scenarios
  }
}
