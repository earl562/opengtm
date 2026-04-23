export interface OpenGtmCliFlags {
  [key: string]: string | boolean
}

export interface OpenGtmCliParsed {
  command: string
  subcommand: string
  flags: OpenGtmCliFlags
  tokens: string[]
  positional: string[]
  passthrough: string[]
}

export const OPEN_GTM_CLI_COMMANDS = [
  'help',
  'init',
  'status',
  'code',
  'research',
  'build',
  'approvals',
  'traces',
  'artifacts',
  'daemon',
  'workspace',
  'initiative',
  'journey',
  'record',
  'ingest',
  'source',
  'plan',
  'run',
  'opengtm',
  'handoff',
  'workflow',
  'inbox',
  'analytics',
  'conversation',
  'session',
  'connector',
  'policy',
  'skill',
  'agent',
  'auth',
  'tool',
  'provider',
  'models',
  'memory',
  'sandbox',
  'smoke',
  'evals',
  'feedback',
  'learn'
] as const

export type OpenGtmCliCommand = typeof OPEN_GTM_CLI_COMMANDS[number]

export function parseCliArgs(args: string[]): OpenGtmCliParsed {
  const flags: OpenGtmCliFlags = {}
  const tokens: string[] = []
  const passthroughIndex = args.indexOf('--')
  const parseableArgs = passthroughIndex >= 0 ? args.slice(0, passthroughIndex) : args
  const passthrough = passthroughIndex >= 0 ? args.slice(passthroughIndex + 1) : []

  for (let i = 0; i < parseableArgs.length; i++) {
    const arg = parseableArgs[i]
    if (arg === '--help' || arg === '-h') {
      flags.help = true
      continue
    }

    if (arg === '--json' || arg === '-j') {
      flags.json = true
      continue
    }

    if (arg.startsWith('--')) {
      const flagBody = arg.slice(2)
      const equalsIndex = flagBody.indexOf('=')
      if (equalsIndex >= 0) {
        const key = flagBody.slice(0, equalsIndex)
        const inlineValue = flagBody.slice(equalsIndex + 1)
        flags[key] = inlineValue
        continue
      }

      const key = flagBody

      const next = parseableArgs[i + 1]
      if (next && !next.startsWith('-')) {
        flags[key] = next
        i += 1
      } else {
        flags[key] = true
      }
      continue
    }

    if (arg.startsWith('-') && arg.length > 1) {
      for (const shortFlag of arg.slice(1).split('')) {
        flags[shortFlag] = true
      }
      continue
    }

    tokens.push(arg)
  }

  const command = tokens[0] || ''
  const subcommand = tokens[1] || ''
  const positional = tokens.slice(2)

  return { command, subcommand, flags, tokens, positional, passthrough }
}
