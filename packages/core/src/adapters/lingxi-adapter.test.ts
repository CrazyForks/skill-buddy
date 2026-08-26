import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_PLATFORMS } from '../platforms.js'
import { LingxiAdapter } from './lingxi-adapter.js'

const definition = BUILTIN_PLATFORMS.find((platform) => platform.id === 'wps-lingxi')!

describe('LingxiAdapter', () => {
  it('uses APPDATA for Windows when provided', () => {
    const adapter = new LingxiAdapter(definition, '/home/test', 'win32', 'D:/Roaming')
    expect(adapter.skillsDir('user')).toBe(
      join('D:/Roaming', 'WPS 灵犀', 'serverdir', 'user_skills'),
    )
  })

  it('requires a real Lingxi server skills directory for detection', async () => {
    const home = await fs.mkdtemp(join('/tmp', 'skillbuddy-lingxi-'))
    try {
      const adapter = new LingxiAdapter(definition, home, 'linux')
      expect(await adapter.detect()).toBe(false)
      await fs.mkdir(join(home, '.config', 'WPS 灵犀', 'serverdir', 'official_skills'), {
        recursive: true,
      })
      expect(await adapter.detect()).toBe(true)
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })

  it('exposes official skills as a read-only supplemental root', () => {
    const adapter = new LingxiAdapter(definition, '/home/test', 'darwin')
    expect(adapter.supplementalRoots()).toEqual([
      expect.objectContaining({
        path: join(
          '/home/test',
          'Library',
          'Application Support',
          'WPS 灵犀',
          'serverdir',
          'official_skills',
        ),
        readOnly: true,
        canToggle: false,
      }),
    ])
  })
})
