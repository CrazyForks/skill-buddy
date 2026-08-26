import { computed, ref, shallowRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlatformStatus } from '@skillbuddy/core'
import type { CustomPlatformInput, PlatformDraft, TeamLibraryConfig } from '#shared/ipc'
import { teamLibraryConfigKey } from '#shared/team-library'
import { syncCustomPlatforms, useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { useTeamLibraries } from '@/composables/useTeamLibraries'
import {
  isSelectableDraft,
  PLATFORM_DRAFT_ERROR_KEYS,
  type PlatformCandidateRow,
} from '@/lib/platform-draft'

export interface TeamLibraryRow {
  key: string
  config: TeamLibraryConfig
  name: string
  id?: string
  error?: string
  warning?: string
}

interface UseSettingsPageSectionsOptions {
  query: Readonly<Ref<string>>
}

function repositoryLabel(remoteUrl: string): string {
  return remoteUrl.replace(/\/$/, '').split(/[/:]/).pop()?.replace(/\.git$/, '') || remoteUrl
}

/** 汇总设置页各业务分区的状态与动作，让页面组件只负责导航和布局编排。 */
export function useSettingsPageSections(options: UseSettingsPageSectionsOptions) {
  const { query } = options
  const { t } = useI18n()
  const settings = useSettings()
  const { platforms, refresh } = useSkills()
  const {
    catalogs: teamLibraryCatalogs,
    errors: teamLibraryErrors,
    warnings: teamLibraryWarnings,
  } = useTeamLibraries()

  const effectiveMode = computed<'light' | 'dark'>(() =>
    settings.theme.value === 'dark' ||
    (settings.theme.value === 'system' && settings.systemDark.value)
      ? 'dark'
      : 'light',
  )

  const visiblePlatforms = computed<PlatformStatus[]>(() => {
    const normalizedQuery = query.value.trim().toLowerCase()
    if (!normalizedQuery) return platforms.value
    return platforms.value.filter((platform) =>
      [platform.displayName, platform.id].some((text) =>
        text.toLowerCase().includes(normalizedQuery),
      ),
    )
  })

  /** 目录变更后立即刷新扫描结果，保证工作区筛选与安装目标同步。 */
  async function addProjectRoot(): Promise<void> {
    const directory = await window.skillsManager.pickDirectory()
    if (!directory || settings.projectRoots.value.includes(directory)) return
    settings.projectRoots.value = [...settings.projectRoots.value, directory]
    await refresh()
  }

  async function removeProjectRoot(root: string): Promise<void> {
    settings.projectRoots.value = settings.projectRoots.value.filter((item) => item !== root)
    await refresh()
  }

  const showPlatformForm = shallowRef(false)
  const platformCandidates = ref<PlatformCandidateRow[]>([])
  const platformDiscovering = shallowRef(false)
  const platformFormError = shallowRef<string | null>(null)

  /** 主进程草稿转成面板里的一行；手选的目录默认勾选并展开，发现来的等用户挑。 */
  function toCandidateRow(draft: PlatformDraft, manual: boolean): PlatformCandidateRow {
    return {
      key: draft.detectPath,
      selected: manual && isSelectableDraft(draft.error),
      expanded: manual || draft.error === 'invalid-id',
      manual,
      hasSkillsDir: draft.hasSkillsDir,
      error: draft.error,
      form: {
        id: draft.id,
        displayName: draft.displayName,
        detectPath: draft.detectPath,
        userSkillsDir: draft.userSkillsDir,
        projectSkillsDir: draft.projectSkillsDir,
      },
    }
  }

  /** 打开面板时扫描一次候选目录，手选过的行保留，不被扫描结果覆盖。 */
  async function discoverPlatforms(): Promise<void> {
    platformDiscovering.value = true
    platformFormError.value = null
    try {
      const drafts = await window.skillsManager.discoverPlatforms()
      const manualRows = platformCandidates.value.filter((row) => row.manual)
      platformCandidates.value = [
        ...manualRows,
        ...drafts
          .filter((draft) => !manualRows.some((row) => row.key === draft.detectPath))
          .map((draft) => toCandidateRow(draft, false)),
      ]
    } catch {
      platformFormError.value = t('settings.platformDiscoveryFailed')
    } finally {
      platformDiscovering.value = false
    }
  }

  async function togglePlatformForm(open: boolean): Promise<void> {
    showPlatformForm.value = open
    if (!open) return
    platformFormError.value = null
    await discoverPlatforms()
  }

  /** 手选目录并入同一份候选列表；已在列表里的目录直接勾选并展开。 */
  async function pickPlatformDirectory(): Promise<void> {
    try {
      const draft = await window.skillsManager.pickPlatformDirectory()
      if (!draft) return
      platformFormError.value = null
      const existing = platformCandidates.value.find((row) => row.key === draft.detectPath)
      if (existing) {
        existing.selected = isSelectableDraft(existing.error)
        existing.expanded = true
        return
      }
      platformCandidates.value = [toCandidateRow(draft, true), ...platformCandidates.value]
    } catch {
      platformFormError.value = t('settings.platformPickFailed')
    }
  }

  function findPlatformCandidate(key: string): PlatformCandidateRow | undefined {
    return platformCandidates.value.find((row) => row.key === key)
  }

  function togglePlatformCandidateSelected(key: string): void {
    const row = findPlatformCandidate(key)
    if (!row || !isSelectableDraft(row.error)) return
    row.selected = !row.selected
  }

  function togglePlatformCandidateExpanded(key: string): void {
    const row = findPlatformCandidate(key)
    if (row) row.expanded = !row.expanded
  }

  function updatePlatformCandidateField(
    key: string,
    field: keyof PlatformCandidateRow['form'],
    value: string,
  ): void {
    const row = findPlatformCandidate(key)
    if (row) row.form[field] = value
  }

  function validateCandidate(row: PlatformCandidateRow): string | null {
    if (row.error && row.error !== 'invalid-id') return t(PLATFORM_DRAFT_ERROR_KEYS[row.error])
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.form.id)) return t('settings.errKebab')
    if (!row.form.displayName || !row.form.detectPath || !row.form.userSkillsDir) {
      return t('settings.errRequired')
    }
    return null
  }

  /** 勾选的行全部校验通过才写入，先同步主进程平台注册表，再刷新探测状态。 */
  async function addCustomPlatform(): Promise<void> {
    platformFormError.value = null
    const selected = platformCandidates.value.filter((row) => row.selected)
    if (selected.length === 0) {
      platformFormError.value = t('settings.errNoSelection')
      return
    }
    for (const row of selected) {
      const message = validateCandidate(row)
      if (message) {
        row.expanded = true
        platformFormError.value = message
        return
      }
    }

    const definitions: CustomPlatformInput[] = selected.map((row) => ({
      id: row.form.id,
      displayName: row.form.displayName,
      userSkillsDir: row.form.userSkillsDir || null,
      projectSkillsDir: row.form.projectSkillsDir || null,
      detectPath: row.form.detectPath,
    }))
    const replacedIds = new Set(definitions.map((definition) => definition.id))
    settings.customPlatforms.value = [
      ...settings.customPlatforms.value.filter((platform) => !replacedIds.has(platform.id)),
      ...definitions,
    ]
    await syncCustomPlatforms()
    await refresh()
    showPlatformForm.value = false
    platformCandidates.value = []
  }

  async function removeCustomPlatform(id: string): Promise<void> {
    settings.customPlatforms.value = settings.customPlatforms.value.filter(
      (platform) => platform.id !== id,
    )
    await refresh()
  }

  const teamLibraryRows = computed<TeamLibraryRow[]>(() =>
    settings.teamLibraries.value.map((library) => {
      const key = teamLibraryConfigKey(library)
      const catalog = teamLibraryCatalogs.value.find(
        (candidate) => teamLibraryConfigKey(candidate.source) === key,
      )
      return {
        key,
        config: library,
        name: catalog?.source.libraryName ?? repositoryLabel(library.remoteUrl),
        id: catalog?.source.libraryId,
        error: teamLibraryErrors.value[key],
        warning: teamLibraryWarnings.value[key],
      }
    }),
  )

  function addTeamLibrary(library: TeamLibraryConfig): void {
    settings.teamLibraries.value = [
      ...settings.teamLibraries.value.filter(
        (item) => item.remoteUrl.trim() !== library.remoteUrl.trim(),
      ),
      library,
    ]
  }

  function removeTeamLibrary(key: string): void {
    settings.teamLibraries.value = settings.teamLibraries.value.filter(
      (library) => teamLibraryConfigKey(library) !== key,
    )
  }

  return {
    ...settings,
    effectiveMode,
    visiblePlatforms,
    addProjectRoot,
    removeProjectRoot,
    showPlatformForm,
    platformCandidates,
    platformDiscovering,
    platformFormError,
    togglePlatformForm,
    togglePlatformCandidateSelected,
    togglePlatformCandidateExpanded,
    updatePlatformCandidateField,
    pickPlatformDirectory,
    addCustomPlatform,
    removeCustomPlatform,
    teamLibraryRows,
    addTeamLibrary,
    removeTeamLibrary,
  }
}
