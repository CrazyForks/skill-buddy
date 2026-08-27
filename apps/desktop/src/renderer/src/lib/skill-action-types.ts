import type { AggregatedSkill } from '@skillbuddy/core'
import type { InstallTarget } from '#shared/ipc'
import type { SkillInstallation } from '@/lib/skill-installations'

export type BatchAction = 'enable' | 'disable' | 'uninstall'
export type ToggleContext = 'agent' | 'scope' | 'scopeAgent' | 'global'

/** 批量确认时冻结的目标快照，避免用户确认后筛选变化影响执行范围。 */
export interface BatchItem {
  name: string
  targets: InstallTarget[]
  paths: string[]
}

export interface BatchRequest {
  action: BatchAction
  items: BatchItem[]
}

export interface UninstallRequest {
  skill: AggregatedSkill
  platformId: string | null
  projectFilter: string | null
  installations: SkillInstallation[]
}

/** 技能包删除确认时冻结的名称与成员数量。 */
export interface GroupDeleteRequest {
  groupName: string
  skillCount: number
}

/** 技能包启停确认时冻结的目标快照，避免确认后筛选变化影响执行范围。 */
export interface GroupToggleRequest {
  groupName: string
  enabled: boolean
  /** 文案 key，区分「当前筛选范围」与「全部安装」两种入口。 */
  confirmMessageKey: string
  items: { name: string; targets: InstallTarget[] }[]
}

export interface ToggleRequest {
  skill: AggregatedSkill
  platformId: string | null
  enabled: boolean
  context: ToggleContext
  installations: SkillInstallation[]
}
