import { readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const rootDir = process.cwd()
const packagesDir = path.join(rootDir, 'packages')

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  const packageJsonPath = path.join(packagesDir, entry.name, 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  if (packageJson.private) continue

  execFileSync('npm', ['pack', '--dry-run', `--workspace=${packageJson.name}`], {
    cwd: rootDir,
    stdio: 'inherit'
  })
}
