export interface OpenGtmEvalDimension {
  name: string
  weight: number
  score: number
  maxScore: number
}

export interface OpenGtmScorecard {
  initiativeId: string
  dimensions: OpenGtmEvalDimension[]
  totalScore: number
  maxTotalScore: number
}

export interface OpenGtmEvalMetrics {
  workItemCount: number
  completedCount: number
  failedCount: number
  avgCycleTimeHours: number
  approvalRate: number
}

export const OPEN_GTM_EVAL_DIMENSIONS = [
  'completeness',
  'correctness',
  'efficiency',
  'safety',
  'maintainability'
] as const

export function createScorecard(initiativeId: string, metrics: OpenGtmEvalMetrics): OpenGtmScorecard {
  const completeness = metrics.completedCount / Math.max(metrics.workItemCount, 1)
  const correctness = metrics.failedCount === 0 ? 1 : 0.5
  const efficiency = Math.max(0, 1 - metrics.avgCycleTimeHours / 24)
  const safety = metrics.approvalRate
  const maintainability = 0.7

  const dimensions: OpenGtmEvalDimension[] = [
    { name: 'completeness', weight: 0.25, score: completeness * 100, maxScore: 100 },
    { name: 'correctness', weight: 0.25, score: correctness * 100, maxScore: 100 },
    { name: 'efficiency', weight: 0.2, score: efficiency * 100, maxScore: 100 },
    { name: 'safety', weight: 0.2, score: safety * 100, maxScore: 100 },
    { name: 'maintainability', weight: 0.1, score: maintainability * 100, maxScore: 100 }
  ]

  const totalScore = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)
  const maxTotalScore = dimensions.reduce((sum, d) => sum + d.maxScore * d.weight, 0)

  return {
    initiativeId,
    dimensions,
    totalScore,
    maxTotalScore
  }
}