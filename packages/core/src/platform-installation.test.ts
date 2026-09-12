import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('node:util', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:util')>(),
  promisify: () => execute,
}))

import { lookupPlatformApplication } from './platform-installation.js'

beforeEach(() => {
  execute.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('lookupPlatformApplication', () => {
  it('系统按 Bundle ID 找到已移动或改名的应用时立即保留数据', async () => {
    execute.mockResolvedValueOnce({ stdout: 'installed\n', stderr: '' })
    expect(await lookupPlatformApplication('com.example.agent', 'darwin')).toBe('installed')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[1]).toContain('com.example.agent')
  })

  it('注册表未命中时继续查询 Spotlight 中的非默认位置', async () => {
    execute
      .mockResolvedValueOnce({ stdout: 'missing\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '/Volumes/Tools/Renamed.app\0', stderr: '' })
    expect(await lookupPlatformApplication('com.example.agent', 'darwin')).toBe('installed')
  })

  it('只有两次查询都成功且无匹配时才允许判为缺失', async () => {
    execute
      .mockResolvedValueOnce({ stdout: 'missing\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
    expect(await lookupPlatformApplication('com.example.agent', 'darwin')).toBe('missing')
  })

  it('查询超时或系统工具异常时不开放清理', async () => {
    execute.mockRejectedValueOnce(new Error('timeout'))
    expect(await lookupPlatformApplication('com.example.agent', 'darwin')).toBe('unknown')
    execute
      .mockResolvedValueOnce({ stdout: 'missing', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: 'index unavailable' })
    expect(await lookupPlatformApplication('com.example.agent', 'darwin')).toBe('unknown')
  })

  it('不支持的系统和非法 Bundle ID 不启动命令', async () => {
    expect(await lookupPlatformApplication('com.example.agent', 'win32')).toBe('unknown')
    expect(await lookupPlatformApplication('bad" || true', 'darwin')).toBe('unknown')
    expect(execute).not.toHaveBeenCalled()
  })
})
