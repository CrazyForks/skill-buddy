import { describe, expect, it } from 'vitest'
import { BUILTIN_PLATFORMS } from './platforms.js'

describe('BUILTIN_PLATFORMS', () => {
  it('registers Qwen Code with personal and project Skills roots', () => {
    expect(BUILTIN_PLATFORMS).toContainEqual({
      id: 'qwen-code',
      displayName: 'Qwen Code',
      userSkillsDir: '~/.qwen/skills',
      projectSkillsDir: '.qwen/skills',
      detectPath: '~/.qwen',
    })
  })
})
