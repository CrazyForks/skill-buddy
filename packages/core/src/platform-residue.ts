import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { exists } from './adapters/shared.js'
import {
  lookupPlatformApplication,
  type ApplicationLookup,
  type PlatformInstallationState,
} from './platform-installation.js'
import {
  resolvePlatformOsList,
  resolvePlatformOsPath,
  type PlatformDef,
} from './platforms.js'

/**
 * 判断 `child` 是否等于 `parent`，或位于 `parent` 之下。纯字符串比较，不访问磁盘。
 * 用于确认某个残留候选不会把别的平台的根目录一起框进去。
 */
export function containsPath(parent: string, child: string): boolean {
  if (parent === child) return true
  const rel = relative(parent, child)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/** 展开 `~/` 前缀；其余路径按当前工作目录解析。 */
export function expandResiduePath(path: string, homeDir: string): string {
  return path.startsWith('~/') ? resolve(homeDir, path.slice(2)) : resolve(path)
}

/** 应用安装状态与清理候选。只有系统查询确认未找到应用时才允许提供候选。 */
export interface PlatformResidue {
  installationState: PlatformInstallationState
  /** 现存的候选目录；应用仍在或状态未知时恒为空数组。 */
  paths: string[]
}

/** 路径访问失败不等于不存在，只有 ENOENT / ENOTDIR 才能作为缺失证据。 */
async function installationPathState(path: string): Promise<PlatformInstallationState> {
  try {
    await fs.lstat(path)
    return 'installed'
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unknown'
  }
}

/**
 * 该平台在这个系统上的清理候选：`detectPath` 加上自己声明的残留目录。
 *
 * 只保留当前真实存在的项。候选项按声明顺序去重，路径相同的条目只出现一次。
 */
export async function listResidueCandidates(
  def: PlatformDef,
  homeDir: string,
  os: NodeJS.Platform,
): Promise<string[]> {
  const declared = [
    resolvePlatformOsPath(def.detectPath, def.detectPathByOs, os),
    ...resolvePlatformOsList(def.residualPathsByOs, os),
  ]
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const path of declared) {
    const absolute = expandResiduePath(path, homeDir)
    if (seen.has(absolute)) continue
    seen.add(absolute)
    if (await exists(absolute)) candidates.push(absolute)
  }
  return candidates
}

/**
 * 判定一个平台是否「应用已删除、只剩残留目录」。
 *
 * 返回 null 表示该平台在这个系统上不参与判定 —— 没声明 `installPathsByOs`
 * 的 OS，以及所有 CLI 类平台都走这条路，永不产生残留提示。
 */
export async function detectPlatformResidue(
  def: PlatformDef,
  homeDir: string = homedir(),
  os: NodeJS.Platform = process.platform,
  lookup: ApplicationLookup = lookupPlatformApplication,
): Promise<PlatformResidue | null> {
  const installPaths = resolvePlatformOsList(def.installPathsByOs, os)
  if (installPaths.length === 0) return null

  const states = await Promise.all(installPaths.map((path) =>
    installationPathState(expandResiduePath(path, homeDir)),
  ))
  if (states.includes('installed')) return { installationState: 'installed', paths: [] }
  if (states.includes('unknown') || !def.macBundleId || os !== 'darwin') {
    return { installationState: 'unknown', paths: [] }
  }

  const candidates = await listResidueCandidates(def, homeDir, os)
  if (candidates.length === 0) return { installationState: 'unknown', paths: [] }
  const installationState = await lookup(def.macBundleId, os).catch(() => 'unknown' as const)
  return {
    installationState,
    paths: installationState === 'missing' ? candidates : [],
  }
}

/** 一个平台自己占用的根目录：本体路径与数据目录，都按当前 OS 解析。 */
export function platformOwnedRoots(
  def: PlatformDef,
  homeDir: string,
  os: NodeJS.Platform,
): string[] {
  const skillsDir = resolvePlatformOsPath(def.userSkillsDir, def.userSkillsDirByOs, os)
  return [
    resolvePlatformOsPath(def.detectPath, def.detectPathByOs, os),
    ...(skillsDir ? [skillsDir] : []),
    ...resolvePlatformOsList(def.installPathsByOs, os),
    ...resolvePlatformOsList(def.residualPathsByOs, os),
  ].map((path) => expandResiduePath(path, homeDir))
}

/**
 * 按声明路径排除覆盖其它平台根目录的候选。
 * 此函数不解析软链，实际清理白名单必须再经过 filterSafeResidueCandidates。
 */
export function filterProtectedCandidates(
  candidates: readonly string[],
  protectedRoots: readonly string[],
): string[] {
  if (protectedRoots.length === 0) return [...candidates]
  return candidates.filter(
    (candidate) => !protectedRoots.some((root) => containsPath(candidate, root)),
  )
}

/**
 * 清理前的物理路径保护：既检查声明路径，也检查解析软链后的真实目录。
 * 受保护根目录查询遇到权限或 I/O 异常时全部拒绝；确实不存在的根保留词法保护。
 * 候选必须是主目录内的普通目录，避免展示最终无法安全清理的文件或软链。
 */
export async function filterSafeResidueCandidates(
  candidates: readonly string[],
  protectedRoots: readonly string[],
  homeDir: string,
): Promise<string[]> {
  try {
    const realHome = await fs.realpath(homeDir)
    const lexicalRoots = [...new Set([homeDir, ...protectedRoots].map((path) => resolve(path)))]
    const physicalRoots = [realHome]
    for (const root of lexicalRoots) {
      try {
        physicalRoots.push(await fs.realpath(root))
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
      }
    }

    const safe: string[] = []
    for (const candidate of filterProtectedCandidates(candidates, lexicalRoots)) {
      try {
        const entry = await fs.lstat(candidate)
        if (entry.isSymbolicLink() || !entry.isDirectory()) continue
        const realPath = await fs.realpath(candidate)
        if (realPath === realHome || !containsPath(realHome, realPath)) continue
        if (physicalRoots.some((root) => containsPath(realPath, root))) continue
        safe.push(candidate)
      } catch {
        continue
      }
    }
    return safe
  } catch {
    return []
  }
}
