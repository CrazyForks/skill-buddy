export interface WindowChromeOptions {
  titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover'
  titleBarOverlay?: { color?: string; symbolColor?: string; height: number }
}

export interface WindowThemeColors {
  background: string
  foreground: string
}

const defaultWindowThemeColors: WindowThemeColors = {
  background: '#ffffff',
  foreground: '#171717',
}

const nativeColorPattern = /^#[0-9a-f]{6}$/i

/** 只将 Windows 标题栏支持的十六进制颜色传给 Electron，非法值回退到默认主题。 */
function normalizeNativeColor(value: string | undefined, fallback: string): string {
  return value && nativeColorPattern.test(value.trim()) ? value.trim() : fallback
}

/** 网页顶部栏为 40px，预留底部 1px 给渲染层的 border-b。 */
const titleBarOverlayHeight = 39

export function getTitleBarOverlayOptions(
  colors: WindowThemeColors = defaultWindowThemeColors,
): NonNullable<WindowChromeOptions['titleBarOverlay']> {
  return {
    color: normalizeNativeColor(colors.background, defaultWindowThemeColors.background),
    symbolColor: normalizeNativeColor(colors.foreground, defaultWindowThemeColors.foreground),
    height: titleBarOverlayHeight,
  }
}

/** 为 Windows 隐藏原生标题文字和图标，同时保留系统窗口控制按钮。 */
export function getWindowChromeOptions(
  platform: NodeJS.Platform,
  colors: WindowThemeColors = defaultWindowThemeColors,
): WindowChromeOptions {
  if (platform !== 'win32') return {}
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: getTitleBarOverlayOptions(colors),
  }
}
