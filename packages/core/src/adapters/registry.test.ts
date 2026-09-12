import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformDef } from '../platforms.js'

beforeEach(() => vi.resetModules())

describe('runtime platform registration', () => {
  it('自定义平台不能通过额外字段获得清理权限', async () => {
    const { registerPlatform, allPlatformDefs } = await import('./index.js')
    const definition: PlatformDef = {
      id: 'untrusted-agent',
      displayName: 'Untrusted Agent',
      userSkillsDir: '~/Documents/skills',
      projectSkillsDir: null,
      detectPath: '~/Documents',
      installPathsByOs: { darwin: ['/missing.app'] },
      residualPathsByOs: { darwin: ['~/Documents'] },
      macBundleId: 'com.example.missing',
    }
    registerPlatform(definition)
    const registered = allPlatformDefs().find((def) => def.id === definition.id)
    expect(registered?.installPathsByOs).toBeUndefined()
    expect(registered?.residualPathsByOs).toBeUndefined()
    expect(registered?.macBundleId).toBeUndefined()
  })

  it('覆盖内置 id 后不会将内置清理权限嫁接到自定义目录', async () => {
    const { registerPlatform, allPlatformDefs } = await import('./index.js')
    const original = allPlatformDefs().find((def) => def.id === 'cursor')!
    expect(original.installPathsByOs?.darwin?.length).toBeGreaterThan(0)
    registerPlatform({ ...original, detectPath: '~/Documents' })
    const overridden = allPlatformDefs().find((def) => def.id === 'cursor')!
    expect(overridden.detectPath).toBe('~/Documents')
    expect(overridden.installPathsByOs).toBeUndefined()
    expect(overridden.macBundleId).toBeUndefined()
    expect(original.detectPath).toBe('~/.cursor')
  })
})
