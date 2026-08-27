import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanInstalledSkills } from './scanner.js'
import {
  isLinkParked,
  listParkedLinks,
  parkLink,
  removeParkedLink,
  restoreLink,
  SKILLBUDDY_DIR_NAME,
} from './skill-link.js'
import type { SkillRoot } from './types.js'

const cleanup: string[] = []

async function tempHome(): Promise<string> {
  const path = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-link-'))
  cleanup.push(path)
  return path
}

/** Build an upstream Skill plus a Skills root that links to it. */
async function withLinkedSkill(name = 'commit-style'): Promise<{
  skillsDir: string
  upstream: string
  linkPath: string
}> {
  const home = await tempHome()
  const upstream = join(home, 'upstream', name)
  await fs.mkdir(upstream, { recursive: true })
  await fs.writeFile(
    join(upstream, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Upstream owned\n---\n\nBody\n`,
    'utf8',
  )
  const skillsDir = join(home, '.agent', 'skills')
  await fs.mkdir(skillsDir, { recursive: true })
  const linkPath = join(skillsDir, name)
  await fs.symlink(upstream, linkPath)
  return { skillsDir, upstream, linkPath }
}

function rootFor(path: string): SkillRoot {
  return {
    agent: 'test-agent',
    scope: 'user',
    path,
    origin: 'user',
    readOnly: false,
    canToggle: true,
  }
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })))
})

// Windows 上创建符号链接需要额外特权，这些用例只在类 Unix 平台运行。
describe.runIf(process.platform !== 'win32')('linked Skill parking', () => {
  it('moves only the link entry and leaves the upstream body untouched', async () => {
    const { skillsDir, upstream, linkPath } = await withLinkedSkill()
    const before = await fs.readdir(upstream)

    const parkedPath = await parkLink(skillsDir, 'commit-style')

    await expect(fs.lstat(linkPath)).rejects.toThrow()
    expect((await fs.lstat(parkedPath)).isSymbolicLink()).toBe(true)
    expect(await fs.readlink(parkedPath)).toBe(upstream)
    // 上游目录内容完全没有被改写，SKILL.md 也没有被重命名。
    expect(await fs.readdir(upstream)).toEqual(before)
    expect(await isLinkParked(skillsDir, 'commit-style')).toBe(true)
  })

  it('hides the parking area from Git with a self-ignoring .gitignore', async () => {
    const { skillsDir } = await withLinkedSkill()

    await parkLink(skillsDir, 'commit-style')

    const ignorePath = join(skillsDir, SKILLBUDDY_DIR_NAME, '.gitignore')
    // `*` 连 .gitignore 自身一起忽略，而 Git 不跟踪空目录，
    // 因此整个 .skillbuddy/ 不会出现在 git status 里。
    expect(await fs.readFile(ignorePath, 'utf8')).toBe('*\n')
  })

  it('keeps a hand-edited .gitignore so teams can opt into sharing', async () => {
    const { skillsDir } = await withLinkedSkill()
    await fs.mkdir(join(skillsDir, SKILLBUDDY_DIR_NAME), { recursive: true })
    await fs.writeFile(join(skillsDir, SKILLBUDDY_DIR_NAME, '.gitignore'), '# shared\n', 'utf8')

    await parkLink(skillsDir, 'commit-style')

    expect(await fs.readFile(join(skillsDir, SKILLBUDDY_DIR_NAME, '.gitignore'), 'utf8')).toBe(
      '# shared\n',
    )
  })

  it('restores a parked link back into the platform scan path', async () => {
    const { skillsDir, upstream, linkPath } = await withLinkedSkill()
    await parkLink(skillsDir, 'commit-style')

    const restored = await restoreLink(skillsDir, 'commit-style')

    expect(restored).toBe(linkPath)
    expect((await fs.lstat(linkPath)).isSymbolicLink()).toBe(true)
    expect(await fs.readlink(linkPath)).toBe(upstream)
    expect(await isLinkParked(skillsDir, 'commit-style')).toBe(false)
  })

  it('refuses to park anything that is not a link', async () => {
    const { skillsDir } = await withLinkedSkill()
    const plain = join(skillsDir, 'local-skill')
    await fs.mkdir(plain, { recursive: true })

    await expect(parkLink(skillsDir, 'local-skill')).rejects.toThrow(/not a linked Skill/)
  })

  it('refuses to restore over a Skill that took the name while parked', async () => {
    const { skillsDir } = await withLinkedSkill()
    await parkLink(skillsDir, 'commit-style')
    // 停放期间用户装了同名 Skill，覆盖会丢数据，只能拒绝。
    await fs.mkdir(join(skillsDir, 'commit-style'), { recursive: true })

    await expect(restoreLink(skillsDir, 'commit-style')).rejects.toThrow(/already exists/)
    expect(await isLinkParked(skillsDir, 'commit-style')).toBe(true)
  })

  it('reports a parked link whose upstream disappeared as broken', async () => {
    const { skillsDir, upstream } = await withLinkedSkill()
    await parkLink(skillsDir, 'commit-style')
    await fs.rm(upstream, { recursive: true, force: true })

    const parked = await listParkedLinks(skillsDir)

    expect(parked).toHaveLength(1)
    expect(parked[0]).toMatchObject({ name: 'commit-style', target: upstream, broken: true })
  })

  it('removes a parked link without deleting the upstream Skill', async () => {
    const { skillsDir, upstream } = await withLinkedSkill()
    await parkLink(skillsDir, 'commit-style')

    expect(await removeParkedLink(skillsDir, 'commit-style')).toBe(true)

    expect(await listParkedLinks(skillsDir)).toEqual([])
    expect(await fs.readFile(join(upstream, 'SKILL.md'), 'utf8')).toContain('Upstream owned')
  })
})

describe.runIf(process.platform !== 'win32')('scanning parked links', () => {
  it('reports a parked link as disabled even though upstream SKILL.md is active', async () => {
    const { skillsDir, upstream } = await withLinkedSkill()
    await parkLink(skillsDir, 'commit-style')

    const skills = await scanInstalledSkills([], [rootFor(skillsDir)])

    expect(skills).toHaveLength(1)
    // 语义由链接所在位置决定：上游本体始终是启用态的 SKILL.md，
    // 若取 readSkillDirState 的判断这里就会错报成 true。
    expect(skills[0]).toMatchObject({
      enabled: false,
      linked: true,
      linkKind: 'reference',
      linkTarget: upstream,
      canToggle: true,
    })
    expect(skills[0]!.skill.description).toBe('Upstream owned')
  })

  it('keeps a broken parked link visible instead of dropping it silently', async () => {
    const { skillsDir, upstream } = await withLinkedSkill()
    await parkLink(skillsDir, 'commit-style')
    await fs.rm(upstream, { recursive: true, force: true })

    const skills = await scanInstalledSkills([], [rootFor(skillsDir)])

    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({ enabled: false, linkBroken: true, canToggle: false })
    expect(skills[0]!.skill.name).toBe('commit-style')
  })

  it('marks an active link as a toggleable reference and hides the parking dir', async () => {
    const { skillsDir, upstream } = await withLinkedSkill()

    const skills = await scanInstalledSkills([], [rootFor(skillsDir)])

    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({
      enabled: true,
      linked: true,
      linkKind: 'reference',
      linkTarget: upstream,
      canToggle: true,
    })
  })

  it('never offers to toggle links inside a platform runtime projection', async () => {
    const { skillsDir } = await withLinkedSkill()

    const skills = await scanInstalledSkills(
      [],
      [{ ...rootFor(skillsDir), runtimeProjection: true }],
    )

    // 运行态目录由平台自行全量重建，搬动其中的链接会被下次刷新冲掉。
    expect(skills[0]).toMatchObject({ linkKind: 'runtime', canToggle: false })
  })
})
