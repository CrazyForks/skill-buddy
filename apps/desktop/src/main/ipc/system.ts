import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  session,
  shell,
} from 'electron'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  AppInfo,
  ConfirmOptions,
  UpdateManifest,
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdateDownloadResult,
  UpdateReleaseAsset,
} from '#shared/ipc'
import type { DesktopPreferences } from '#shared/ipc'
import {
  getDesktopPreferences,
  onDesktopPreferencesChanged,
  setDesktopPreferences,
} from '../preferences'
import { toggleMainWindow } from '../window'

/** 检查更新所用的 GitHub 仓库（Releases 页）。 */
const UPDATE_REPO = 'konnga/skill-buddy'
const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`
const UPDATE_MANIFEST_URL = `${UPDATE_RELEASES_URL}/latest/download/latest.json`
const UPDATE_HEADERS = { 'user-agent': 'SkillBuddy' }

let cachedManifest: UpdateManifest | null = null

interface ReleaseFetchResult {
  status: number
  data: UpdateManifest | null
}

async function updateFetch(
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number; cacheBust?: boolean } = {},
): Promise<Response> {
  const { headers = UPDATE_HEADERS, timeoutMs = 10_000, cacheBust = false } = options
  const requestUrl = cacheBust
    ? `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`
    : url
  try {
    return await session.defaultSession.fetch(requestUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return fetch(requestUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
  }
}

function updateAssetKey(platform: NodeJS.Platform, arch: string): string | null {
  if (
    (platform === 'darwin' && arch === 'arm64')
    || (platform === 'win32' && (arch === 'x64' || arch === 'arm64'))
    || (platform === 'linux' && (arch === 'x64' || arch === 'arm64'))
  ) {
    return `${platform}-${arch}`
  }
  return null
}

function normalizeVersion(value: string): string | null {
  const version = value.trim().replace(/^v/i, '')
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ? version : null
}

function parseVersion(value: string): number[] {
  const core = value.split('-', 1)[0] ?? value
  return core.split('.').map((part) => Number(part))
}

function findUpdateAsset(data: UpdateManifest): UpdateReleaseAsset | null {
  const key = updateAssetKey(process.platform, process.arch)
  if (!key) return null
  return data.assets[key] ?? null
}

function parseUpdateManifest(value: unknown): UpdateManifest {
  if (!value || typeof value !== 'object') throw new Error('更新清单格式无效')
  const manifest = value as Partial<UpdateManifest>
  if (
    typeof manifest.version !== 'string'
    || typeof manifest.releaseUrl !== 'string'
    || !manifest.assets
    || typeof manifest.assets !== 'object'
  ) {
    throw new Error('更新清单格式无效')
  }
  const version = normalizeVersion(manifest.version)
  if (!version) throw new Error('更新清单版本号无效')
  const assets: UpdateManifest['assets'] = {}
  for (const [key, value] of Object.entries(manifest.assets)) {
    if (!value || typeof value !== 'object') continue
    const asset = value as Partial<UpdateReleaseAsset>
    if (typeof asset.name !== 'string' || typeof asset.url !== 'string') continue
    if (asset.sha256 && !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
      throw new Error(`更新清单校验值无效：${key}`)
    }
    assets[key] = {
      name: asset.name,
      size: typeof asset.size === 'number' ? asset.size : 0,
      url: asset.url,
      ...(asset.sha256 ? { sha256: asset.sha256.toLowerCase() } : {}),
    }
  }
  const publishedAt = typeof manifest.publishedAt === 'string' && !Number.isNaN(Date.parse(manifest.publishedAt))
    ? new Date(manifest.publishedAt).toISOString()
    : undefined
  return { version, releaseUrl: manifest.releaseUrl, ...(publishedAt ? { publishedAt } : {}), assets }
}

async function fetchLatestManifest(): Promise<ReleaseFetchResult> {
  const response = await updateFetch(UPDATE_MANIFEST_URL, {
    headers: { ...UPDATE_HEADERS, accept: 'application/json', 'cache-control': 'no-cache' },
    cacheBust: true,
  })
  if (response.status === 404) return { status: 404, data: null }
  if (!response.ok) return { status: response.status, data: null }
  const manifest = parseUpdateManifest(await response.json())
  const lastModified = response.headers.get('last-modified')
  const fallbackPublishedAt = lastModified && !Number.isNaN(Date.parse(lastModified))
    ? new Date(lastModified).toISOString()
    : undefined
  const data = manifest.publishedAt || !fallbackPublishedAt
    ? manifest
    : { ...manifest, publishedAt: fallbackPublishedAt }
  cachedManifest = data
  return { status: response.status, data }
}

/** 比较清单中的版本号，拒绝非标准版本，避免异常响应被当成最新版本。 */
function isNewer(latest: string, current: string): boolean {
  const normalizedLatest = normalizeVersion(latest)
  const normalizedCurrent = normalizeVersion(current)
  if (!normalizedLatest || !normalizedCurrent) return false
  const a = parseVersion(normalizedLatest)
  const b = parseVersion(normalizedCurrent)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0)
    if (delta !== 0) return delta > 0
  }
  return false
}

/** 注册应用信息、更新检查、系统集成（自启/快捷键/代理）与配置导入导出 IPC。 */
export function registerSystemIpc(): void {
  ipcMain.handle(
    'app:info',
    (): AppInfo => ({
      version: app.getVersion(),
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? '',
      platform: process.platform,
      arch: process.arch,
    }),
  )

  ipcMain.handle('app:check-update', async (): Promise<UpdateCheckResult> => {
    try {
      const { status, data } = await fetchLatestManifest()
      // 仓库尚未发布任何 Release 时 GitHub 返回 404
      if (status === 404) return { status: 'none' }
      if (status !== 200 || !data) return { status: 'error', message: `更新清单请求失败：${status}` }
      const latest = normalizeVersion(data.version)
      if (!latest) return { status: 'error', message: '更新清单版本号无效' }
      const url = data.releaseUrl
      if (isNewer(latest, app.getVersion())) {
        return {
          status: 'update',
          latest,
          url,
          ...(data.publishedAt ? { publishedAt: data.publishedAt } : {}),
          asset: findUpdateAsset(data),
        }
      }
      return { status: 'latest', latest, url }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(
    'app:download-update',
    async (event, latest: string): Promise<UpdateDownloadResult> => {
      const sender = BrowserWindow.fromWebContents(event.sender)
      if (!sender) throw new Error('应用窗口不存在')

      let temporaryPath = ''
      try {
        let data = cachedManifest
        if (normalizeVersion(data?.version ?? '') !== normalizeVersion(latest)) {
          const result = await fetchLatestManifest()
          if (result.status !== 200 || !result.data) {
            throw new Error(`更新清单请求失败：${result.status}`)
          }
          data = result.data
        }
        if (!data) throw new Error('无法读取发布信息')
        const releaseVersion = normalizeVersion(data.version)
        if (releaseVersion !== latest) throw new Error('发布版本已变化，请重新检查更新')
        const asset = findUpdateAsset(data)
        if (!asset?.name || !asset.url) {
          throw new Error('当前系统暂无可用安装包')
        }

        const responseAsset = await updateFetch(asset.url, {
          timeoutMs: 30 * 60_000,
        })
        if (!responseAsset.ok || !responseAsset.body) throw new Error(`下载失败：${responseAsset.status}`)
        const downloadDir = app.getPath('downloads')
        const filePath = join(downloadDir, basename(asset.name))
        temporaryPath = `${filePath}.download`
        await fs.rm(temporaryPath, { force: true })
        const file = await fs.open(temporaryPath, 'w')
        const total = Number(responseAsset.headers.get('content-length')) || asset.size || 0
        let transferred = 0
        let lastPercent = -1
        const hash = createHash('sha256')
        try {
          for await (const chunk of responseAsset.body as AsyncIterable<Uint8Array>) {
            await file.write(chunk)
            hash.update(chunk)
            transferred += chunk.byteLength
            const percent = total > 0
              ? Math.min(99, Math.round((transferred / total) * 100))
              : 0
            if (percent === lastPercent) continue
            lastPercent = percent
            const progress: UpdateDownloadProgress = {
              status: 'downloading',
              percent,
              transferred,
              total,
            }
            sender.webContents.send('app:update-progress', progress)
          }
        } finally {
          await file.close()
        }
        if (asset.sha256 && hash.digest('hex') !== asset.sha256) {
          throw new Error('下载文件校验失败，请重新检查更新')
        }
        await fs.rm(filePath, { force: true })
        await fs.rename(temporaryPath, filePath)
        temporaryPath = ''
        if (process.platform === 'linux') await fs.chmod(filePath, 0o755)
        sender.webContents.send('app:update-progress', { status: 'completed', percent: 100, path: filePath } satisfies UpdateDownloadProgress)
        const openMessage = await shell.openPath(filePath)
        if (openMessage) shell.showItemInFolder(filePath)
        return {
          path: filePath,
          opened: openMessage === '',
          ...(openMessage ? { message: openMessage } : {}),
        }
      } catch (error) {
        if (temporaryPath) await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
        const message = error instanceof Error ? error.message : String(error)
        sender.webContents.send('app:update-progress', { status: 'error', message } satisfies UpdateDownloadProgress)
        throw error
      }
    },
  )

  function applyLoginItemSettings(openAtLogin: boolean): void {
    const preferences = getDesktopPreferences()
    const launchHidden = preferences.backgroundMode && preferences.launchHidden
    app.setLoginItemSettings({
      openAtLogin,
      ...(process.platform === 'win32' ? { args: launchHidden ? ['--hidden'] : [] } : {}),
    })
  }

  function readLoginItemEnabled(): boolean {
    if (process.platform !== 'win32') return app.getLoginItemSettings().openAtLogin
    return (
      app.getLoginItemSettings().openAtLogin ||
      app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin
    )
  }

  let launchAtLoginEnabled = readLoginItemEnabled()

  /* 开机自启动 */
  ipcMain.handle('system:get-login-item', () => {
    launchAtLoginEnabled = readLoginItemEnabled()
    return launchAtLoginEnabled
  })
  ipcMain.handle('system:set-login-item', (_event, openAtLogin: boolean) => {
    launchAtLoginEnabled = openAtLogin
    applyLoginItemSettings(openAtLogin)
  })
  ipcMain.handle(
    'system:get-desktop-preferences',
    () => getDesktopPreferences(),
  )
  ipcMain.handle(
    'system:set-desktop-preferences',
    (_event, preferences: DesktopPreferences) => setDesktopPreferences(preferences),
  )
  onDesktopPreferencesChanged(() => {
    launchAtLoginEnabled = readLoginItemEnabled()
    if (launchAtLoginEnabled) applyLoginItemSettings(true)
  })

  /* 全局唤起快捷键：再次按下时隐藏窗口 */
  let registeredShortcut: string | null = null
  ipcMain.handle('system:set-global-shortcut', (_event, accelerator: string): boolean => {
    if (registeredShortcut) {
      globalShortcut.unregister(registeredShortcut)
      registeredShortcut = null
    }
    const value = accelerator.trim()
    if (!value) return true
    try {
      const ok = globalShortcut.register(value, () => {
        toggleMainWindow()
      })
      if (ok) registeredShortcut = value
      return ok
    } catch {
      return false
    }
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())

  /* HTTP 代理：作用于 Chromium 网络栈（渲染进程、net.fetch、应用内浏览器） */
  ipcMain.handle('network:set-proxy', async (_event, url: string) => {
    const value = url.trim()
    await session.defaultSession.setProxy(
      value ? { proxyRules: value } : { mode: 'system' },
    )
  })

  /* 配置导出 / 导入（文件对话框在主进程完成，渲染进程只见 JSON 字符串） */
  ipcMain.handle('config:export', async (event, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    const result = await dialog.showSaveDialog(win, {
      defaultPath: 'skillbuddy-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return false
    await fs.writeFile(result.filePath, content, 'utf8')
    return true
  })

  ipcMain.handle('config:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    const path = result.canceled ? null : (result.filePaths[0] ?? null)
    return path ? await fs.readFile(path, 'utf8') : null
  })

  /* 原生确认对话框 */
  ipcMain.handle('dialog:confirm', async (event, options: ConfirmOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    const result = await dialog.showMessageBox(win, {
      type: options.danger ? 'warning' : 'question',
      buttons: [options.confirmLabel, options.cancelLabel],
      defaultId: 0,
      cancelId: 1,
      message: options.title,
      detail: options.message,
    })
    return result.response === 0
  })

  ipcMain.handle('system:open-user-data', () => shell.openPath(app.getPath('userData')))
}
