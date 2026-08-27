import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BUILTIN_PLATFORMS, type PlatformDef } from '../platforms.js'
import type { SkillRoot } from '../types.js'
import { PlatformAdapter } from './platform-adapter.js'

interface ClaudePluginRecord {
  scope?: string
  installPath?: string
  projectPath?: string
}

/** Claude Code adapter, including plugin roots declared by its installed manifest. */
export class ClaudeCodeAdapter extends PlatformAdapter {
  constructor(
    def: PlatformDef,
    private readonly claudeHomeDir: string = homedir(),
  ) {
    super(def, claudeHomeDir)
  }

  async supplementalRoots(): Promise<SkillRoot[]> {
    const manifestPath = join(this.claudeHomeDir, '.claude', 'plugins', 'installed_plugins.json')
    let parsed: { plugins?: Record<string, ClaudePluginRecord[]> }
    try {
      parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as typeof parsed
    } catch {
      return []
    }

    const roots: SkillRoot[] = []
    for (const records of Object.values(parsed.plugins ?? {})) {
      if (!Array.isArray(records)) continue
      for (const record of records) {
        if (typeof record.installPath !== 'string') continue
        const isProject = record.scope === 'local' && typeof record.projectPath === 'string'
        roots.push({
          agent: this.agent,
          scope: isProject ? 'project' : 'user',
          path: join(record.installPath, 'skills'),
          projectRoot: isProject ? record.projectPath : undefined,
          origin: 'plugin',
          readOnly: true,
          canToggle: false,
        })
      }
    }
    return roots
  }
}

export async function discoverClaudePluginRoots(homeDir: string = homedir()): Promise<SkillRoot[]> {
  const def = BUILTIN_PLATFORMS.find((platform) => platform.id === 'claude-code')!
  return new ClaudeCodeAdapter(def, homeDir).supplementalRoots()
}
