export interface OpenGtmCliFlags {
  [key: string]: string | boolean
}

export interface OpenGtmCliParsed {
  command: string
  subcommand: string
  flags: OpenGtmCliFlags
  positional: string[]
}

export const OPEN_GTM_CLI_COMMANDS = [
  'init',
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
  'handoff',
  'workflow',
  'inbox',
  'analytics',
  'conversation',
  'session',
  'connector',
  'policy',
  'skill',
  'memory'
] as const

export type OpenGtmCliCommand = typeof OPEN_GTM_CLI_COMMANDS[number]

export function parseCliArgs(args: string[]): OpenGtmCliParsed {
  const command = args[0] || 'help'
  const subcommand = args[1] || ''
  const flags: OpenGtmCliFlags = {}
  const positional: string[] = []

  for (let i = 2; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      flags[key] = value || true
    } else if (arg.startsWith('-')) {
      flags[arg.slice(1)] = true
    } else {
      positional.push(arg)
    }
  }

  return { command, subcommand, flags, positional }
}