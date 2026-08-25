import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_PLATFORMS, resolvePlatformOsPath, type PlatformDef } from '../platforms.js'
import { PlatformAdapter } from './platform-adapter.js'
import type { Skill } from '../types.js'

const sample: Skill = {
  name: 'commit-style',
  description: 'Write conventional commits',
  version: '1.0.0',
  tags: ['git', 'style'],
  content: '# Commit style\n\nAlways use conventional commits.',
}

const customPlatform: PlatformDef = {
  id: 'my-inhouse-agent',
  displayName: 'In-house Agent',
  userSkillsDir: '~/.inhouse/skills',
  projectSkillsDir: '.inhouse/skills',
  detectPath: '~/.inhouse',
}

const cases: PlatformDef[] = [...BUILTIN_PLATFORMS, customPlatform]

/** Expand a `~/`-prefixed def path against the test home. */
const at = (home: string, p: string): string => join(home, p.slice(2))

describe.each(cases)('PlatformAdapter($id)', (def) => {
  let home: string
  let adapter: PlatformAdapter

  // A platform may declare OS-specific paths, so the shared expectations below
  // must follow whichever row applies to the OS running the suite.
  const userSkillsDir = resolvePlatformOsPath(
    def.userSkillsDir,
    def.userSkillsDirByOs,
    process.platform,
  )
  const detectPath = resolvePlatformOsPath(def.detectPath, def.detectPathByOs, process.platform)

  beforeEach(async () => {
    home = await fs.mkdtemp(join(tmpdir(), 'skm-test-'))
    adapter = new PlatformAdapter(def, home)
  })

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true })
  })

  it('detects presence via its detect path', async () => {
    expect(await adapter.detect()).toBe(false)
    await fs.mkdir(at(home, detectPath), { recursive: true })
    expect(await adapter.detect()).toBe(true)
  })

  it('round-trips a skill through install and list (user scope)', async () => {
    const path = await adapter.install(sample, 'user')
    expect(path).toBe(join(at(home, userSkillsDir!), 'commit-style'))

    const listed = await adapter.list('user')
    expect(listed).toHaveLength(1)
    const { skill } = listed[0]!
    expect(skill.name).toBe(sample.name)
    expect(skill.description).toBe(sample.description)
    expect(skill.version).toBe(sample.version)
    expect(skill.tags).toEqual(sample.tags)
    expect(skill.content).toBe(sample.content)
  })

  it(
    def.projectSkillsDir ? 'supports project scope' : 'rejects project scope (unsupported)',
    async () => {
      const project = join(home, 'repo')
      if (def.projectSkillsDir) {
        await adapter.install(sample, 'project', project)
        const listed = await adapter.list('project', project)
        expect(listed).toHaveLength(1)
        expect(listed[0]!.path).toBe(join(project, def.projectSkillsDir, 'commit-style'))
      } else {
        await expect(adapter.install(sample, 'project', project)).rejects.toThrow(
          /no skills directory/,
        )
        expect(await adapter.list('project', project)).toHaveLength(0)
      }
    },
  )

  it('install is idempotent (overwrite, no duplicates)', async () => {
    await adapter.install(sample, 'user')
    await adapter.install({ ...sample, description: 'updated' }, 'user')
    const listed = await adapter.list('user')
    expect(listed).toHaveLength(1)
    expect(listed[0]!.skill.description).toBe('updated')
  })

  it('copies and lists resource files', async () => {
    const resourceSrc = join(home, 'template.txt')
    await fs.writeFile(resourceSrc, 'hello', 'utf8')
    await adapter.install(
      { ...sample, resources: { 'assets/template.txt': resourceSrc } },
      'user',
    )
    const listed = await adapter.list('user')
    const resources = listed[0]!.skill.resources
    expect(resources).toBeDefined()
    expect(Object.keys(resources!)).toEqual(['assets/template.txt'])
    const copied = await fs.readFile(
      join(at(home, userSkillsDir!), 'commit-style', 'assets', 'template.txt'),
      'utf8',
    )
    expect(copied).toBe('hello')
  })

  it('uninstall removes the skill directory', async () => {
    await adapter.install(sample, 'user')
    await adapter.uninstall('commit-style', 'user')
    expect(await adapter.list('user')).toHaveLength(0)
  })

  it('toggles the enabled state without removing the skill directory', async () => {
    await adapter.install(sample, 'user')
    const skillPath = join(at(home, userSkillsDir!), 'commit-style')

    await adapter.setEnabled('commit-style', false, 'user')
    expect(await fs.stat(join(skillPath, 'SKILL.md.disabled'))).toBeTruthy()
    expect(await adapter.list('user')).toEqual([
      expect.objectContaining({ enabled: false, path: skillPath }),
    ])

    await adapter.setEnabled('commit-style', true, 'user')
    expect(await fs.stat(join(skillPath, 'SKILL.md'))).toBeTruthy()
    expect(await adapter.list('user')).toEqual([
      expect.objectContaining({ enabled: true, path: skillPath }),
    ])
  })

  it('rejects non-kebab-case names', async () => {
    await expect(adapter.install({ ...sample, name: 'Bad Name' }, 'user')).rejects.toThrow(
      /kebab-case/,
    )
    await expect(adapter.uninstall('../outside', 'user')).rejects.toThrow(/kebab-case/)
  })

  it('rejects resource paths outside the Skill directory', async () => {
    const source = join(home, 'payload.txt')
    await fs.writeFile(source, 'payload', 'utf8')
    await expect(
      adapter.install(
        {
          ...sample,
          resources: { '../escaped.txt': source },
        },
        'user',
      ),
    ).rejects.toThrow(/resource path/)
    await expect(fs.stat(join(at(home, userSkillsDir!), 'escaped.txt'))).rejects.toThrow()
  })

  it('ignores directories without SKILL.md', async () => {
    const dir = join(at(home, userSkillsDir!), 'not-a-skill')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'notes.txt'), 'x', 'utf8')
    expect(await adapter.list('user')).toHaveLength(0)
  })
})

