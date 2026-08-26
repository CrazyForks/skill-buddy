import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { allAdapters, PlatformAdapter } from '@skillbuddy/core'
import type { PlatformDraft, PlatformDraftError } from '#shared/ipc'
import { expandHome, isWithin } from './path-policy'

/** 所有内置平台都把 Skills 放在这个固定目录名下，推导与识别都依赖它。 */
const SKILLS_DIR_NAME = 'skills'

/** 目录名命中即跳过：系统与工具链目录不可能是 Agent 平台根目录。 */
const IGNORED_NAMES = new Set([
  '.git', '.ssh', '.gnupg', '.aws', '.kube', '.docker', '.npm', '.pnpm', '.yarn',
  '.nvm', '.cache', '.local', '.trash', '.bun', '.cargo', '.rustup', '.gradle',
  '.m2', '.android', '.vscode', '.idea', '.terraform', '.config',
  'library', 'applications', 'desktop', 'documents', 'downloads', 'movies',
  'music', 'pictures', 'public', 'node_modules',
])

/** 目录内出现这些条目视为 Agent 平台特征，命中两项即成为候选。 */
const AGENT_MARKERS = new Set([
  'agents', 'commands', 'prompts', 'plugins', 'subagents', 'sessions', 'memory',
  'history', 'mcp.json', 'mcp_servers.json', 'config.toml', 'settings.json',
  'agents.md', 'claude.md',
])

/** 候选过多时列表会失去参考价值，按信号强度截断。 */
const MAX_CANDIDATES = 20

interface DirectorySignal {
  hasSkillsDir: boolean
  markers: number
}

async function exists(path: string): Promise<boolean> {
  return await fs.access(path).then(
    () => true,
    () => false,
  )
}

/** 把 home 内的绝对路径写回 `~/` 形式，与内置平台定义保持同一种书写。 */
function toTildePath(home: string, target: string): string {
  return `~/${relative(home, target).split(sep).join('/')}`
}

/** 目录名转平台 id：去掉前导点，非字母数字一律折叠成连字符。 */
function toKebabId(name: string): string {
  return name
    .replace(/^\.+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toDisplayName(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function resolveDraftError(home: string, root: string, id: string): PlatformDraftError | null {
  if (root === home) return 'is-home'
  if (!isWithin(home, root)) return 'outside-home'
  if (!id) return 'invalid-id'
  return null
}

/**
 * 由平台根目录推导出完整草稿。三个路径都按内置平台的约定生成，
 * 用户只需确认或改名，不必理解 detectPath 与两个 skills 目录的关系。
 */
function buildDraft(root: string, home: string, hasSkillsDir: boolean): PlatformDraft {
  const id = toKebabId(basename(root))
  const inHome = root !== home && isWithin(home, root)
  const detectPath = inHome ? toTildePath(home, root) : root
  return {
    id,
    displayName: toDisplayName(id) || basename(root),
    detectPath,
    userSkillsDir: `${detectPath}/${SKILLS_DIR_NAME}`,
    projectSkillsDir: id ? `.${id}/${SKILLS_DIR_NAME}` : '',
    hasSkillsDir,
    error: resolveDraftError(home, root, id),
  }
}

/** 只读目录名判断平台特征，避免为筛选候选而读取任何文件内容。 */
async function inspect(path: string): Promise<DirectorySignal | null> {
  let names: string[]
  try {
    names = (await fs.readdir(path)).map((name) => name.toLowerCase())
  } catch {
    return null
  }
  const hasSkillsDir = names.includes(SKILLS_DIR_NAME)
  const markers = names.filter((name) => AGENT_MARKERS.has(name)).length
  return hasSkillsDir || markers >= 2 ? { hasSkillsDir, markers } : null
}

/** 扫描范围限定为 home 一级目录与 `~/.config` 一级目录，后者覆盖 OpenCode 这类约定。 */
async function candidateRoots(home: string): Promise<string[]> {
  const roots: string[] = []
  const collect = async (parent: string): Promise<void> => {
    let entries
    try {
      entries = await fs.readdir(parent, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      if (IGNORED_NAMES.has(entry.name.toLowerCase())) continue
      roots.push(join(parent, entry.name))
    }
  }
  await collect(home)
  await collect(join(home, '.config'))
  return roots
}

/**
 * 列出尚未注册的疑似 Agent 平台目录，让用户勾选而不是手写四段路径。
 * 只返回通过特征过滤的目录，不把整个 home 的目录结构交给渲染进程。
 */
export async function discoverPlatformCandidates(): Promise<PlatformDraft[]> {
  const home = resolve(homedir())
  const registered = new Set(
    allAdapters()
      .filter((adapter): adapter is PlatformAdapter => adapter instanceof PlatformAdapter)
      .map((adapter) => expandHome(adapter.def.detectPath)),
  )
  const roots = await candidateRoots(home)
  const signals = await Promise.all(
    roots.map(async (root) => {
      if (registered.has(root)) return null
      const signal = await inspect(root)
      return signal && { root, ...signal }
    }),
  )
  return signals
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort(
      (a, b) =>
        Number(b.hasSkillsDir) - Number(a.hasSkillsDir) ||
        b.markers - a.markers ||
        a.root.localeCompare(b.root),
    )
    .slice(0, MAX_CANDIDATES)
    .map((item) => buildDraft(item.root, home, item.hasSkillsDir))
}

/** 手动选目录的入口；选中的若是 skills 目录本身，自动回退到它的父目录。 */
export async function derivePlatformDraft(selected: string): Promise<PlatformDraft> {
  const home = resolve(homedir())
  const path = resolve(selected)
  const isSkillsDir = basename(path).toLowerCase() === SKILLS_DIR_NAME
  const root = isSkillsDir ? dirname(path) : path
  const hasSkillsDir = isSkillsDir || (await exists(join(root, SKILLS_DIR_NAME)))
  return buildDraft(root, home, hasSkillsDir)
}
