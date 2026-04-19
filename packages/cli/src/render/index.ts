import type { OpenGtmCliParsed } from '../parse.js'
import { renderHumanOutput } from './human.js'
import { renderJsonOutput } from './json.js'

export function renderCliOutput(args: {
  parsed: OpenGtmCliParsed
  result: unknown
}): string {
  if (args.parsed.flags.json) {
    return renderJsonOutput(args.result)
  }

  return renderHumanOutput(args.parsed, args.result)
}
