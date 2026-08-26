import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BUILTIN_PLATFORMS, type PlatformDef } from '../platforms.js'
import type { SkillRoot } from '../types.js'
import { exists } from './shared.js'
import { PlatformAdapter } from './platform-adapter.js'

async function listDirectories(path: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

/** Codex adapter, including CODEX_HOME and plugin/system Skill roots. */
export class CodexAdapter extends PlatformAdapter {
  private readonly codexHome: string

  constructor(
    def: PlatformDef,
    homeDir: string = homedir(),
    codexHome: string = process.env.CODEX_HOME || join(homeDir, '.codex'),
  ) {
    super(def, homeDir)
    this.codexHome = codexHome
  }

  override async detect(): Promise<boolean> {
    return exists(this.codexHome)
  }

  async supplementalRoots(): Promise<SkillRoot[]> {
    const roots: SkillRoot[] = [
      {
        agent: this.agent,
        scope: 'user',
        path: join(this.codexHome, 'skills'),
        origin: 'legacy',
        readOnly: true,
        canToggle: false,
      },
      {
        agent: this.agent,
        scope: 'user',
        path: join(this.codexHome, 'skills', '.system'),
        origin: 'system',
        readOnly: true,
        canToggle: false,
      },
      {
        agent: this.agent,
        scope: 'user',
        path: '/etc/codex/skills',
        origin: 'admin',
        readOnly: true,
        canToggle: false,
      },
    ]

    const cacheRoot = join(this.codexHome, 'plugins', 'cache')
    for (const marketplace of await listDirectories(cacheRoot)) {
      const marketplacePath = join(cacheRoot, marketplace)
      for (const plugin of await listDirectories(marketplacePath)) {
        const pluginPath = join(marketplacePath, plugin)
        const candidates = await Promise.all(
          (await listDirectories(pluginPath)).map(async (version) => {
            const versionPath = join(pluginPath, version)
            const skillsPath = join(versionPath, 'skills')
            if (!(await exists(skillsPath))) return null
            try {
              return { skillsPath, modifiedAt: (await fs.stat(versionPath)).mtimeMs }
            } catch {
              return null
            }
          }),
        )
        const latest = candidates
          .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
          .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]
        if (!latest) continue
        roots.push({
          agent: this.agent,
          scope: 'user',
          path: latest.skillsPath,
          origin: 'plugin',
          readOnly: true,
          canToggle: false,
        })
      }
    }
    return roots
  }
}

export async function discoverCodexSupplementalRoots(
  homeDir: string = homedir(),
  codexHome: string = process.env.CODEX_HOME || join(homeDir, '.codex'),
): Promise<SkillRoot[]> {
  const def = BUILTIN_PLATFORMS.find((platform) => platform.id === 'codex')!
  return new CodexAdapter(def, homeDir, codexHome).supplementalRoots()
}
