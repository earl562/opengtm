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
  'memory',
  'evals',
  'feedback'
] as const

export type OpenGtmCliCommand = typeof OPEN_GTM_CLI_COMMANDS[number]

export function parseCliArgs(args: string[]): OpenGtmCliParsed {
  const flags: OpenGtmCliFlags = {}
  const tokens: string[] = []
  const positional: string[] = []

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      flags[key] = value || true
    } else if (arg.startsWith('-')) {
      flags[arg.slice(1)] = true
    } else {
      tokens.push(arg)
    }
  }

  const command = tokens[0] || 'opengtm'
  const subcommand = tokens[1] || ''

  for (let i = 2; i < tokens.length; i++) {
    positional.push(tokens[i])
  }

  return { command, subcommand, flags, positional }
}
