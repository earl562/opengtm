import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const rootDir = process.cwd()
const tempDir = mkdtempSync(path.join(tmpdir(), 'opengtm-cli-smoke-'))
const packagesDir = path.join(rootDir, 'packages')
const tarballs = []

try {
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const packageJson = JSON.parse(
      readFileSync(path.join(packagesDir, entry.name, 'package.json'), 'utf8')
    )
    if (packageJson.private) continue

    const raw = execFileSync('npm', ['pack', '--json', `--workspace=${packageJson.name}`], {
      cwd: rootDir,
      encoding: 'utf8'
    })
    const packed = JSON.parse(raw)
    tarballs.push(path.join(rootDir, packed[0].filename))
  }

  writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
    name: 'opengtm-cli-smoke',
    private: true
  }, null, 2))

  execFileSync('npm', ['install', ...tarballs], {
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
  for (const tarball of tarballs) {
    rmSync(tarball, { force: true })
  }
  rmSync(tempDir, { recursive: true, force: true })
}
