import type { PlatformDraftError } from '#shared/ipc'

/** 自定义平台的可编辑字段，与 CustomPlatformInput 一一对应，空串表示未填。 */
export interface CustomPlatformForm {
  id: string
  displayName: string
  userSkillsDir: string
  projectSkillsDir: string
  detectPath: string
}

/** 平台面板里的一行候选：自动发现或用户手选，两者共用同一套编辑与提交流程。 */
export interface PlatformCandidateRow {
  /** 目录的 `~/` 形式路径，同时用作列表去重依据。 */
  key: string
  selected: boolean
  expanded: boolean
  /** 来自手动选择目录，重新扫描时不被发现结果覆盖。 */
  manual: boolean
  hasSkillsDir: boolean
  error: PlatformDraftError | null
  form: CustomPlatformForm
}

export const PLATFORM_DRAFT_ERROR_KEYS: Record<PlatformDraftError, string> = {
  'outside-home': 'settings.errOutsideHome',
  'is-home': 'settings.errIsHome',
  'invalid-id': 'settings.errInvalidId',
}

/** id 可以在高级区补填，目录越界却无法在面板内修正，因此直接禁止勾选。 */
export function isSelectableDraft(error: PlatformDraftError | null): boolean {
  return error === null || error === 'invalid-id'
}
