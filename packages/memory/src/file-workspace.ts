import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join, relative, resolve, normalize, sep } from 'node:path'

export interface FileWorkspaceOptions {
  rootDir: string
}

export interface FileWorkspaceEntry {
  path: string
  sizeBytes: number
  updatedAt: string
}

export interface FileWorkspaceSnapshot {
  rootDir: string
  entries: FileWorkspaceEntry[]
  totalBytes: number
}

export interface FileWorkspace {
  rootDir: string
  read(relativePath: string): string | null
  write(relativePath: string, content: string): string
  append(relativePath: string, content: string): string
  delete(relativePath: string): boolean
  list(subDir?: string): FileWorkspaceEntry[]
  snapshot(): FileWorkspaceSnapshot
  resolve(relativePath: string): string
}

export function createFileWorkspace(opts: FileWorkspaceOptions): FileWorkspace {
  const root = resolve(opts.rootDir)
  mkdirSync(root, { recursive: true })

  const assertInside = (relativePath: string): string => {
    if (!relativePath || relativePath === '/' || relativePath.startsWith('\\')) {
      throw new Error('FileWorkspace: path is empty or absolute')
    }
    const normalized = normalize(relativePath)
    if (normalized.startsWith('..') || normalized.includes(`..${sep}`) || normalized === '..') {
      throw new Error(`FileWorkspace: path escapes workspace root: ${relativePath}`)
    }
    const abs = resolve(root, normalized)
    if (!abs.startsWith(root + sep) && abs !== root) {
      throw new Error(`FileWorkspace: path escapes workspace root: ${relativePath}`)
    }
    return abs
  }

  const entryFrom = (absPath: string): FileWorkspaceEntry => {
    const stat = statSync(absPath)
    return {
      path: relative(root, absPath).split(sep).join('/'),
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString()
    }
  }

  const walk = (dir: string): string[] => {
    const out: string[] = []
    if (!existsSync(dir)) return out
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const stat = statSync(full)
      if (stat.isDirectory()) out.push(...walk(full))
      else out.push(full)
    }
    return out
  }

  return {
    rootDir: root,
    resolve(relativePath) {
      return assertInside(relativePath)
    },
    read(relativePath) {
      const abs = assertInside(relativePath)
      if (!existsSync(abs)) return null
      return readFileSync(abs, 'utf8')
    },
    write(relativePath, content) {
      const abs = assertInside(relativePath)
      mkdirSync(join(abs, '..'), { recursive: true })
      writeFileSync(abs, content, 'utf8')
      return abs
    },
    append(relativePath, content) {
      const abs = assertInside(relativePath)
      mkdirSync(join(abs, '..'), { recursive: true })
      writeFileSync(abs, content, { flag: 'a', encoding: 'utf8' })
      return abs
    },
    delete(relativePath) {
      const abs = assertInside(relativePath)
      if (!existsSync(abs)) return false
      rmSync(abs, { recursive: true, force: true })
      return true
    },
    list(subDir) {
      const base = subDir ? assertInside(subDir) : root
      if (!existsSync(base)) return []
      return walk(base).map(entryFrom)
    },
    snapshot() {
      const entries = walk(root).map(entryFrom)
      const totalBytes = entries.reduce((acc, e) => acc + e.sizeBytes, 0)
      return { rootDir: root, entries, totalBytes }
    }
  }
}
