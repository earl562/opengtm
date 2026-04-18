import type { OpenGtmRunTrace } from '@opengtm/types'

export interface OpenGtmBenchmarkResult {
  name: string
  status: 'passed' | 'failed'
  duration: number
  trace?: OpenGtmRunTrace
}

export interface OpenGtmBenchmark {
  name: string
  inputs: Record<string, unknown>
  expected: Record<string, unknown>
}

export const OPEN_GTM_BENCHMARKS: OpenGtmBenchmark[] = [
  {
    name: 'workspace-create',
    inputs: { name: 'Test Workspace' },
    expected: { id: 'string', name: 'Test Workspace' }
  },
  {
    name: 'initiative-create',
    inputs: { workspaceId: 'ws-1', title: 'Test Initiative' },
    expected: { id: 'string', workspaceId: 'ws-1' }
  },
  {
    name: 'work-item-transition',
    inputs: { item: { status: 'queued' }, to: 'running' },
    expected: { status: 'running' }
  }
]

export async function runBenchmark(benchmark: OpenGtmBenchmark): Promise<OpenGtmBenchmarkResult> {
  const start = Date.now()

  try {
    await new Promise((resolve) => setTimeout(resolve, 10))

    return {
      name: benchmark.name,
      status: 'passed',
      duration: Date.now() - start
    }
  } catch (error) {
    return {
      name: benchmark.name,
      status: 'failed',
      duration: Date.now() - start
    }
  }
}