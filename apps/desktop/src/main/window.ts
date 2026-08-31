import { app, BrowserWindow } from 'electron'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { TrayCommand } from '#shared/ipc'
import { getDesktopPreferences } from './preferences'
import { openLink } from './in-app-browser'
import { getTitleBarOverlayOptions, getWindowChromeOptions } from './window-chrome'
import type { WindowThemeColors } from './window-chrome'

let mainWindow: BrowserWindow | null = null
let quitting = false

/** 将远端用户机器上的渲染异常落盘，避免打包后只能看到白屏而没有堆栈。 */
function appendRendererLog(message: string): void {
  const logsDirectory = app.getPath('logs')
  const line = `[${new Date().toISOString()}] ${message}\n`
  void mkdir(logsDirectory, { recursive: true })
    .then(() => appendFile(join(logsDirectory, 'renderer.log'), line, 'utf8'))
    .catch(() => undefined)
}

/** 返回开发态与打包态均可访问的桌面应用图标路径。 */
export function desktopIconPath(): string {
  const iconName = process.platform === 'darwin' ? 'icon-mac.png' : 'icon.png'

  return app.isPackaged
    ? join(process.resourcesPath, iconName)
    : join(import.meta.dirname, `../../resources/icons/${iconName}`)
}

/** 创建并配置 SkillBuddy 主窗口。 */
export function createWindow(options: { showOnReady?: boolean } = {}): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow

  const { showOnReady = true } = options
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    show: false,
    icon: desktopIconPath(),
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...getWindowChromeOptions(process.platform),
    ...(process.platform === 'darwin'
      ? {
          vibrancy: 'sidebar' as const,
          visualEffectState: 'active' as const,
          backgroundColor: '#00000000',
          trafficLightPosition: { x: 14, y: 13 },
        }
      : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      devTools: !app.isPackaged,
    },
  })
  mainWindow = window

  window.on('ready-to-show', () => {
    if (showOnReady) showMainWindow()
  })
  window.on('close', (event) => {
    if (quitting || !getDesktopPreferences().backgroundMode) return
    event.preventDefault()
    window.hide()
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  let lastRendererRecoveryAt = 0
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('SkillBuddy renderer exited unexpectedly', details)
    appendRendererLog(`renderer process gone: ${JSON.stringify(details)}`)
    if (quitting || window.isDestroyed() || details.reason === 'clean-exit') return

    const now = Date.now()
    if (now - lastRendererRecoveryAt < 10_000) return
    lastRendererRecoveryAt = now
    setTimeout(() => {
      if (!quitting && !window.isDestroyed()) window.webContents.reload()
    }, 250)
  })
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level !== 3) return
    appendRendererLog(`renderer error: ${message} (${sourceId}:${line})`)
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    openLink(window, url)
    return { action: 'deny' }
  })
  // setWindowOpenHandler 只覆盖新窗口请求；Markdown 渲染出的普通 <a href>
  // 会让当前窗口就地导航，这里把所有跨源导航拦下，按用户设置分流打开。
  window.webContents.on('will-navigate', (event, url) => {
    let sameOrigin = false
    try {
      sameOrigin = new URL(url).origin === new URL(window.webContents.getURL()).origin
    } catch {
      /* 非法 URL 一律拦截 */
    }
    if (sameOrigin) return
    event.preventDefault()
    openLink(window, url)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return window
}

/** 更新 Windows 原生窗口控制区，使其与渲染层当前主题表面保持一致。 */
export function setWindowChromeTheme(colors: WindowThemeColors): void {
  if (process.platform !== 'win32') return
  mainWindow?.setTitleBarOverlay(getTitleBarOverlayOptions(colors))
}

/** 切换 macOS 原生窗口材质；其他平台不支持 vibrancy 时保持无操作。 */
export function setWindowVibrancy(enabled: boolean): void {
  if (process.platform !== 'darwin') return
  mainWindow?.setVibrancy(enabled ? 'sidebar' : null)
}

/** 显示、恢复并聚焦主窗口。 */
export function showMainWindow(): void {
  const window = mainWindow ?? createWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  if (process.platform === 'darwin') app.focus({ steal: true })
  window.focus()
}

/** 在全局快捷键中切换主窗口显示状态。 */
export function toggleMainWindow(): void {
  if (mainWindow?.isVisible() && mainWindow.isFocused()) mainWindow.hide()
  else showMainWindow()
}

/** 向已加载的渲染进程发送托盘命令。 */
export function sendTrayCommand(command: TrayCommand): void {
  const window = mainWindow ?? createWindow({ showOnReady: false })
  const send = (): void => window.webContents.send('tray:command', command)
  if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', send)
  else send()
}

/** 标记应用正在真正退出，避免 close 事件再次隐藏窗口。 */
export function setQuitting(value: boolean): void {
  quitting = value
}
