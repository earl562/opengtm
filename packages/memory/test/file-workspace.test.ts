import { describe, expect, it, beforeEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileWorkspace } from '../src/index.js'

describe('memory: file-workspace', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'opengtm-fw-'))
  })

  it('creates root dir on construction', () => {
    const fw = createFileWorkspace({ rootDir: join(root, 'nested') })
    expect(existsSync(fw.rootDir)).toBe(true)
  })

  it('write then read roundtrips', () => {
    const fw = createFileWorkspace({ rootDir: root })
    fw.write('notes.md', 'hello')
    expect(fw.read('notes.md')).toBe('hello')
  })

  it('read of missing path returns null', () => {
    const fw = createFileWorkspace({ rootDir: root })
    expect(fw.read('missing.txt')).toBe(null)
  })

  it('write creates parent dirs', () => {
    const fw = createFileWorkspace({ rootDir: root })
    fw.write('deep/nested/file.txt', 'x')
    expect(existsSync(join(root, 'deep/nested/file.txt'))).toBe(true)
  })

  it('append concatenates', () => {
    const fw = createFileWorkspace({ rootDir: root })
    fw.write('log.txt', 'a')
    fw.append('log.txt', 'b')
    expect(fw.read('log.txt')).toBe('ab')
  })

  it('delete removes files and returns true', () => {
    const fw = createFileWorkspace({ rootDir: root })
    fw.write('x.txt', 'y')
    expect(fw.delete('x.txt')).toBe(true)
    expect(fw.read('x.txt')).toBe(null)
    expect(fw.delete('x.txt')).toBe(false)
  })

  it('rejects path traversal with ..', () => {
    const fw = createFileWorkspace({ rootDir: root })
    expect(() => fw.write('../escape.txt', 'x')).toThrow()
    expect(() => fw.read('../etc/passwd')).toThrow()
  })

  it('rejects absolute paths', () => {
    const fw = createFileWorkspace({ rootDir: root })
    expect(() => fw.write('/etc/hosts', 'x')).toThrow()
  })

  it('list returns files with metadata', () => {
    const fw = createFileWorkspace({ rootDir: root })
    fw.write('a.txt', '1')
    fw.write('b/c.txt', '22')
    const entries = fw.list()
    const paths = entries.map((e) => e.path).sort()
    expect(paths).toEqual(['a.txt', 'b/c.txt'])
  })

  it('snapshot reports totalBytes', () => {
    const fw = createFileWorkspace({ rootDir: root })
    fw.write('a.txt', 'abcd')
    fw.write('b.txt', 'ef')
    const snap = fw.snapshot()
    expect(snap.totalBytes).toBe(6)
    expect(snap.entries.length).toBe(2)
  })

  it('writes real bytes to disk', () => {
    const fw = createFileWorkspace({ rootDir: root })
    const abs = fw.write('x.txt', 'on-disk')
    expect(readFileSync(abs, 'utf8')).toBe('on-disk')
  })
})
