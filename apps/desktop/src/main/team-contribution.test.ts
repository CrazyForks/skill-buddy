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
