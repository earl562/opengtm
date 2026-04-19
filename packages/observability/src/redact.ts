const DEFAULT_REDACTION_KEY_RE = /token|secret|password|authorization|apiKey/i
const REDACTED = '[REDACTED]'

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function redact(value: unknown, keyRe: RegExp = DEFAULT_REDACTION_KEY_RE): unknown {
  const seen = new WeakSet<object>()

  const inner = (v: unknown): unknown => {
    if (typeof v === 'bigint') return v.toString()
    if (v === null || typeof v !== 'object') return v

    if (seen.has(v)) return '[Circular]'
    seen.add(v)

    if (v instanceof Error) {
      return {
        name: v.name,
        message: v.message,
        stack: v.stack,
      }
    }

    if (Array.isArray(v)) return v.map(inner)

    if (!isPlainObject(v)) return v

    const out: Record<string, unknown> = {}
    for (const [k, child] of Object.entries(v)) {
      out[k] = keyRe.test(k) ? REDACTED : inner(child)
    }
    return out
  }

  return inner(value)
}
