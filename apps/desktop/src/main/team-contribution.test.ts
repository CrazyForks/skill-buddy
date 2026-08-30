import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  shell: { openPath: async () => '' },
}))

const { runTeamContributionCommand } = await import('./team-contribution')

const execFileAsync = promisify(execFile)
const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })))
})

/** 复刻 teamContributionDiff 中按固定列切割状态码的解析方式。 */
function parsePorcelain(status: string): string[] {
  return status.split('\n').flatMap((line) => {
    if (!line.trim()) return []
    const raw = line.slice(3).trim()
    return [raw.includes(' -> ') ? raw.split(' -> ').at(-1)! : raw]
  })
}

describe('runTeamContributionCommand', () => {
  it('keeps the leading column of git status so paths are not shifted', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-contribution-status-'))
    cleanup.push(root)
    const git = (...args: string[]) => execFileAsync('git', args, { cwd: root })
    await git('init', '-q', '.')
    await git('config', 'user.email', 'test@example.com')
    await git('config', 'user.name', 'test')
    await fs.mkdir(join(root, 'instructions'))
    await fs.writeFile(join(root, 'instructions', 'base.md'), 'first\n', 'utf8')
    await git('add', '--all')
    await git('commit', '-qm', 'init')

    // 仅改工作区不暂存，状态码首列为空，整行以空格开头。
    await fs.writeFile(join(root, 'instructions', 'base.md'), 'first\nsecond\n', 'utf8')
    await fs.writeFile(join(root, 'instructions', 'added.md'), 'new\n', 'utf8')
    await git('add', '--intent-to-add', '--all')

    const preserved = await runTeamContributionCommand(
      'git', ['status', '--porcelain'], root, 30_000, true,
    )
    expect(parsePorcelain(preserved).sort()).toEqual([
      'instructions/added.md',
      'instructions/base.md',
    ])

    // 全局 trim 会削掉首行的状态码空列，使该行路径整体错位一格。
    const trimmed = await runTeamContributionCommand('git', ['status', '--porcelain'], root)
    const shifted = parsePorcelain(trimmed)
    expect(shifted).not.toEqual(parsePorcelain(preserved))
    expect(shifted.some((path) => path.startsWith('nstructions/'))).toBe(true)
  })
})

/**
 * syncTeamContributionBase 依赖模块内部的工作区注册表，这里直接复刻它的 git 序列，
 * 验证浅克隆下「保留改动地重建基线」这一核心行为。
 */
async function syncBase(root: string, baseBranch: string): Promise<{ conflicted: boolean }> {
  const run = (...args: string[]) => runTeamContributionCommand('git', args, root, 30_000)
  await run('fetch', '--depth', '1', 'origin', baseBranch)
  const dirty = Boolean(await run('status', '--porcelain'))
  if (dirty) await run('stash', 'push', '--include-untracked', '--message', 'skillbuddy-sync')
  await run('reset', '--hard', `origin/${baseBranch}`)
  if (!dirty) return { conflicted: false }
  try {
    await run('stash', 'pop')
    return { conflicted: false }
  } catch {
    return { conflicted: true }
  }
}

async function createRemoteAndClone(): Promise<{ remote: string; work: string }> {
  const remote = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-remote-'))
  cleanup.push(remote)
  const rgit = (...args: string[]) => execFileAsync('git', args, { cwd: remote })
  await rgit('init', '-q', '--initial-branch', 'main', '.')
  await rgit('config', 'user.email', 'test@example.com')
  await rgit('config', 'user.name', 'test')
  await fs.mkdir(join(remote, 'instructions'))
  await fs.writeFile(join(remote, 'instructions', 'base.md'), 'v1\n', 'utf8')
  await rgit('add', '--all')
  await rgit('commit', '-qm', 'init')

  const work = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-work-'))
  cleanup.push(work)
  const root = join(work, 'repository')
  await execFileAsync('git', ['clone', '--depth', '1', '--branch', 'main', '--single-branch', remote, root])
  const wgit = (...args: string[]) => execFileAsync('git', args, { cwd: root })
  await wgit('config', 'user.email', 'test@example.com')
  await wgit('config', 'user.name', 'test')
  await wgit('checkout', '-qb', 'skillbuddy/draft')
  return { remote, work: root }
}

describe('syncing a draft onto a moved base branch', () => {
  it('keeps unpublished changes and picks up the new upstream content', async () => {
    const { remote, work } = await createRemoteAndClone()
    // 队友推进了主分支
    await fs.writeFile(join(remote, 'instructions', 'teammate.md'), 'theirs\n', 'utf8')
    await execFileAsync('git', ['add', '--all'], { cwd: remote })
    await execFileAsync('git', ['commit', '-qm', 'teammate'], { cwd: remote })
    // 本地草稿有未提交的新文件
    await fs.writeFile(join(work, 'instructions', 'mine.md'), 'mine\n', 'utf8')

    const { conflicted } = await syncBase(work, 'main')

    expect(conflicted).toBe(false)
    await expect(fs.readFile(join(work, 'instructions', 'mine.md'), 'utf8')).resolves.toBe('mine\n')
    await expect(fs.readFile(join(work, 'instructions', 'teammate.md'), 'utf8')).resolves.toBe('theirs\n')
  })

  it('reports a conflict instead of silently dropping either side', async () => {
    const { remote, work } = await createRemoteAndClone()
    await fs.writeFile(join(remote, 'instructions', 'base.md'), 'upstream edit\n', 'utf8')
    await execFileAsync('git', ['add', '--all'], { cwd: remote })
    await execFileAsync('git', ['commit', '-qm', 'upstream'], { cwd: remote })
    // 同一文件本地也改了，且未提交
    await fs.writeFile(join(work, 'instructions', 'base.md'), 'my edit\n', 'utf8')

    const { conflicted } = await syncBase(work, 'main')

    expect(conflicted).toBe(true)
    // 冲突时本地内容仍留在 stash 中，没有被悄悄丢弃
    const stash = await runTeamContributionCommand('git', ['stash', 'list'], work, 30_000)
    expect(stash).toContain('skillbuddy-sync')
  })
})
