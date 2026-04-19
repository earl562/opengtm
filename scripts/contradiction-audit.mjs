import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const checks = [
  {
    file: 'docs/package-map.md',
    mustInclude: [
      'public monorepo',
      'reference-only'
    ],
    mustNotInclude: [
      'The root repository remains private'
    ]
  },
  {
    file: 'docs/workflows.md',
    mustInclude: [
      'canonical scenario',
      'reference-only',
      'crm.roundtrip'
    ]
  },
  {
    file: 'README.md',
    mustInclude: [
      'OpenGTM is an externalization-driven',
      'docs/workflows.md'
    ]
  },
  {
    file: 'docs/release.md',
    mustInclude: [
      'npm run audit:contradictions'
    ]
  }
]

const failures = []

for (const check of checks) {
  const path = resolve(process.cwd(), check.file)
  const content = readFileSync(path, 'utf8')

  for (const needle of check.mustInclude ?? []) {
    if (!content.includes(needle)) {
      failures.push(`${check.file}: missing required text -> ${needle}`)
    }
  }

  for (const needle of check.mustNotInclude ?? []) {
    if (content.includes(needle)) {
      failures.push(`${check.file}: forbidden text still present -> ${needle}`)
    }
  }
}

if (failures.length > 0) {
  console.error('OpenGTM contradiction audit failed:\n')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('OpenGTM contradiction audit passed.')
