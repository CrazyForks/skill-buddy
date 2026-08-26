import { promises as fs, type Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BUILTIN_PLATFORMS, resolvePlatformOsPath, type PlatformDef } from '../platforms.js'
import { readSkillDirState } from '../skill-io.js'
import type {
  AdapterCapabilities,
  InstallScope,
  InstalledSkill,
  SkillRoot,
  SupplementalSkillRoot,
} from '../types.js'
import { PlatformAdapter } from './platform-adapter.js'
import { exists } from './shared.js'

const LINGXI_PLATFORM = BUILTIN_PLATFORMS.find((platform) => platform.id === 'wps-lingxi')!

export interface LingxiAdapterOptions {
  homeDir?: string
  appDataDir?: string
  os?: NodeJS.Platform
}

/** WPS 灵犀仅支持用户范围的技能，并将官方技能以只读目录暴露给运行时。 */
export class LingxiAdapter extends PlatformAdapter {
  readonly supportsToggle = false
  readonly capabilities: AdapterCapabilities = { canToggle: false }
  private readonly lingxiHomeDir: string
  private readonly lingxiOs: NodeJS.Platform
  private readonly appDataDir?: string

  constructor(
    definitionOrOptions: PlatformDef | LingxiAdapterOptions = LINGXI_PLATFORM,
    homeDir: string = homedir(),
    os: NodeJS.Platform = process.platform,
    appDataDir: string | null | undefined = os === process.platform ? process.env.APPDATA : undefined,
  ) {
    const isOptions = !('id' in definitionOrOptions)
    const options = isOptions ? definitionOrOptions : undefined
    const definition = isOptions ? LINGXI_PLATFORM : definitionOrOptions
    const resolvedHomeDir = options?.homeDir ?? homeDir
    const resolvedOs = options?.os ?? os
    const resolvedAppDataDir = options?.appDataDir ?? appDataDir
    super(definition, resolvedHomeDir, resolvedOs)
    this.lingxiHomeDir = resolvedHomeDir
    this.lingxiOs = resolvedOs
    this.appDataDir = resolvedAppDataDir ?? undefined
  }

  private userDataDir(): string {
    if (this.lingxiOs === 'win32' && this.appDataDir) {
      return join(this.appDataDir, 'WPS 灵犀')
    }
    const detectPath = resolvePlatformOsPath(
      this.def.detectPath,
      this.def.detectPathByOs,
      this.lingxiOs,
    )
    return detectPath!.startsWith('~/')
      ? join(this.lingxiHomeDir, detectPath.slice(2))
      : detectPath!
  }

  override skillsDir(scope: InstallScope): string | null {
    return scope === 'user' ? join(this.userDataDir(), 'serverdir', 'user_skills') : null
  }

  override async detect(): Promise<boolean> {
    const serverDir = join(this.userDataDir(), 'serverdir')
    return (await exists(join(serverDir, 'user_skills'))) ||
      (await exists(join(serverDir, 'official_skills')))
  }

  override async list(scope: InstallScope, projectRoot?: string): Promise<InstalledSkill[]> {
    return (await super.list(scope, projectRoot)).map((installation) => ({
      ...installation,
      canToggle: false,
    }))
  }

  override async install(skill: InstalledSkill['skill'], scope: InstallScope): Promise<string> {
    const path = await super.install(skill, scope)
    await this.refreshRuntime()
    return path
  }

  override async uninstall(name: string, scope: InstallScope): Promise<void> {
    await super.uninstall(name, scope)
    await this.refreshRuntime()
  }

  supplementalRoots(): SkillRoot[] {
    return [
      {
        agent: this.agent,
        scope: 'user',
        path: join(this.userDataDir(), 'serverdir', 'official_skills'),
        origin: 'system',
        readOnly: true,
        canToggle: false,
      },
    ]
  }

  supplementalSkillRoots(): SupplementalSkillRoot[] {
    return this.supplementalRoots().map(({ agent: _agent, canToggle: _canToggle, ...root }) => root)
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
    if (this.lingxiOs !== 'win32') return
    const officialDir = this.supplementalRoots()[0]!.path
    const userDir = this.skillsDir('user')!
    const targetDir = join(this.userDataDir(), 'serverdir', 'target_skills')
    const sources = new Map<string, { name: string; path: string }>()
    for (const root of [officialDir, userDir]) {
      for (const source of await this.listSkillDirectories(root)) {
        sources.set(source.name.toLowerCase(), source)
      }
    }

    if (sources.size === 0 && !(await exists(targetDir))) return
    await fs.mkdir(targetDir, { recursive: true })
    for (const entry of await fs.readdir(targetDir, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue
      await fs.rm(join(targetDir, entry.name), { recursive: true, force: true })
    }
    for (const source of sources.values()) {
      await fs.symlink(source.path, join(targetDir, source.name), 'junction')
    }
  }

  override async setEnabled(
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

/** @deprecated Use LingxiAdapter.supplementalRoots(). */
export function discoverLingxiSupplementalRoots(
  homeDir: string = homedir(),
  os: NodeJS.Platform = process.platform,
): SkillRoot[] {
  return new LingxiAdapter(LINGXI_PLATFORM, homeDir, os, null).supplementalRoots()
}
