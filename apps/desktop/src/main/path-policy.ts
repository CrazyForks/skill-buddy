import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import {
  disabledLinksDir,
  DISABLED_LINKS_DIR_NAME,
  SKILLBUDDY_DIR_NAME,
  type Skill,
  type SkillRoot,
} from '@skillbuddy/core'
import type { CustomPlatformInput } from '#shared/ipc'

interface ManagedRoot {
  path: string
  readOnly: boolean
}

/** 判断目标路径是否位于指定目录内，且不把目录本身视为子项。 */
export function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/**
 * 解析请求路径命中的 Skill 目录项：既可能是根目录下的 Skill，也可能是停放在
 * `.skillbuddy/disabled/` 里的已禁用链接。返回 null 表示不指向任何条目。
 */
function skillEntryWithin(rootPath: string, requested: string): string | null {
  const [first, second, third] = relative(rootPath, requested).split(sep)
  if (!first) return null
  if (first !== SKILLBUDDY_DIR_NAME) return resolve(rootPath, first)
  // 停放区是 SkillBuddy 的二级私有目录，真正的链接条目在第三段；
  // `.skillbuddy` 下的其他路径一律不放行，避免把私有目录变成逃逸通道。
  if (second !== DISABLED_LINKS_DIR_NAME || !third) return null
  return resolve(rootPath, first, second, third)
}

async function realpath(path: string): Promise<string> {
  try {
    return await fs.realpath(path)
  } catch {
    throw new Error(`path does not exist or is not accessible: ${path}`)
  }
}

/**
 * 主进程文件访问白名单。扫描目录、用户明确选择的目录和应用创建的临时目录
 * 是唯一可读来源；删除只允许命中可管理 Skills 根目录的直接子目录。
 */
export class PathAccessPolicy {
  private managedRoots: ManagedRoot[] = []
  private selectedRoots = new Set<string>()
  private temporaryRoots = new Map<string, boolean>()

  setSkillRoots(roots: SkillRoot[]): void {
    this.managedRoots = roots.map((root) => ({
      path: resolve(root.path),
      readOnly: root.readOnly,
    }))
  }

  grantSelectedRoot(path: string): void {
    this.selectedRoots.add(resolve(path))
  }

  grantTemporaryRoot(path: string, rendererCleanup = false): void {
    this.temporaryRoots.set(resolve(path), rendererCleanup)
  }

  revokeTemporaryRoot(path: string): void {
    this.temporaryRoots.delete(resolve(path))
  }

  /** 确认文件或目录来自已授权根目录，并阻止符号链接逃逸。 */
  async assertReadable(path: string): Promise<void> {
    const target = await realpath(path)
    const roots = [
      ...this.managedRoots.map((root) => root.path),
      ...this.selectedRoots,
      ...this.temporaryRoots.keys(),
    ]
    for (const root of roots) {
      let canonicalRoot: string
      try {
        canonicalRoot = await fs.realpath(root)
      } catch {
        continue
      }
      if (target === canonicalRoot || isWithin(canonicalRoot, target)) return
    }
    if (await this.reachableThroughLinkedSkill(path, target)) return
    throw new Error(`path is outside the allowed Skill directories: ${path}`)
  }

  /**
   * 判断路径是否经由受管根目录下的链接型 Skill 抵达。
   *
   * 链接型 Skill 的本体位于上游目录，查看其内容是正当需求，因此放行；
   * 但只认指向合法 Skill 目录（含 SKILL.md）的链接，避免借由指向任意
   * 位置的链接把读取权限扩大到 Skills 目录之外。
   */
  private async reachableThroughLinkedSkill(path: string, target: string): Promise<boolean> {
    const requested = resolve(path)
    for (const root of this.managedRoots) {
      const rootPath = resolve(root.path)
      if (!isWithin(rootPath, requested)) continue
      const skillPath = skillEntryWithin(rootPath, requested)
      if (skillPath === null) continue
      const entry = await fs.lstat(skillPath).catch(() => null)
      if (!entry?.isSymbolicLink()) continue
      const hasSkillFile = await Promise.all([
        fs.access(resolve(skillPath, 'SKILL.md')).then(() => true, () => false),
        fs.access(resolve(skillPath, 'SKILL.md.disabled')).then(() => true, () => false),
      ])
      if (!hasSkillFile.some(Boolean)) continue
      // 链接目标内部可能还有二级链接，仍需确认最终路径没有逃出目标目录。
      const skillRealPath = await fs.realpath(skillPath).catch(() => null)
      if (skillRealPath === null) continue
      if (target === skillRealPath || isWithin(skillRealPath, target)) return true
    }
    return false
  }

