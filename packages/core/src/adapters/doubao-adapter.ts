import { homedir } from 'node:os'
import { join } from 'node:path'
import { BUILTIN_PLATFORMS, type PlatformDef } from '../platforms.js'
import type { SkillRoot } from '../types.js'
import { PlatformAdapter } from './platform-adapter.js'

/** 豆包 adapter, including the desktop application's bundled Skill root. */
export class DoubaoAdapter extends PlatformAdapter {
  constructor(
    def: PlatformDef,
    private readonly doubaoHomeDir: string = homedir(),
  ) {
    super(def, doubaoHomeDir)
  }

  supplementalRoots(): SkillRoot[] {
    return [
      {
        agent: this.agent,
        scope: 'user',
        path: join(
          this.doubaoHomeDir,
          'Library',
          'Application Support',
          'Doubao',
          'Default',
          '.doubao',
          'agent_mode',
          'workspace',
          '.skills',
        ),
        origin: 'system',
        readOnly: true,
        canToggle: false,
      },
    ]
  }
}

export function discoverDoubaoSupplementalRoots(homeDir: string = homedir()): SkillRoot[] {
  const def = BUILTIN_PLATFORMS.find((platform) => platform.id === 'doubao')!
  return new DoubaoAdapter(def, homeDir).supplementalRoots()
}
