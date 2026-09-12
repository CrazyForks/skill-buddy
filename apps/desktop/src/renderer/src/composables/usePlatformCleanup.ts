import { computed, readonly, shallowRef } from 'vue'
import type { PlatformStatus } from '@skillbuddy/core'
import type { PlatformCleanupResult } from '#shared/ipc'

/** 同一时刻仅允许一个清理会话；执行期间不能替换目标或修改选择。 */
const pending = shallowRef<PlatformStatus | null>(null)
const selected = shallowRef<string[]>([])
const busy = shallowRef(false)
const failure = shallowRef<string | null>(null)
const canConfirm = computed(() => pending.value !== null && selected.value.length > 0 && !busy.value)

interface CleanupOperations {
  cleanup: (platformId: string, paths: string[]) => Promise<PlatformCleanupResult[]>
  refresh: () => Promise<void>
  onSuccess: (displayName: string) => void
}

/** 打开清理弹窗并保存候选快照，不直接依赖会被刷新替换的平台列表对象。 */
export function openPlatformCleanup(platform: PlatformStatus): void {
  if (busy.value || platform.residualPaths.length === 0) return
  pending.value = { ...platform, residualPaths: [...platform.residualPaths] }
  selected.value = [...platform.residualPaths]
  failure.value = null
}

/** 关闭会话并丢弃选择；清理尚未完成时不允许提前关闭。 */
function close(): void {
  if (busy.value) return
  pending.value = null
  selected.value = []
  failure.value = null
}

/** 只允许切换当前候选列表中的目录，执行期间冻结选择。 */
function toggle(path: string): void {
  if (busy.value || !pending.value?.residualPaths.includes(path)) return
  selected.value = selected.value.includes(path)
    ? selected.value.filter((item) => item !== path)
    : [...selected.value, path]
}

/** 清理后立即移除成功项，失败项保持选中；再次确认只提交尚未完成的目录。 */
async function confirm(operations: CleanupOperations): Promise<void> {
  const platform = pending.value
  if (!platform || !canConfirm.value) return
  busy.value = true
  failure.value = null
  try {
    const results = await operations.cleanup(platform.id, [...selected.value])
    const succeeded = new Set(results.filter((result) => result.ok).map((result) => result.path))
    const failed = results.filter((result) => !result.ok)
    pending.value = {
      ...platform,
      residualPaths: platform.residualPaths.filter((path) => !succeeded.has(path)),
    }
    selected.value = selected.value.filter((path) => !succeeded.has(path))
    if (failed.length > 0) {
      failure.value = failed
        .map((result) => `${result.path}: ${result.error ?? ''}`.trim())
        .join('\n')
    }
    await operations.refresh()
    if (failed.length > 0) return
    operations.onSuccess(platform.displayName)
    pending.value = null
    selected.value = []
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

/** 弹窗只负责展示，状态与部分失败后的重试收敛由此会话统一维护。 */
export function usePlatformCleanupHost() {
  return {
    pending: readonly(pending),
    selected: readonly(selected),
    busy: readonly(busy),
    failure: readonly(failure),
    canConfirm,
    close,
    toggle,
    confirm,
  }
}
