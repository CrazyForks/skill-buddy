import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/** 不将查询失败、权限异常或不支持的平台当作「已卸载」。 */
export type PlatformInstallationState = 'installed' | 'missing' | 'unknown'
export type ApplicationLookup = (
  bundleId: string,
  os: NodeJS.Platform,
) => Promise<PlatformInstallationState>

const execFileAsync = promisify(execFile)
const queryOptions = { timeout: 5_000, maxBuffer: 1024 * 1024, encoding: 'utf8' } as const

/** 通过 NSWorkspace 查询注册应用和正在运行的应用，不依赖包名与安装位置。 */
const workspaceQuery = `
ObjC.import('AppKit')
function run(argv) {
  const workspace = $.NSWorkspace.sharedWorkspace
  const running = workspace.runningApplications
  for (let i = 0; i < running.count; i++) {
    if (ObjC.unwrap(running.objectAtIndex(i).bundleIdentifier) === argv[0]) return 'installed'
  }
  const url = workspace.URLForApplicationWithBundleIdentifier($(argv[0]))
  return url.isNil() ? 'missing' : 'installed'
}
`

/**
 * 默认路径不存在后，用 Bundle ID 补查系统注册表和 Spotlight 索引。
 * 任一来源找到应用即保留数据；只有两次查询都成功且无匹配项时才返回 missing。
 * 不缓存否定结果，确保清理时重新查询；命令不经过 shell，Bundle ID 也不插入脚本。
 */
export const lookupPlatformApplication: ApplicationLookup = async (bundleId, os) => {
  if (os !== 'darwin' || !/^[a-zA-Z0-9.-]+$/.test(bundleId)) {
    return 'unknown'
  }
  try {
    const workspace = await execFileAsync(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', workspaceQuery, bundleId],
      queryOptions,
    )
    const state = workspace.stdout.trim()
    if (state === 'installed') return 'installed'
    if (state !== 'missing' || workspace.stderr.trim()) return 'unknown'

    const spotlight = await execFileAsync(
      '/usr/bin/mdfind',
      ['-0', `kMDItemCFBundleIdentifier == "${bundleId}"`],
      queryOptions,
    )
    if (spotlight.stdout.length > 0) return 'installed'
    return spotlight.stderr.trim() ? 'unknown' : 'missing'
  } catch {
    return 'unknown'
  }
}
