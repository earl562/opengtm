import type { OpenGtmRunTrace } from '@opengtm/types'

export interface OpenGtmAutoresearchPreset {
  name: string
  description: string
  defaultGoal: string
  scoringWeights: {
    relevance: number
    completeness: number
    coherence: number
  }
}

export const OPEN_GTM_AUTORESEARCH_PRESETS: OpenGtmAutoresearchPreset[] = [
  {
    name: 'default',
    description: 'Default autoresearch preset',
    defaultGoal: 'Research the given topic thoroughly',
    scoringWeights: { relevance: 0.4, completeness: 0.35, coherence: 0.25 }
  },
  {
    name: 'quick-scan',
    description: 'Quick scan for rapid information gathering',
    defaultGoal: 'Quickly scan for key information',
    scoringWeights: { relevance: 0.5, completeness: 0.2, coherence: 0.3 }
  },
  {
    name: 'deep-dive',
    description: 'Deep dive for comprehensive research',
    defaultGoal: 'Conduct comprehensive research',
    scoringWeights: { relevance: 0.25, completeness: 0.5, coherence: 0.25 }
  }
]

export function createAutoresearchScore(trace: OpenGtmRunTrace, preset: OpenGtmAutoresearchPreset) {
  const steps = trace.steps.length
  const hasOutput = trace.artifactIds.length > 0
  const hasErrors = trace.steps.some((s) => s.status === 'failed')

  const relevance = hasOutput ? 0.8 : 0.3
  const completeness = steps >= 3 ? 0.9 : 0.4
  const coherence = !hasErrors ? 0.85 : 0.5

  return {
    relevance: relevance * preset.scoringWeights.relevance,
    completeness: completeness * preset.scoringWeights.completeness,
    coherence: coherence * preset.scoringWeights.coherence,
    total: relevance * preset.scoringWeights.relevance +
           completeness * preset.scoringWeights.completeness +
           coherence * preset.scoringWeights.coherence
  }
}