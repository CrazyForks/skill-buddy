import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { InstalledSkill, Skill } from './types.js'

/** One physical installation of a skill, with a content fingerprint. */
export interface Installation extends InstalledSkill {
  contentHash: string
}

/**
 * The unit the UI manages: one skill name aggregated across every agent
 * it is installed in. `hasDrift` is true when installations disagree on
 * content (per hash), which the UI surfaces as a warning badge.
 */
export interface AggregatedSkill {
  name: string
  description: string
  version?: string
  tags: string[]
  installations: Installation[]
  hasDrift: boolean
  /** 是否存在 frontmatter 解析失败的安装，UI 据此提示用户去修文件。 */
  hasParseError: boolean
}

async function hashSkill(skill: Skill): Promise<string> {
  const hash = createHash('sha256')
  const fields = {
    description: skill.description,
    version: skill.version ?? '',
    tags: [...(skill.tags ?? [])].sort(),
    // SKILL.md 在 Windows 与 Unix 之间复制时可能只改变换行格式，
    // 这种平台差异不应被识别为内容漂移。
    content: skill.content.replace(/\r\n?/g, '\n'),
  }
  hash.update(JSON.stringify(fields))
  for (const [relativePath, source] of Object.entries(skill.resources ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    hash.update(`\nresource:${relativePath}\n`)
    try {
      hash.update(await fs.readFile(source))
    } catch {
      hash.update('[unreadable]')
    }
  }
  return hash.digest('hex')
}

/**
 * Group raw scan results by skill name. Description/version/tags are
 * taken from the first installation; the fingerprint covers canonical
 * metadata, Markdown content and every resource file's bytes.
 */
export async function aggregateSkills(items: InstalledSkill[]): Promise<AggregatedSkill[]> {
  const byName = new Map<string, Installation[]>()
  const installations = await Promise.all(
    items.map(async (item): Promise<Installation> => ({
      ...item,
      contentHash: await hashSkill(item.skill),
    })),
  )
  for (const installation of installations) {
    const list = byName.get(installation.skill.name) ?? []
    list.push(installation)
    byName.set(installation.skill.name, list)
  }
  return [...byName.entries()]
    .map(([name, installations]) => {
      // 解析失败的安装只有兜底占位内容，既不能代表这个 Skill，也不该参与漂移比对。
      const readable = installations.filter((item) => !item.parseError)
      const first = readable[0] ?? installations[0]!
      const hashes = new Set(readable.map((i) => i.contentHash))
      return {
        name,
        description: first.skill.description,
        version: first.skill.version,
        tags: first.skill.tags ?? [],
        installations,
        hasDrift: hashes.size > 1,
        hasParseError: readable.length < installations.length,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
