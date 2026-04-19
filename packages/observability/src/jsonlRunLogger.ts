import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { redact } from './redact.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type JsonlRunLoggerOptions = {
  rootDir: string
  runId: string
  traceId?: string
}

export type JsonlRunLogger = {
  logFilePath: string
  log: (eventType: string, data?: unknown, level?: LogLevel) => void
  finalize: (summary?: unknown) => void
}

export function createJsonlRunLogger({ rootDir, runId, traceId }: JsonlRunLoggerOptions): JsonlRunLogger {
  const logsDir = join(rootDir, 'logs')
  const logFilePath = join(logsDir, `run-${runId}.jsonl`)

  let finalized = false

  const safeWriteLine = (obj: unknown) => {
    try {
      mkdirSync(logsDir, { recursive: true })
    } catch {
      // Best-effort: never throw from logger.
    }

    try {
      const line = `${JSON.stringify(obj)}\n`
      appendFileSync(logFilePath, line, { encoding: 'utf8' })
    } catch {
      // Best-effort: never throw from logger.
    }
  }

  const log: JsonlRunLogger['log'] = (eventType, data, level = 'info') => {
    if (finalized) return

    const entry = {
      ts: new Date().toISOString(),
      eventType,
      level,
      runId,
      ...(traceId ? { traceId } : {}),
      data: redact(data),
    }

    safeWriteLine(entry)
  }

  const finalize: JsonlRunLogger['finalize'] = (summary) => {
    if (finalized) return
    log('run.summary', summary, 'info')
    finalized = true
  }

  return { logFilePath, log, finalize }
}
