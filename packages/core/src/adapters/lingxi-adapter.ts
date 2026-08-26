import { homedir } from 'node:os'
import { join } from 'node:path'
import { BUILTIN_PLATFORMS, resolvePlatformOsPath, type PlatformDef } from '../platforms.js'
import type { InstallScope, SkillRoot } from '../types.js'
import { exists } from './shared.js'
import { PlatformAdapter } from './platform-adapter.js'

/** WPS 灵犀的独立适配器，封装其 userData 和派生 Skill 根目录约定。 */
export class LingxiAdapter extends PlatformAdapter {
  readonly supportsToggle = false
  private readonly lingxiOs: NodeJS.Platform
  private readonly lingxiHomeDir: string
  private readonly appDataDir?: string

  constructor(
    def: PlatformDef,
    homeDir: string = homedir(),
    os: NodeJS.Platform = process.platform,
    appDataDir: string | null | undefined = os === process.platform ? process.env.APPDATA : undefined,
  ) {
    super(def, homeDir, os)
    this.lingxiHomeDir = homeDir
    this.lingxiOs = os
    this.appDataDir = appDataDir ?? undefined
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
      ? join(this.lingxiHomeDir, detectPath!.slice(2))
      : detectPath!
  }

  override skillsDir(scope: InstallScope, projectRoot?: string): string | null {
    if (scope === 'project') return null
    return join(this.userDataDir(), 'serverdir', 'user_skills')
  }

  override async detect(): Promise<boolean> {
    const serverDir = join(this.userDataDir(), 'serverdir')
    return (await exists(join(serverDir, 'user_skills'))) ||
      (await exists(join(serverDir, 'official_skills')))
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
}

/** @deprecated Use LingxiAdapter.supplementalRoots(). */
export function discoverLingxiSupplementalRoots(
  homeDir: string = homedir(),
  os: NodeJS.Platform = process.platform,
): SkillRoot[] {
  const def = BUILTIN_PLATFORMS.find((platform) => platform.id === 'wps-lingxi')!
  return new LingxiAdapter(def, homeDir, os, null).supplementalRoots()
}