  /** 确认路径是某个可写 Skills 根目录下的一个完整 Skill 目录。 */
  async assertWritableSkillDirectory(path: string): Promise<void> {
    const denied = `path is not a managed Skill directory: ${path}`
    // 删除时校验目录项本身，而不是对最后一级路径执行 realpath。
    // 这样根目录下指向外部仓库的 Skill symlink 也能安全地移入废纸篓，
    // 不会把链接目标误认为是待删除目录。
    const target = resolve(path)
    if (basename(target) === '') throw new Error(denied)
    const entry = await fs.lstat(target).catch(() => null)
    if (!entry?.isDirectory() && !entry?.isSymbolicLink()) throw new Error(denied)

    // 父目录按 realpath 比较，兼容根目录自身路径中间存在 symlink 的情况。
    const parentRealPath = await fs.realpath(dirname(target)).catch(() => null)
    if (parentRealPath === null) throw new Error(denied)

    for (const root of this.managedRoots) {
      if (root.readOnly) continue
      const rootPath = resolve(root.path)
      const rootRealPath = await fs.realpath(rootPath).catch(() => null)
      // 停放区里的链接同样归本根目录管理，摘掉它只动引用，不碰上游本体。
      const parkedRealPath = await fs.realpath(disabledLinksDir(rootPath)).catch(() => null)
      const inRoot = rootRealPath !== null && rootRealPath === parentRealPath
      const inParkingArea = parkedRealPath !== null && parkedRealPath === parentRealPath
      if (!inRoot && !inParkingArea) continue
      // 断链读不到 SKILL.md，但必须留出清理入口，否则上游消失后这条已禁用的
      // 引用就再也删不掉了。停放区里只可能是链接条目，放行范围仍然收敛。
      if (inParkingArea && entry.isSymbolicLink()) return
      const hasSkillFile = await Promise.all([
        fs.access(resolve(target, 'SKILL.md')).then(() => true, () => false),
        fs.access(resolve(target, 'SKILL.md.disabled')).then(() => true, () => false),
      ])
      if (hasSkillFile.some(Boolean)) return
    }
    throw new Error(denied)
  }

  /** 确认安装目标是当前扫描结果中的可写平台根目录。 */
  assertWritableTargetRoot(path: string): void {
    const target = resolve(path)
    if (this.managedRoots.some((root) => !root.readOnly && root.path === target)) return
    throw new Error(`target is outside the managed platform directories: ${path}`)
  }

  /** 校验 Renderer 传回的资源源文件，防止借安装能力复制任意本机文件。 */
  async assertSkillResources(skill: Skill): Promise<void> {
    for (const source of Object.values(skill.resources ?? {})) {
      await this.assertReadable(source)
    }
  }

  /** 仅允许清理由应用创建并登记过的临时目录。 */
  assertTemporaryRoot(path: string): void {
    if (this.temporaryRoots.get(resolve(path)) !== true) {
      throw new Error(`temporary directory is not owned by SkillBuddy: ${path}`)
    }
  }
}

/** 把 `~/` 前缀路径展开为绝对路径，其余路径按当前工作目录解析。 */
export function expandHome(path: string): string {
  return path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : resolve(path)
}

/** 校验自定义平台，避免通过目录配置扩大主进程文件访问范围。 */
export function validateCustomPlatform(input: CustomPlatformInput): CustomPlatformInput {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id)) {
    throw new Error(`invalid platform id: ${input.id}`)
  }
  if (!input.displayName.trim()) throw new Error('platform display name is required')
  if (!input.detectPath.trim()) throw new Error('platform detect path is required')
  if (!input.userSkillsDir && !input.projectSkillsDir) {
    throw new Error('platform must define at least one Skills directory')
  }

  const home = resolve(homedir())
  const assertHomePath = (value: string | null, field: string): void => {
    if (value === null) return
    const expanded = expandHome(value)
    if (!isWithin(home, expanded)) {
      throw new Error(`${field} must be inside the user home directory`)
    }
  }
  assertHomePath(input.userSkillsDir, 'userSkillsDir')
  assertHomePath(input.detectPath, 'detectPath')
  if (input.userSkillsDir && basename(expandHome(input.userSkillsDir)).toLowerCase() !== 'skills') {
    throw new Error('userSkillsDir must point to a directory named skills')
  }

  if (input.projectSkillsDir) {
    if (isAbsolute(input.projectSkillsDir)) {
      throw new Error('projectSkillsDir must be relative to the project root')
    }
    const normalized = input.projectSkillsDir.replaceAll('\\', '/')
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
      throw new Error('projectSkillsDir cannot escape the project root')
    }
    if (basename(normalized).toLowerCase() !== 'skills') {
      throw new Error('projectSkillsDir must point to a directory named skills')
    }
  }
  return {
    ...input,
    displayName: input.displayName.trim(),
  }
}