describe('PlatformAdapter (OS-specific paths)', () => {
  const electronLike: PlatformDef = {
    id: 'electron-like',
    displayName: 'Electron-like Assistant',
    userSkillsDir: '~/Library/Application Support/Demo App/skills',
    userSkillsDirByOs: {
      win32: '~/AppData/Roaming/Demo App/skills',
      linux: '~/.config/Demo App/skills',
    },
    projectSkillsDir: null,
    detectPath: '~/Library/Application Support/Demo App',
    detectPathByOs: {
      win32: '~/AppData/Roaming/Demo App',
      linux: '~/.config/Demo App',
    },
  }

  it.each([
    ['darwin', ['Library', 'Application Support', 'Demo App', 'skills']],
    ['win32', ['AppData', 'Roaming', 'Demo App', 'skills']],
    ['linux', ['.config', 'Demo App', 'skills']],
  ] as const)('resolves the user skills dir for %s', (os, segments) => {
    const adapter = new PlatformAdapter(electronLike, '/home/test', os)
    expect(adapter.skillsDir('user')).toBe(join('/home/test', ...segments))
  })

  it('falls back to the OS-neutral path for an unlisted OS', () => {
    const adapter = new PlatformAdapter(electronLike, '/home/test', 'freebsd')
    expect(adapter.skillsDir('user')).toBe(
      join('/home/test', 'Library', 'Application Support', 'Demo App', 'skills'),
    )
  })

  it('detects presence via the OS-specific detect path', async () => {
    const home = await fs.mkdtemp(join(tmpdir(), 'skm-os-'))
    const adapter = new PlatformAdapter(electronLike, home, 'linux')
    expect(await adapter.detect()).toBe(false)
    await fs.mkdir(join(home, '.config', 'Demo App'), { recursive: true })
    expect(await adapter.detect()).toBe(true)
    await fs.rm(home, { recursive: true, force: true })
  })
})
