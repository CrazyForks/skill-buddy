import { promises as fs } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  disabledLinksDir,
  parkLink,
  SKILLBUDDY_DIR_NAME,
  type SkillRoot,
} from '@skillbuddy/core'
import { PathAccessPolicy, validateCustomPlatform } from './path-policy.js'

let root: string
let managedRoot: string
let skillRoot: string
let outsideRoot: string
let policy: PathAccessPolicy

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-path-policy-'))
  managedRoot = join(root, 'skills')
  skillRoot = join(managedRoot, 'safe-skill')
  outsideRoot = join(root, 'outside')
  await fs.mkdir(skillRoot, { recursive: true })
  await fs.mkdir(outsideRoot, { recursive: true })
  await fs.writeFile(join(skillRoot, 'SKILL.md'), 'safe', 'utf8')
  await fs.writeFile(join(outsideRoot, 'secret.txt'), 'secret', 'utf8')
  policy = new PathAccessPolicy()
  policy.setSkillRoots([
    {
      agent: 'codex',
      scope: 'user',
      path: managedRoot,
      origin: 'user',
      readOnly: false,
    } satisfies SkillRoot,
  ])
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('PathAccessPolicy', () => {
  it('allows files inside scanned Skill roots and rejects unrelated paths', async () => {
    await expect(policy.assertReadable(join(skillRoot, 'SKILL.md'))).resolves.toBeUndefined()
    await expect(policy.assertReadable(join(outsideRoot, 'secret.txt'))).rejects.toThrow(
      'outside the allowed Skill directories',
    )
  })

  it('only allows deleting direct children of writable Skill roots', async () => {
    await expect(policy.assertWritableSkillDirectory(skillRoot)).resolves.toBeUndefined()
    const unrelated = join(managedRoot, 'unrelated')
    await fs.mkdir(unrelated)
    await expect(policy.assertWritableSkillDirectory(unrelated)).rejects.toThrow()
    await fs.mkdir(join(skillRoot, 'nested'))
    await expect(policy.assertWritableSkillDirectory(join(skillRoot, 'nested'))).rejects.toThrow()

    policy.setSkillRoots([
      {
        agent: 'codex',
        scope: 'user',
        path: managedRoot,
        origin: 'system',
        readOnly: true,
      },
    ])
    await expect(policy.assertWritableSkillDirectory(skillRoot)).rejects.toThrow(
      'not a managed Skill directory',
    )
  })

  it('only allows operations against scanned writable target roots', () => {
    expect(() => policy.assertWritableTargetRoot(managedRoot)).not.toThrow()
    expect(() => policy.assertWritableTargetRoot(outsideRoot)).toThrow(
      'outside the managed platform directories',
    )
  })

  it.runIf(process.platform !== 'win32')('blocks symlinks that escape an allowed root', async () => {
    const link = join(skillRoot, 'escaped.txt')
    await fs.symlink(join(outsideRoot, 'secret.txt'), link)
    await expect(policy.assertReadable(link)).rejects.toThrow(
      'outside the allowed Skill directories',
    )
  })

  it.runIf(process.platform !== 'win32')(
    'allows deleting and reading a Skill symlink without exposing the rest of its target tree',
    async () => {
      const externalSkill = join(outsideRoot, 'linked-skill')
      const linkedSkill = join(managedRoot, 'linked-skill')
      await fs.mkdir(externalSkill)
      await fs.writeFile(join(externalSkill, 'SKILL.md'), 'linked', 'utf8')
      await fs.symlink(externalSkill, linkedSkill)

      // 删除只作用于链接本身，查看内容是正当需求，两者都放行。
      await expect(policy.assertWritableSkillDirectory(linkedSkill)).resolves.toBeUndefined()
      await expect(policy.assertReadable(join(linkedSkill, 'SKILL.md'))).resolves.toBeUndefined()
      // 放行范围仅限该 Skill 目录，链接目标的兄弟文件依旧不可读。
      await expect(policy.assertReadable(join(outsideRoot, 'secret.txt'))).rejects.toThrow(
        'outside the allowed Skill directories',
      )
    },
  )

  it.runIf(process.platform !== 'win32')(
    'refuses to read through a symlink that does not point at a Skill directory',
    async () => {
      const escape = join(managedRoot, 'escape')
      await fs.symlink(outsideRoot, escape)

      await expect(policy.assertReadable(join(escape, 'secret.txt'))).rejects.toThrow(
        'outside the allowed Skill directories',
      )
      await expect(policy.assertWritableSkillDirectory(escape)).rejects.toThrow(
        'not a managed Skill directory',
      )
    },
  )

  it.runIf(process.platform !== 'win32')(
    'matches a Skill root whose own path contains a symlinked ancestor',
    async () => {
      // root 登记为经过 symlink 的路径，调用方传入的却是已解析的真实路径。
      const linkedRoot = join(root, 'linked-root')
      await fs.symlink(managedRoot, linkedRoot)
      policy.setSkillRoots([
        {
          agent: 'codex',
          scope: 'user',
          path: linkedRoot,
          origin: 'user',
          readOnly: false,
        } satisfies SkillRoot,
      ])

      await expect(policy.assertWritableSkillDirectory(skillRoot)).resolves.toBeUndefined()
    },
  )

  it('tracks app-owned temporary roots explicitly', async () => {
    policy.grantTemporaryRoot(outsideRoot, true)
    await expect(policy.assertReadable(join(outsideRoot, 'secret.txt'))).resolves.toBeUndefined()
    expect(() => policy.assertTemporaryRoot(outsideRoot)).not.toThrow()
    policy.revokeTemporaryRoot(outsideRoot)
    expect(() => policy.assertTemporaryRoot(outsideRoot)).toThrow('not owned by SkillBuddy')
  })

  it('does not allow Renderer cleanup for internal AI workspaces', () => {
    policy.grantTemporaryRoot(outsideRoot)
    expect(() => policy.assertTemporaryRoot(outsideRoot)).toThrow('not owned by SkillBuddy')
  })

  it('rejects installation resources outside authorized roots', async () => {
    await expect(
      policy.assertSkillResources({
        name: 'unsafe-skill',
        description: 'unsafe',
        content: 'unsafe',
        resources: { 'secret.txt': join(outsideRoot, 'secret.txt') },
      }),
    ).rejects.toThrow('outside the allowed Skill directories')
  })
})

