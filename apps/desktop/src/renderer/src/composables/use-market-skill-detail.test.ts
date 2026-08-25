import type { FoundSkill, Skill } from '@skillbuddy/core'
import type { InstallTarget } from '#shared/ipc'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketItem } from '@/lib/market'
import { useMarketSkillDetail } from './useMarketSkillDetail'

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onBeforeUnmount: vi.fn(),
    onMounted: vi.fn(),
  }
})

const mocks = vi.hoisted(() => ({
  cleanupImport: vi.fn().mockResolvedValue(undefined),
  fetchMarketSkillSource: vi.fn(),
  installSkill: vi.fn(),
  marketSkillSource: vi.fn(),
  matchMarketSkill: vi.fn(),
  showToast: vi.fn(),
}))

vi.mock('@/composables/useSkills', () => ({
  useSkills: () => ({ installSkill: mocks.installSkill }),
}))

vi.mock('@/composables/useSettings', () => ({
  useSettings: () => ({
    groups: { value: [] },
    marketSkillSources: { value: {} },
  }),
}))

vi.mock('@/composables/useToast', () => ({ showToast: mocks.showToast }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/market', () => ({
  fetchMarketSkillSource: mocks.fetchMarketSkillSource,
  marketSkillSource: mocks.marketSkillSource,
  matchMarketSkill: mocks.matchMarketSkill,
}))

const item: MarketItem = {
  key: 'sksh:debug-install-skill',
  kind: 'skills-sh',
  name: 'debug-install-skill',
  description: '',
  installs: 1,
  stars: null,
  icon: null,
  sourceLabel: 'owner/repository',
  link: 'https://github.com/owner/repository',
  repo: 'owner/repository',
  skillId: 'debug-install-skill',
}

const target: InstallTarget = { agent: 'codex', scope: 'user' }
const sourceSkill: Skill = {
  name: item.name,
  description: 'debug',
  content: '# debug',
}
const found: FoundSkill = { dir: 'C:/temp/debug-install-skill', skill: sourceSkill }

describe('useMarketSkillDetail', () => {
  beforeEach(() => {
    mocks.cleanupImport.mockClear()
    mocks.fetchMarketSkillSource.mockReset()
    mocks.fetchMarketSkillSource.mockResolvedValue({
      root: 'C:/temp/market-source',
      items: [found],
    })
    mocks.installSkill.mockReset()
    mocks.installSkill.mockResolvedValue([{ target, ok: true }])
    mocks.marketSkillSource.mockReset()
    mocks.marketSkillSource.mockReturnValue({
      kind: 'skills-sh',
      repo: item.repo,
      skillId: item.skillId,
    })
    mocks.matchMarketSkill.mockReset()
    mocks.matchMarketSkill.mockReturnValue(found)
    mocks.showToast.mockClear()
    globalThis.window = {
      skillsManager: {
        cleanupImport: mocks.cleanupImport,
      },
    } as unknown as Window & typeof globalThis
  })

  it('安装成功后显示成功提示，再返回工作台', async () => {
    const onInstalled = vi.fn()
    const detail = useMarketSkillDetail({ item, onInstalled })
    detail.setTargets([target])

    await detail.install()

    expect(mocks.installSkill).toHaveBeenCalledWith(sourceSkill, [target])
    expect(mocks.showToast).toHaveBeenCalledWith({ message: 'market.installSuccess' })
    expect(onInstalled).toHaveBeenCalledOnce()
  })
})
