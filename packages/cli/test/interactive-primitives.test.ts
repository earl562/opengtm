import { fileURLToPath } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCliRouter, handleInteractiveInput, loadOrCreateInteractiveSession } from '../src/index.js'

const srcDir = fileURLToPath(new URL('../src', import.meta.url))

describe('interactive primitive fallback', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('routes unknown input into heuristic primitive execution', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-heuristic-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Harness'])

    const session = await loadOrCreateInteractiveSession(cwd)
    const result = await handleInteractiveInput({
      cwd,
      line: `list files in ${srcDir}`,
      session,
      recordTranscript: false
    })

    expect(result.output).toContain('Primitive route')
    expect(result.output).toContain('primitive: list_files')
  })

  it('can use provider generation to plan a primitive route', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-interactive-planner-'))
    const router = createCliRouter({ cwd })
    await router(['init', '--name=Interactive Demo', '--initiative=Harness'])
    process.env.OPENAI_API_KEY = 'sk-test-openai-key'

    await router(['auth', 'login', 'openai-compatible', '--api-key-env=OPENAI_API_KEY', '--base-url=https://example.invalid/v1'])
    await router(['provider', 'use', 'openai-compatible'])
    await router(['models', 'use', 'custom'])

    global.fetch = (async () => ({
      ok: true,
      async json() {
        return {
          model: 'custom',
          choices: [
            {
              message: {
                content: JSON.stringify({ steps: [{ name: 'list_files', input: { path: srcDir } }] })
              }
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 10
          }
        }
      }
    })) as unknown as typeof global.fetch

    const session = await loadOrCreateInteractiveSession(cwd)
    const result = await handleInteractiveInput({
      cwd,
      line: 'help me inspect the source tree for the coding harness',
      session,
      recordTranscript: false
    })

    expect(result.output).toContain('Primitive agent loop')
    expect(result.output).toContain('turn 1: list_files')
  })
})