describe.runIf(process.platform !== 'win32')('PathAccessPolicy (parked links)', () => {
  let upstream: string
  let parkedPath: string

  beforeEach(async () => {
    upstream = join(outsideRoot, 'linked-skill')
    await fs.mkdir(upstream, { recursive: true })
    await fs.writeFile(join(upstream, 'SKILL.md'), 'linked', 'utf8')
    await fs.symlink(upstream, join(managedRoot, 'linked-skill'))
    await parkLink(managedRoot, 'linked-skill')
    parkedPath = join(disabledLinksDir(managedRoot), 'linked-skill')
  })

  it('reads a disabled Skill through its parked link', async () => {
    await expect(policy.assertReadable(join(parkedPath, 'SKILL.md'))).resolves.toBeUndefined()
    // 放行范围仍限于该 Skill 目录，链接目标的兄弟文件依旧不可读。
    await expect(policy.assertReadable(join(outsideRoot, 'secret.txt'))).rejects.toThrow(
      'outside the allowed Skill directories',
    )
  })

  it('removes a parked link but never the parking area itself', async () => {
    await expect(policy.assertWritableSkillDirectory(parkedPath)).resolves.toBeUndefined()
    await expect(policy.assertWritableSkillDirectory(disabledLinksDir(managedRoot))).rejects.toThrow(
      'not a managed Skill directory',
    )
  })

  it('still allows removing a parked link whose upstream disappeared', async () => {
    await fs.rm(upstream, { recursive: true, force: true })

    // 断链读不到 SKILL.md，但清理入口必须留着，否则这条引用永远删不掉。
    await expect(policy.assertWritableSkillDirectory(parkedPath)).resolves.toBeUndefined()
  })

  it('refuses to read through a parked link that is not a Skill directory', async () => {
    const rogue = join(disabledLinksDir(managedRoot), 'rogue')
    await fs.symlink(outsideRoot, rogue)

    await expect(policy.assertReadable(join(rogue, 'secret.txt'))).rejects.toThrow(
      'outside the allowed Skill directories',
    )
  })

  it('never treats the private directory as an escape hatch', async () => {
    const stray = join(managedRoot, SKILLBUDDY_DIR_NAME, 'stray')
    await fs.symlink(outsideRoot, stray)

    await expect(policy.assertReadable(join(stray, 'secret.txt'))).rejects.toThrow(
      'outside the allowed Skill directories',
    )
  })
})

describe('validateCustomPlatform', () => {
  it('accepts home-contained and project-relative paths', () => {
    expect(
      validateCustomPlatform({
        id: 'private-agent',
        displayName: ' Private Agent ',
        userSkillsDir: '~/.private-agent/skills',
        projectSkillsDir: '.private-agent/skills',
        detectPath: '~/.private-agent',
      }),
    ).toMatchObject({ displayName: 'Private Agent' })
  })

  it('rejects home and project directory escapes', () => {
    expect(() =>
      validateCustomPlatform({
        id: 'private-agent',
        displayName: 'Private Agent',
        userSkillsDir: '/',
        projectSkillsDir: '.private-agent/skills',
        detectPath: join(homedir(), '.private-agent'),
      }),
    ).toThrow('inside the user home directory')
    expect(() =>
      validateCustomPlatform({
        id: 'private-agent',
        displayName: 'Private Agent',
        userSkillsDir: '~/.private-agent/skills',
        projectSkillsDir: '../outside',
        detectPath: '~/.private-agent',
      }),
    ).toThrow('cannot escape the project root')
  })

  it('requires custom installation targets to be Skills directories', () => {
    expect(() =>
      validateCustomPlatform({
        id: 'private-agent',
        displayName: 'Private Agent',
        userSkillsDir: '~/Documents',
        projectSkillsDir: null,
        detectPath: '~/.private-agent',
      }),
    ).toThrow('directory named skills')
  })
})
