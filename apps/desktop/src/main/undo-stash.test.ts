import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyUndoSnapshot } from './undo-stash.js'

describe('copyUndoSnapshot', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-undo-stash-'))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('复制普通目录及其文件', async () => {
    const source = join(root, 'source')
    const stash = join(root, 'stash')
    await fs.mkdir(source)
    await fs.writeFile(join(source, 'SKILL.md'), '---\nname: demo\n---\n', 'utf8')

    await copyUndoSnapshot(source, stash)

    await expect(fs.readFile(join(stash, 'SKILL.md'), 'utf8')).resolves.toContain('name: demo')
  })

  it.runIf(process.platform === 'win32')('Windows 下复制目录链接时物化为普通目录', async () => {
    const target = join(root, 'target')
    const source = join(root, 'source')
    const stash = join(root, 'stash')
    await fs.mkdir(target)
    await fs.writeFile(join(target, 'SKILL.md'), '---\nname: demo\n---\n', 'utf8')
    await fs.symlink(target, source, 'junction')

    await copyUndoSnapshot(source, stash)

    const copied = await fs.lstat(stash)
    expect(copied.isDirectory()).toBe(true)
    expect(copied.isSymbolicLink()).toBe(false)
    await expect(fs.readFile(join(stash, 'SKILL.md'), 'utf8')).resolves.toContain('name: demo')
  })
})
