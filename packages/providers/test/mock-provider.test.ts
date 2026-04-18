import { describe, expect, it } from 'vitest'
import { createMockProvider } from '../src/index.js'

describe('providers: mock', () => {
  it('is deterministic for same input', async () => {
    const provider = createMockProvider({ seed: 'x' })
    const a = await provider.generate({ prompt: 'hello' })
    const b = await provider.generate({ prompt: 'hello' })
    expect(a.text).toBe(b.text)
  })
})
