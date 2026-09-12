import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformStatus } from '@skillbuddy/core'
import type { PlatformCleanupResult } from '#shared/ipc'
import { openPlatformCleanup, usePlatformCleanupHost } from './usePlatformCleanup'

const platform: PlatformStatus = {
  id: 'google-antigravity',
  displayName: 'Google Antigravity',
  detected: true,
  hasProjectScope: true,
  residualPaths: ['/home/demo/a', '/home/demo/b', '/home/demo/c'],
}
const host = usePlatformCleanupHost()

beforeEach(() => host.close())

describe('platform cleanup session', () => {
  it('部分成功后移除成功项，再次确认只发送失败项', async () => {
    openPlatformCleanup(platform)
    host.toggle('/home/demo/c')
    const cleanup = vi.fn<(id: string, paths: string[]) => Promise<PlatformCleanupResult[]>>()
      .mockResolvedValueOnce([
        { path: '/home/demo/a', ok: true },
        { path: '/home/demo/b', ok: false, error: 'busy' },
      ])
      .mockResolvedValueOnce([{ path: '/home/demo/b', ok: true }])
    const operations = { cleanup, refresh: vi.fn().mockResolvedValue(undefined), onSuccess: vi.fn() }

    await host.confirm(operations)
    expect(host.pending.value?.residualPaths).toEqual(['/home/demo/b', '/home/demo/c'])
    expect(host.selected.value).toEqual(['/home/demo/b'])
    expect(host.failure.value).toContain('busy')
    expect(host.canConfirm.value).toBe(true)
    expect(operations.onSuccess).not.toHaveBeenCalled()
    expect(platform.residualPaths).toHaveLength(3)

    await host.confirm(operations)
    expect(cleanup).toHaveBeenNthCalledWith(2, platform.id, ['/home/demo/b'])
    expect(operations.onSuccess).toHaveBeenCalledWith(platform.displayName)
    expect(host.pending.value).toBeNull()
  })

  it('清理进行中不能更换平台、修改选择、关闭弹窗或重复提交', async () => {
    openPlatformCleanup(platform)
    let resolveCleanup!: (results: PlatformCleanupResult[]) => void
    const cleanup = vi.fn(() => new Promise<PlatformCleanupResult[]>((resolve) => { resolveCleanup = resolve }))
    const operations = { cleanup, refresh: vi.fn().mockResolvedValue(undefined), onSuccess: vi.fn() }
    const task = host.confirm(operations)

    host.toggle('/home/demo/a')
    host.close()
    openPlatformCleanup({ ...platform, id: 'cursor' })
    await host.confirm(operations)
    expect(host.pending.value?.id).toBe(platform.id)
    expect(host.selected.value).toEqual(platform.residualPaths)
    expect(cleanup).toHaveBeenCalledTimes(1)
    resolveCleanup(platform.residualPaths.map((path) => ({ path, ok: true })))
    await task
    expect(host.busy.value).toBe(false)
  })

  it('IPC 整体拒绝时保留原选择并显示错误', async () => {
    openPlatformCleanup(platform)
    await host.confirm({
      cleanup: vi.fn().mockRejectedValue(new Error('application installed')),
      refresh: vi.fn().mockResolvedValue(undefined),
      onSuccess: vi.fn(),
    })
    expect(host.selected.value).toEqual(platform.residualPaths)
    expect(host.failure.value).toBe('application installed')
    expect(host.busy.value).toBe(false)
  })
})
