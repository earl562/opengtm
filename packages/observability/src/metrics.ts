export interface OpenGtmMetrics {
  increment: (name: string, value?: number) => void
  record: (name: string, value: number) => void
  snapshot: () => Record<string, number>
}

export function createMetrics(): OpenGtmMetrics {
  const counters = new Map<string, number>()
  return {
    increment(name: string, value = 1) {
      counters.set(name, (counters.get(name) || 0) + value)
    },
    record(name: string, value: number) {
      counters.set(name, value)
    },
    snapshot() {
      return Object.fromEntries(counters.entries())
    }
  }
}
