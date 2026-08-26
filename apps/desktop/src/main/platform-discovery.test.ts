import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ home: '' }))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => state.home }
})

const { derivePlatformDraft, discoverPlatformCandidates } = await import('./platform-discovery.js')

/** 在模拟 home 下造一个目录并填入指定条目，用来伪造平台特征。 */
async function makeDir(name: string, entries: string[] = []): Promise<string> {
  const path = join(state.home, name)
  await fs.mkdir(path, { recursive: true })
  for (const entry of entries) {
    if (entry.includes('.')) await fs.writeFile(join(path, entry), '', 'utf8')
    else await fs.mkdir(join(path, entry), { recursive: true })
  }
  return path
}

beforeEach(async () => {
  state.home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-platform-discovery-'))
})

afterEach(async () => {
  await fs.rm(state.home, { recursive: true, force: true })
})

describe('derivePlatformDraft', () => {
  it('从平台根目录推导出 id、显示名与三个路径', async () => {
    const root = await makeDir('.my-agent', ['skills'])

    expect(await derivePlatformDraft(root)).toEqual({
      id: 'my-agent',
      displayName: 'My Agent',
      detectPath: '~/.my-agent',
      userSkillsDir: '~/.my-agent/skills',
      projectSkillsDir: '.my-agent/skills',
      hasSkillsDir: true,
      error: null,
    })
  })

  it('选中 skills 目录时回退到它的父目录', async () => {
    const root = await makeDir('.my-agent', ['skills'])

    const draft = await derivePlatformDraft(join(root, 'skills'))

    expect(draft.detectPath).toBe('~/.my-agent')
    expect(draft.userSkillsDir).toBe('~/.my-agent/skills')
    expect(draft.hasSkillsDir).toBe(true)
  })

  it('目录尚无 skills 子目录时仍可推导，只是不带强信号', async () => {
    const root = await makeDir('.my-agent', ['config.toml'])

    const draft = await derivePlatformDraft(root)

    expect(draft.hasSkillsDir).toBe(false)
    expect(draft.error).toBeNull()
  })

  it('把嵌套目录写成 ~/ 形式，并按目录名生成 project 级路径', async () => {
    const root = await makeDir(join('.config', 'goose'), ['skills'])

    const draft = await derivePlatformDraft(root)

    expect(draft.detectPath).toBe('~/.config/goose')
    expect(draft.userSkillsDir).toBe('~/.config/goose/skills')
    expect(draft.projectSkillsDir).toBe('.goose/skills')
  })

  it('把大小写与下划线折叠成合法的 kebab-case id', async () => {
    const root = await makeDir('My_Agent CLI')

    const draft = await derivePlatformDraft(root)

    expect(draft.id).toBe('my-agent-cli')
    expect(draft.displayName).toBe('My Agent Cli')
    expect(draft.error).toBeNull()
  })

  it('目录名无法生成 id 时报 invalid-id，交给用户手填', async () => {
    const root = await makeDir('豆包')

    const draft = await derivePlatformDraft(root)

    expect(draft.id).toBe('')
    expect(draft.error).toBe('invalid-id')
    expect(draft.projectSkillsDir).toBe('')
  })

  it('拒绝 home 之外的目录与 home 本身', async () => {
    const outside = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-outside-'))
    try {
      expect((await derivePlatformDraft(outside)).error).toBe('outside-home')
      expect((await derivePlatformDraft(state.home)).error).toBe('is-home')
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })
})

describe('discoverPlatformCandidates', () => {
  it('只挑出带 skills 或多项特征的目录，并把强信号排在前面', async () => {
    await makeDir('.weak-agent', ['config.toml'])
    await makeDir('.strong-agent', ['skills'])
    await makeDir('.agent-like', ['agents', 'mcp.json'])
    await makeDir('.plain-tool', ['bin'])

    const candidates = await discoverPlatformCandidates()
    const paths = candidates.map((candidate) => candidate.detectPath)

    expect(paths[0]).toBe('~/.strong-agent')
    expect(paths).toContain('~/.agent-like')
    expect(paths).not.toContain('~/.weak-agent')
    expect(paths).not.toContain('~/.plain-tool')
  })

  it('跳过已注册的内置平台目录与系统目录', async () => {
    await makeDir('.claude', ['skills'])
    await makeDir('.ssh', ['skills'])
    await makeDir(join('.config', 'opencode'), ['skills'])

    const paths = (await discoverPlatformCandidates()).map((candidate) => candidate.detectPath)

    expect(paths).not.toContain('~/.claude')
    expect(paths).not.toContain('~/.ssh')
    expect(paths).not.toContain('~/.config/opencode')
  })

  it('扫描 ~/.config 一级目录，覆盖 OpenCode 这类嵌套约定', async () => {
    await makeDir(join('.config', 'goose'), ['skills'])

    const paths = (await discoverPlatformCandidates()).map((candidate) => candidate.detectPath)

    expect(paths).toContain('~/.config/goose')
  })
})
