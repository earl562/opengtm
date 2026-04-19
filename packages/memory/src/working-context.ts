export interface WorkingContextEntry {
  key: string
  value: string
  pinned: boolean
  updatedAt: string
}

export interface WorkingContextSnapshot {
  entries: WorkingContextEntry[]
  totalChars: number
}

export interface WorkingContext {
  set(key: string, value: string, opts?: { pinned?: boolean }): void
  get(key: string): string | undefined
  delete(key: string): boolean
  has(key: string): boolean
  entries(): WorkingContextEntry[]
  snapshot(): WorkingContextSnapshot
  toPromptSection(): string
  clear(): void
  size(): number
}

export interface WorkingContextOptions {
  now?: () => Date
}

export function createWorkingContext(opts: WorkingContextOptions = {}): WorkingContext {
  const now = opts.now ?? (() => new Date())
  const store = new Map<string, WorkingContextEntry>()

  const self: WorkingContext = {
    set(key, value, setOpts) {
      store.set(key, {
        key,
        value,
        pinned: setOpts?.pinned ?? store.get(key)?.pinned ?? false,
        updatedAt: now().toISOString()
      })
    },
    get(key) {
      return store.get(key)?.value
    },
    delete(key) {
      const entry = store.get(key)
      if (!entry || entry.pinned) return false
      return store.delete(key)
    },
    has(key) {
      return store.has(key)
    },
    entries() {
      return Array.from(store.values()).sort((a, b) => a.key.localeCompare(b.key))
    },
    snapshot() {
      const entries = self.entries()
      const totalChars = entries.reduce((acc, e) => acc + e.key.length + e.value.length, 0)
      return { entries, totalChars }
    },
    toPromptSection() {
      const entries = self.entries()
      if (entries.length === 0) return ''
      const lines = entries.map((e) => `${e.key}: ${e.value}`)
      return `<working_context>\n${lines.join('\n')}\n</working_context>`
    },
    clear() {
      for (const [k, v] of store.entries()) {
        if (!v.pinned) store.delete(k)
      }
    },
    size() {
      return store.size
    }
  }

  return self
}
