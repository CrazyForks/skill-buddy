import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentAdapter } from './types.js'
import type { PlatformDef } from './platforms.js'
import { PlatformAdapter } from './adapters/platform-adapter.js'

const registry = vi.hoisted(() => ({
  adapters: [] as AgentAdapter[],
  definitions: [] as PlatformDef[],
}))
vi.mock('./adapters/index.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./adapters/index.js')>(),
  allAdapters: () => registry.adapters,
  allPlatformDefs: () => registry.definitions,
}))
vi.mock('./platform-installation.js', () => ({
  lookupPlatformApplication: vi.fn().mockResolvedValue('missing'),
}))

import { listPlatformStatus } from './scanner.js'

let home: string
const cursor: PlatformDef = {
  id: 'cursor',
  displayName: 'Cursor',
  detectPath: '~/.cursor',
  userSkillsDir: '~/.cursor/skills',
  projectSkillsDir: '.cursor/skills',
  installPathsByOs: { darwin: ['~/Applications/Cursor.app'] },
  macBundleId: 'com.example.cursor',
}
const qwen: PlatformDef = {
  id: 'qwen-code',
  displayName: 'Qwen Code',
  detectPath: '~/.qwen',
  userSkillsDir: '~/.qwen/skills',
  projectSkillsDir: null,
}

beforeEach(async () => {
  home = await fs.mkdtemp(join(tmpdir(), 'skm-scanner-residue-'))
  await fs.mkdir(join(home, '.cursor/shared/skills'), { recursive: true })
  await fs.mkdir(join(home, '.qwen'), { recursive: true })
  registry.definitions = [cursor, qwen]
  registry.adapters = [new PlatformAdapter(cursor, home, 'darwin'), new PlatformAdapter(qwen, home, 'darwin')]
})

afterEach(async () => {
  registry.adapters = []
  registry.definitions = []
  await fs.rm(home, { recursive: true, force: true })
})

describe('scanner residue protection', () => {
  it('正常情况下保留可信平台的残留候选', async () => {
    const statuses = await listPlatformStatus(home, 'darwin')
    expect(statuses.find((status) => status.id === 'cursor')?.residualPaths).toEqual([join(home, '.cursor')])
  })

  it('保护适配器提供的实际补充目录，而不只保护声明的 detectPath', async () => {
    registry.adapters[1] = Object.assign(registry.adapters[1]!, {
      supplementalRoots: () => [{
        agent: 'qwen-code',
        scope: 'user' as const,
        path: join(home, '.cursor/shared/skills'),
        origin: 'legacy' as const,
        readOnly: true,
      }],
    })
    const statuses = await listPlatformStatus(home, 'darwin')
    expect(statuses.find((status) => status.id === 'cursor')?.residualPaths).toEqual([])
  })

  it('实际补充目录无法查询时不开放清理', async () => {
    registry.adapters[1] = Object.assign(registry.adapters[1]!, {
      supplementalRoots: async () => { throw new Error('permission denied') },
    })
    const statuses = await listPlatformStatus(home, 'darwin')
    expect(statuses.every((status) => status.residualPaths.length === 0)).toBe(true)
  })
})
