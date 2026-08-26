import { promises as fs, type Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  AdapterCapabilities,
  AgentId,
  InstallScope,
  InstalledSkill,
  SupplementalSkillRoot,
} from '../types.js'
import { exists } from './shared.js'
import { SkillDirAdapter } from './skill-dir-adapter.js'
import { readSkillDirState } from '../skill-io.js'

export interface LingxiAdapterOptions {
  homeDir?: string
  appDataDir?: string
  os?: NodeJS.Platform
}

/** WPS 灵犀仅支持用户范围的技能，并将官方技能以只读目录暴露给运行时。 */
export class LingxiAdapter extends SkillDirAdapter {
  readonly agent: AgentId = 'wps-lingxi'
  readonly displayName = 'WPS 灵犀'
  readonly capabilities: AdapterCapabilities = { canToggle: false }

  private readonly userDataDir: string
  private readonly os: NodeJS.Platform

  constructor(options: LingxiAdapterOptions = {}) {
    super()
    const homeDir = options.homeDir ?? homedir()
    this.os = options.os ?? process.platform
    this.userDataDir =
      this.os === 'darwin'
        ? join(homeDir, 'Library', 'Application Support', 'WPS 灵犀')
        : this.os === 'win32'
          ? join(
              options.appDataDir ?? process.env.APPDATA ?? join(homeDir, 'AppData', 'Roaming'),
              'WPS 灵犀',
            )
          : join(homeDir, '.config', 'WPS 灵犀')
  }

  skillsDir(scope: InstallScope): string | null {
    return scope === 'user' ? join(this.userDataDir, 'serverdir', 'user_skills') : null
  }

  async detect(): Promise<boolean> {
    return exists(join(this.userDataDir, 'serverdir'))
  }

  async list(scope: InstallScope, projectRoot?: string): Promise<InstalledSkill[]> {
    return (await super.list(scope, projectRoot)).map((installation) => ({
      ...installation,
      canToggle: false,
    }))
  }

  async install(skill: InstalledSkill['skill'], scope: InstallScope): Promise<string> {
    const path = await super.install(skill, scope)
    await this.refreshRuntime()
    return path
  }

  async uninstall(name: string, scope: InstallScope): Promise<void> {
    await super.uninstall(name, scope)
    await this.refreshRuntime()
  }

  supplementalSkillRoots(): SupplementalSkillRoot[] {
    return [
      {
        scope: 'user',
        path: join(this.userDataDir, 'serverdir', 'official_skills'),
        origin: 'system',
        readOnly: true,
      },
    ]
  }

  reconcileInstallations(installations: InstalledSkill[]): InstalledSkill[] {
    const userSkillNames = new Set(
      installations
        .filter((installation) => installation.origin === 'user')
        .map((installation) => installation.skill.name.toLowerCase()),
    )
    return installations
      .filter(
        (installation) =>
          installation.origin !== 'system' ||
          !userSkillNames.has(installation.skill.name.toLowerCase()),
      )
      .map((installation) => ({ ...installation, canToggle: false }))
  }

  /** Rebuild Windows runtime Junctions from the immutable official and writable user roots. */
  async refreshRuntime(): Promise<void> {
    if (this.os !== 'win32') return
    const officialDir = this.supplementalSkillRoots()[0]!.path
    const userDir = this.skillsDir('user')!
    const targetDir = join(this.userDataDir, 'serverdir', 'target_skills')
    const sources = new Map<string, { name: string; path: string }>()
    for (const root of [officialDir, userDir]) {
      for (const source of await this.listSkillDirectories(root)) {
        sources.set(source.name.toLowerCase(), source)
      }
    }

    if (sources.size === 0 && !(await exists(targetDir))) return
    await fs.mkdir(targetDir, { recursive: true })
    const entries = await fs.readdir(targetDir, { withFileTypes: true })
    for (const entry of entries) {
      const target = join(targetDir, entry.name)
      const source = sources.get(entry.name.toLowerCase())
      if (!entry.isSymbolicLink()) continue
      if (!source || source.name.toLowerCase() === entry.name.toLowerCase()) {
        await fs.rm(target, { recursive: true, force: true })
      }
    }
    for (const source of sources.values()) {
      const target = join(targetDir, source.name)
      if (await exists(target)) continue
      await fs.symlink(source.path, target, 'junction')
    }
  }

  async setEnabled(
    _name: string,
    _enabled: boolean,
    _scope: InstallScope,
    _projectRoot?: string,
  ): Promise<void> {
    throw new Error('WPS 灵犀暂不支持通过 SkillBuddy 启停技能')
  }

  private async listSkillDirectories(root: string): Promise<{ name: string; path: string }[]> {
    let entries: Dirent<string>[]
    try {
      entries = await fs.readdir(root, { withFileTypes: true })
    } catch {
      return []
    }
    const skills: { name: string; path: string }[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const path = join(root, entry.name)
      if (await readSkillDirState(path, entry.name)) skills.push({ name: entry.name, path })
    }
    return skills
  }
}
