import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonlLogger } from '../src/logger.js'

describe('observability: logger', () => {
  it('writes jsonl entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opengtm-log-'))
    const filePath = join(dir, 'run.jsonl')
    const logger = createJsonlLogger({ filePath })
    logger.log({ type: 'test', value: 1 })
    const content = readFileSync(filePath, 'utf8')
    expect(content).toContain('"type":"test"')
  })
})
