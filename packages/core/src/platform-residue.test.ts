import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformDef } from './platforms.js'
import type { ApplicationLookup } from './platform-installation.js'
import {
  containsPath,
  detectPlatformResidue,
  filterProtectedCandidates,
  filterSafeResidueCandidates,
  listResidueCandidates,
} from './platform-residue.js'

/**
 * 用 `~/` 前缀声明本体路径，测试才能在临时主目录里造出「应用在」与「应用没了」
 * 两种状态；真实平台用的是 `/Applications/xxx.app`，语义完全相同。
 */
const def: PlatformDef = {
  id: 'test-agent',
  displayName: 'Test Agent',
  userSkillsDir: '~/.test-agent/skills',
  projectSkillsDir: '.test-agent/skills',
  detectPath: '~/.test-agent',
  installPathsByOs: { darwin: ['~/Applications/Test Agent.app'] },
  macBundleId: 'com.example.test-agent',
  residualPathsByOs: { darwin: ['~/.test-agent/legacy', '~/.test-agent'] },
}

async function makeDir(home: string, path: string): Promise<void> {
  await fs.mkdir(join(home, path), { recursive: true })
}

describe('detectPlatformResidue', () => {
  let home: string
  const lookup = vi.fn<ApplicationLookup>()

  beforeEach(async () => {
    home = await fs.mkdtemp(join(tmpdir(), 'skm-residue-'))
    lookup.mockReset().mockResolvedValue('missing')
  })

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true })
  })

  it('未声明本体路径的平台不参与判定', async () => {
    const cliDef: PlatformDef = { ...def, installPathsByOs: undefined }
    expect(await detectPlatformResidue(cliDef, home, 'darwin')).toBeNull()
  })

  it('当前系统没有声明本体路径时也不参与判定', async () => {
    await makeDir(home, '.test-agent')
    expect(await detectPlatformResidue(def, home, 'win32')).toBeNull()
  })

  it('本体仍在时不暴露任何清理候选', async () => {
    await makeDir(home, 'Applications/Test Agent.app')
    await makeDir(home, '.test-agent')

    expect(await detectPlatformResidue(def, home, 'darwin', lookup)).toEqual({
      installationState: 'installed',
      paths: [],
    })
  })

  it('本体消失后列出现存候选，按声明顺序去重', async () => {
    await makeDir(home, '.test-agent/legacy')

    const residue = await detectPlatformResidue(def, home, 'darwin', lookup)

    expect(residue?.installationState).toBe('missing')
    expect(residue?.paths).toEqual([
      join(home, '.test-agent'),
      join(home, '.test-agent/legacy'),
    ])
  })

  it('本体消失但目录早已清干净时列表为空', async () => {
    const residue = await detectPlatformResidue(def, home, 'darwin', lookup)

    expect(residue).toEqual({ installationState: 'unknown', paths: [] })
    expect(lookup).not.toHaveBeenCalled()
  })

  it('默认路径缺失但系统查到移位或改名的应用时不开放清理', async () => {
    await makeDir(home, '.test-agent')
    lookup.mockResolvedValue('installed')

    expect(await detectPlatformResidue(def, home, 'darwin', lookup)).toEqual({
      installationState: 'installed', paths: [],
    })
    expect(lookup).toHaveBeenCalledWith('com.example.test-agent', 'darwin')
  })

  it('缺少 Bundle ID 时不能仅凭默认路径缺失判定卸载', async () => {
    await makeDir(home, '.test-agent')
    expect(await detectPlatformResidue({ ...def, macBundleId: undefined }, home, 'darwin', lookup))
      .toEqual({ installationState: 'unknown', paths: [] })
    expect(lookup).not.toHaveBeenCalled()
  })

  it('系统查询不确定或失败时保守保留数据', async () => {
    await makeDir(home, '.test-agent')
    lookup.mockResolvedValueOnce('unknown').mockRejectedValueOnce(new Error('query timed out'))
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await detectPlatformResidue(def, home, 'darwin', lookup))
        .toEqual({ installationState: 'unknown', paths: [] })
    }
  })

  it('安装路径的权限异常不作为卸载证据', async () => {
    const stat = vi.spyOn(fs, 'lstat').mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }))
    try {
      expect(await detectPlatformResidue(def, home, 'darwin', lookup))
        .toEqual({ installationState: 'unknown', paths: [] })
      expect(lookup).not.toHaveBeenCalled()
    } finally {
      stat.mockRestore()
    }
  })

  it('跳过声明了但并不存在的候选', async () => {
    await makeDir(home, '.test-agent')

    expect(await listResidueCandidates(def, home, 'darwin')).toEqual([join(home, '.test-agent')])
  })
})

