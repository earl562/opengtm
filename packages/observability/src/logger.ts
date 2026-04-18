import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface OpenGtmLogger {
  log: (event: Record<string, unknown>) => void
}

export function createJsonlLogger({ filePath }: { filePath: string }): OpenGtmLogger {
  mkdirSync(dirname(filePath), { recursive: true })
  return {
    log(event) {
      const line = JSON.stringify({
        at: new Date().toISOString(),
        ...event
      })
      writeFileSync(filePath, `${line}\n`, { encoding: 'utf8', flag: 'a' })
    }
  }
}
