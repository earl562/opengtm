import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonlRunLogger } from '../src/index.js'

describe('createJsonlRunLogger', () => {
  it('writes parseable JSONL with eventType per line', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-obs-'))
    const logger = createJsonlRunLogger({ rootDir, runId: 'r1', traceId: 't1' })

    logger.log('run.start', { ok: true })
    logger.finalize({ status: 'ok' })

    const contents = readFileSync(logger.logFilePath, 'utf8')
    const lines = contents
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    expect(lines.length).toBe(2)

    for (const line of lines) {
      const obj = JSON.parse(line)
      expect(obj.eventType).toBeTypeOf('string')
    }
  })

  it('redacts nested objects and arrays by key name', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-obs-'))
    const logger = createJsonlRunLogger({ rootDir, runId: 'r2' })

    logger.log('evt', {
      token: 't',
      nested: {
        apiKey: 'k',
        ok: true,
        arr: [{ password: 'p' }, { authorization: 'Bearer abc' }],
      },
    })

    const contents = readFileSync(logger.logFilePath, 'utf8')
    const [line] = contents
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const obj = JSON.parse(line)
    expect(obj.eventType).toBe('evt')
    expect(obj.data.token).toBe('[REDACTED]')
    expect(obj.data.nested.apiKey).toBe('[REDACTED]')
    expect(obj.data.nested.ok).toBe(true)
    expect(obj.data.nested.arr[0].password).toBe('[REDACTED]')
    expect(obj.data.nested.arr[1].authorization).toBe('[REDACTED]')
  })
})
