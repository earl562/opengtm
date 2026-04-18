#!/usr/bin/env node

import { runOpenGtmCli } from '../src/index.js'

const args = process.argv.slice(2)
process.exit(await runOpenGtmCli(args))