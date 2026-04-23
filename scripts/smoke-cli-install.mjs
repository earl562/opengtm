import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const rootDir = process.cwd()
const tempDir = mkdtempSync(path.join(tmpdir(), 'opengtm-cli-smoke-'))
let cliTarballPath = ''

function parseNpmPackJson(raw) {
  const trimmed = String(raw || '').trim()
  const match = trimmed.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/)
  if (!match) {
    throw new Error('Unable to parse `npm pack --json` output.')
  }
  return JSON.parse(match[1])
}

try {
  const raw = execFileSync('npm', ['pack', '--json', '--workspace=opengtm'], {
    cwd: rootDir,
    encoding: 'utf8'
  })
  const packed = parseNpmPackJson(raw)
  cliTarballPath = path.join(rootDir, packed[0].filename)

  writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
    name: 'opengtm-cli-smoke',
    private: true
  }, null, 2))

  execFileSync('npm', ['install', cliTarballPath], {
    cwd: tempDir,
    stdio: 'inherit'
  })

  const output = execFileSync(
    path.join(tempDir, 'node_modules', '.bin', 'opengtm'),
    ['connector', 'list'],
    {
      cwd: tempDir,
      encoding: 'utf8'
    }
  )

  if (!output.includes('Connector inventory')) {
    throw new Error('CLI smoke install did not render the connector inventory output.')
  }
} finally {
  if (cliTarballPath) rmSync(cliTarballPath, { force: true })
  rmSync(tempDir, { recursive: true, force: true })
}
