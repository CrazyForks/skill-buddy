import { describe, expect, it } from 'vitest'
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  mergePreset,
  parsePresetDocument,
  serializePreset,
} from './preset-format.js'

describe('Preset portable format', () => {
  it('只序列化版本、名称和去重后的 Skill 名称', () => {
    const content = serializePreset({
      name: ' Frontend ',
      skills: ['vue', ' vite ', 'vue'],
    })
    expect(JSON.parse(content)).toEqual({
      kind: 'skillbuddy-preset',
      version: 1,
      preset: { name: 'Frontend', skills: ['vue', 'vite'] },
    })
    expect(content).not.toContain('path')
    expect(content).not.toContain('enabled')
  })

  it('解析时标准化名称并稳定去重，允许空合集', () => {
    expect(
      parsePresetDocument(
        JSON.stringify({
          kind: 'skillbuddy-preset',
          version: 1,
          preset: { name: ' Docs ', skills: ['pdf', ' docx ', 'pdf'] },
        }),
      ),
    ).toEqual({ name: 'Docs', skills: ['pdf', 'docx'] })

    expect(
      parsePresetDocument(
        JSON.stringify({
          kind: 'skillbuddy-preset',
          version: 1,
          preset: { name: 'Empty', skills: [] },
        }),
      ),
    ).toEqual({ name: 'Empty', skills: [] })
  })

  it.each([
    '{}',
    '{"kind":"skillbuddy-preset","version":2,"preset":{"name":"A","skills":[]}}',
    '{"kind":"skillbuddy-preset","version":1,"preset":{"name":"","skills":[]}}',
    '{"kind":"skillbuddy-preset","version":1,"preset":{"name":"A","skills":[""]}}',
    '{"kind":"skillbuddy-preset","version":1,"preset":{"name":"A","skills":[],"enabled":true}}',
    '{"kind":"skillbuddy-preset","version":1,"preset":{"name":"A","skills":[]},"path":"/tmp"}',
  ])('拒绝非法或白名单外输入：%s', (content) => {
    expect(() => parsePresetDocument(content)).toThrow()
  })

  it('新建分组，并对同名分组稳定合并且保持幂等', () => {
    const created = mergePreset([], { name: 'Frontend', skills: ['vue'] })
    expect(created).toEqual({
      groups: [{ name: 'Frontend', skills: ['vue'] }],
      result: 'created',
      addedSkills: 1,
    })

    const merged = mergePreset(created.groups, {
      name: 'Frontend',
      skills: ['vue', 'vite', 'vitest'],
    })
    expect(merged).toEqual({
      groups: [{ name: 'Frontend', skills: ['vue', 'vite', 'vitest'] }],
      result: 'merged',
      addedSkills: 2,
    })

    const unchanged = mergePreset(merged.groups, {
      name: 'Frontend',
      skills: ['vitest', 'vue'],
    })
    expect(unchanged.result).toBe('unchanged')
    expect(unchanged.groups).toBe(merged.groups)
  })
})

describe('Preset 技能包描述', () => {
  const doc = (preset: unknown): string =>
    JSON.stringify({ kind: 'skillbuddy-preset', version: 1, preset })

  it('有描述时写入并去掉首尾空白', () => {
    expect(
      JSON.parse(serializePreset({ name: 'Docs', skills: ['pdf'], description: '  文档相关  ' })),
    ).toEqual({
      kind: 'skillbuddy-preset',
      version: 1,
      preset: { name: 'Docs', skills: ['pdf'], description: '文档相关' },
    })
  })

  it.each([undefined, '', '   '])('没有实际描述时不写这个键，导出与旧版一致：%s', (value) => {
    const content = serializePreset({ name: 'Docs', skills: ['pdf'], description: value })
    expect(JSON.parse(content).preset).toEqual({ name: 'Docs', skills: ['pdf'] })
    expect(content).not.toContain('description')
  })

  it('解析带描述的文档，并把空描述折叠掉', () => {
    expect(parsePresetDocument(doc({ name: 'Docs', skills: [], description: ' 说明 ' }))).toEqual({
      name: 'Docs',
      skills: [],
      description: '说明',
    })
    expect(parsePresetDocument(doc({ name: 'Docs', skills: [], description: '  ' }))).toEqual({
      name: 'Docs',
      skills: [],
    })
  })

  it('接受恰好达到上限的描述', () => {
    const description = 'a'.repeat(GROUP_DESCRIPTION_MAX_LENGTH)
    expect(parsePresetDocument(doc({ name: 'A', skills: [], description }))).toEqual({
      name: 'A',
      skills: [],
      description,
    })
  })

  it.each([
    ['超过上限', 'a'.repeat(GROUP_DESCRIPTION_MAX_LENGTH + 1)],
    ['非字符串', 42],
  ])('拒绝非法描述：%s', (_label, description) => {
    expect(() => parsePresetDocument(doc({ name: 'A', skills: [], description }))).toThrow()
  })

  it('合并同名技能包时不覆盖已有描述', () => {
    const groups = [{ name: 'Frontend', skills: ['vue'], description: '本地说明' }]
    const merged = mergePreset(groups, {
      name: 'Frontend',
      skills: ['vue', 'vite'],
      description: '导入说明',
    })
    expect(merged.result).toBe('merged')
    expect(merged.groups[0]).toEqual({
      name: 'Frontend',
      skills: ['vue', 'vite'],
      description: '本地说明',
    })
  })
})
