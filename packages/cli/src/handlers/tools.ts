import { executeHarnessPrimitive, getHarnessPrimitive, listHarnessPrimitives, searchHarnessPrimitives } from '../tool-registry.js'

export async function handleTools(args: {
  action: 'list' | 'show' | 'search' | 'run'
  name?: string
  query?: string
  cwd?: string
  input?: Record<string, unknown>
}) {
  if (args.action === 'run') {
    if (!args.cwd) {
      throw new Error('Tool execution requires a cwd.')
    }
    if (!args.name) {
      throw new Error('Tool execution requires a primitive name.')
    }
    const result = await executeHarnessPrimitive({
      cwd: args.cwd,
      name: args.name,
      input: args.input || {}
    })
    return {
      kind: 'tools',
      action: 'run',
      primitive: getHarnessPrimitive(args.name),
      result,
      nextAction: `Primitive ${args.name} executed.`
    }
  }

  if (args.action === 'show') {
    const primitive = args.name ? getHarnessPrimitive(args.name) : null
    if (!primitive) {
      throw new Error(`Unknown primitive: ${args.name || 'missing name'}`)
    }
    return {
      kind: 'tools',
      action: 'show',
      primitive,
      nextAction: primitive.available
        ? 'This primitive is represented in the current harness surface.'
        : 'This primitive is listed for paper alignment but not yet exposed as a live runtime action.'
    }
  }

  const primitives = args.action === 'search'
    ? searchHarnessPrimitives(args.query || '')
    : listHarnessPrimitives()

  return {
    kind: 'tools',
    action: args.action,
    primitives,
    summary: {
      total: primitives.length,
      available: primitives.filter((primitive) => primitive.available).length,
      unavailable: primitives.filter((primitive) => !primitive.available).length
    },
    nextAction: args.action === 'search'
      ? `Search returned ${primitives.length} primitives.`
      : 'Use `opengtm tool show <primitive>` to inspect one primitive in detail.'
  }
}
