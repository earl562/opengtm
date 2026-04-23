import { executePrimitiveHarnessRequest } from '../interactive.js'

export async function handleCode(args: {
  cwd: string
  goal: string
}) {
  const output = await executePrimitiveHarnessRequest(args.cwd, args.goal)
  return {
    kind: 'code',
    goal: args.goal,
    output,
    nextAction: 'Review the primitive harness output or continue in the interactive shell.'
  }
}
