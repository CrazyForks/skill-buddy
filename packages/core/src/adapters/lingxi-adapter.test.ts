import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LingxiAdapter } from './lingxi-adapter.js'
import type { InstalledSkill } from '../types.js'

function installation(
  name: string,
  origin: NonNullable<InstalledSkill['origin']>,
  path: string,
): InstalledSkill {
  return {
    agent: 'wps-lingxi',
    scope: 'user',
    path,
    origin,
    readOnly: origin === 'system',
    enabled: true,
    skill: {
      name,
      description: name,
      content: '',
    },
  }
}

describe('LingxiAdapter', () => {
  const appDataDir = 'C:/Users/test/AppData/Roaming'
  const serverDir = join(appDataDir, 'WPS 灵犀', 'serverdir')
  const adapter = new LingxiAdapter({
    homeDir: 'C:/Users/test',
    appDataDir,
    os: 'win32',
  })

  it('在 Windows 使用 APPDATA 下的用户技能目录', () => {
    expect(adapter.skillsDir('user')).toBe(join(serverDir, 'user_skills'))
    expect(adapter.skillsDir('project', 'C:/repo')).toBeNull()
  })

  it('将官方技能目录作为只读补充根', () => {
    expect(adapter.supplementalSkillRoots()).toEqual([
      expect.objectContaining({
        scope: 'user',
        path: join(serverDir, 'official_skills'),
        origin: 'system',
        readOnly: true,
      }),
    ])
  })

  it('用大小写不敏感的用户技能覆盖同名官方技能', () => {
    const user = installation('foo', 'user', join(serverDir, 'user_skills', 'foo'))
    const official = installation('Foo', 'system', join(serverDir, 'official_skills', 'Foo'))

    expect(adapter.reconcileInstallations([official, user])).toEqual([
      { ...user, canToggle: false },
    ])
  })

  it('保留名称不同的用户和官方技能', () => {
    const user = installation('foo', 'user', join(serverDir, 'user_skills', 'foo'))
    const official = installation('bar', 'system', join(serverDir, 'official_skills', 'bar'))

    expect(adapter.reconcileInstallations([official, user])).toEqual([
      { ...official, canToggle: false },
      { ...user, canToggle: false },
    ])
  })

  it('声明不可通过通用机制启停', async () => {
    expect(adapter.capabilities.canToggle).toBe(false)
    await expect(adapter.setEnabled('foo', false, 'user')).rejects.toThrow(/不支持.*启停/)
  })

  it.runIf(process.platform === 'win32')(
    '在 Windows 用用户技能覆盖 target_skills 中的同名官方 Junction',
    async () => {
      const root = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-lingxi-'))
      const runtimeAdapter = new LingxiAdapter({
        homeDir: root,
        appDataDir: root,
        os: 'win32',
      })
      const userDir = runtimeAdapter.skillsDir('user')!
      const officialDir = runtimeAdapter.supplementalSkillRoots()[0]!.path
      const targetDir = join(root, 'WPS 灵犀', 'serverdir', 'target_skills')
      const officialFoo = join(officialDir, 'Foo')
      const officialBar = join(officialDir, 'bar')
      try {
        await Promise.all(
          [officialFoo, officialBar].map(async (skillDir) => {
            await fs.mkdir(skillDir, { recursive: true })
            await fs.writeFile(
              join(skillDir, 'SKILL.md'),
              `---\nname: ${skillDir === officialFoo ? 'Foo' : 'bar'}\ndescription: test\n---\n`,
            )
          }),
        )

        const userSkill = await runtimeAdapter.install(
          { name: 'foo', description: 'test', content: '' },
          'user',
        )
        expect(await fs.realpath(join(targetDir, 'foo'))).toBe(await fs.realpath(userSkill))
        expect(await fs.realpath(join(targetDir, 'bar'))).toBe(await fs.realpath(officialBar))

        await runtimeAdapter.uninstall('foo', 'user')
        expect(await fs.realpath(join(targetDir, 'Foo'))).toBe(await fs.realpath(officialFoo))
      } finally {
        await fs.rm(root, { recursive: true, force: true })
      }
    },
  )
})