describe('containsPath', () => {
  it('把相等与子孙视为包含，祖先与兄弟不算', () => {
    expect(containsPath('/a/b', '/a/b')).toBe(true)
    expect(containsPath('/a/b', '/a/b/c')).toBe(true)
    expect(containsPath('/a/b/c', '/a/b')).toBe(false)
    expect(containsPath('/a/b', '/a/bc')).toBe(false)
    expect(containsPath('/a/b', '/a')).toBe(false)
  })
})

describe('filterProtectedCandidates', () => {
  it('剔除等于或覆盖受保护根目录的候选', () => {
    const protectedRoots = ['/Users/demo', '/Users/demo/.gemini']

    expect(
      filterProtectedCandidates(
        ['/Users/demo', '/Users/demo/.gemini', '/Users/demo/.gemini/config'],
        protectedRoots,
      ),
    ).toEqual(['/Users/demo/.gemini/config'])
  })

  it('没有受保护根目录时原样返回副本', () => {
    const candidates = ['/Users/demo/.gemini/config']
    const filtered = filterProtectedCandidates(candidates, [])

    expect(filtered).toEqual(candidates)
    expect(filtered).not.toBe(candidates)
  })
})

describe('filterSafeResidueCandidates', () => {
  let home: string

  beforeEach(async () => {
    home = await fs.mkdtemp(join(tmpdir(), 'skm-safe-residue-'))
    await makeDir(home, '.cursor/shared')
    await makeDir(home, '.trae')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(home, { recursive: true, force: true })
  })

  it.runIf(process.platform !== 'win32')('保护通过软链共享到候选内部的其它平台根目录', async () => {
    await fs.symlink(join(home, '.cursor/shared'), join(home, '.qwen'))
    expect(await filterSafeResidueCandidates(
      [join(home, '.cursor'), join(home, '.trae')], [join(home, '.qwen')], home,
    )).toEqual([join(home, '.trae')])
  })

  it.runIf(process.platform !== 'win32')('同时解析候选祖先及受保护根目录的软链', async () => {
    await fs.symlink(join(home, '.cursor'), join(home, 'alias'))
    await makeDir(home, '.cursor/shared/skills')
    expect(await filterSafeResidueCandidates(
      [join(home, 'alias/shared')], [join(home, '.cursor/shared/skills')], home,
    )).toEqual([])
  })

  it.runIf(process.platform !== 'win32')('不提供软链、普通文件或 home 本身作为清理候选', async () => {
    await fs.symlink(join(home, '.cursor'), join(home, 'alias'))
    await fs.writeFile(join(home, 'plain-file'), '')
    expect(await filterSafeResidueCandidates(
      [home, join(home, 'alias'), join(home, 'plain-file'), join(home, '.trae')], [], home,
    )).toEqual([join(home, '.trae')])
  })

  it('受保护目录权限检查失败时不放行任何候选', async () => {
    vi.spyOn(fs, 'realpath')
      .mockResolvedValueOnce(home)
      .mockResolvedValueOnce(home)
      .mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }))
    expect(await filterSafeResidueCandidates(
      [join(home, '.cursor')], [join(home, '.qwen')], home,
    )).toEqual([])
  })

  it('不因确实不存在的兄弟目录阻止清理', async () => {
    expect(await filterSafeResidueCandidates(
      [join(home, '.cursor')], [join(home, '.qwen')], home,
    )).toEqual([join(home, '.cursor')])
  })
})
