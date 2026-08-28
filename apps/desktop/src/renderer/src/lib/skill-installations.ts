import type { AggregatedSkill } from '@skillbuddy/core'

export type SkillInstallation = AggregatedSkill['installations'][number]

export interface SkillInstallationFilter {
  platformId?: string | null
  /** null = all; "user" = user scope; any other value = project root. */
  projectFilter?: string | null
  ownershipFilter?: 'managed' | 'agent' | null
}

export interface SkillInstallationStatus {
  writable: SkillInstallation[]
  toggleable: SkillInstallation[]
  disabledCount: number
  readOnly: boolean
  allDisabled: boolean
  partiallyDisabled: boolean
  hasEnabled: boolean
}

/** 汇总当前可见安装集合的可编辑和启停状态。 */
export function deriveSkillInstallationStatus(
  installations: SkillInstallation[],
): SkillInstallationStatus {
  const writable = installations.filter((installation) => !installation.readOnly)
  const toggleable = writable.filter((installation) => installation.canToggle !== false)
  const disabledCount = toggleable.filter((installation) => installation.enabled === false).length
  return {
    writable,
    toggleable,
    disabledCount,
    readOnly: installations.length > 0 && writable.length === 0,
    allDisabled: toggleable.length > 0 && disabledCount === toggleable.length,
    partiallyDisabled: disabledCount > 0 && disabledCount < toggleable.length,
    hasEnabled: toggleable.some((installation) => installation.enabled !== false),
  }
}

/** Match one installation against the current Agent, scope and ownership view. */
export function matchesSkillInstallation(
  installation: SkillInstallation,
  filter: SkillInstallationFilter,
): boolean {
  if (filter.platformId && installation.agent !== filter.platformId) return false
  if (filter.projectFilter === 'user' && installation.scope !== 'user') return false
  if (
    filter.projectFilter &&
    filter.projectFilter !== 'user' &&
    installation.projectRoot !== filter.projectFilter
  )
    return false
  if (filter.ownershipFilter === 'managed' && installation.readOnly) return false
  if (filter.ownershipFilter === 'agent' && !installation.readOnly) return false
  return true
}

/** Return writable installations in the current view, deduplicated by physical path. */
export function manageableSkillInstallations(
  skill: AggregatedSkill,
  filter: SkillInstallationFilter,
): SkillInstallation[] {
  const paths = new Set<string>()
  return skill.installations.filter((installation) => {
    if (
      installation.readOnly ||
      !matchesSkillInstallation(installation, filter) ||
      paths.has(installation.path)
    )
      return false
    paths.add(installation.path)
    return true
  })
}

/** 判断安装是否可作为编辑源和保存目标。 */
export function isEditableSkillInstallation(installation: SkillInstallation): boolean {
  return !installation.readOnly && !installation.parseError
}

/** 返回可安全编辑的安装，并按物理路径去重。 */
export function editableSkillInstallations(
  skill: AggregatedSkill,
  filter: SkillInstallationFilter,
): SkillInstallation[] {
  const paths = new Set<string>()
  return skill.installations.filter((installation) => {
    if (
      !isEditableSkillInstallation(installation) ||
      !matchesSkillInstallation(installation, filter) ||
      paths.has(installation.path)
    )
      return false
    paths.add(installation.path)
    return true
  })
}

/** Return writable installations that support enable and disable operations. */
export function toggleableSkillInstallations(
  skill: AggregatedSkill,
  filter: SkillInstallationFilter,
): SkillInstallation[] {
  return manageableSkillInstallations(skill, filter).filter(
    (installation) => installation.canToggle !== false,
  )
}
