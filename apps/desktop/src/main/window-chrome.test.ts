import { describe, expect, it } from 'vitest'
import { getWindowChromeOptions } from './window-chrome.js'

describe('getWindowChromeOptions', () => {
  it('为 Windows 隐藏原生标题文字并保留窗口控制区', () => {
    expect(getWindowChromeOptions('win32')).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#ffffff',
        symbolColor: '#171717',
        height: 39,
      },
    })
  })

  it('使用当前主题颜色覆盖 Windows 控制区', () => {
    expect(
      getWindowChromeOptions('win32', {
        background: '#191724',
        foreground: '#e0def4',
      }),
    ).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#191724',
        symbolColor: '#e0def4',
        height: 39,
      },
    })
  })

  it('其他平台保持现有标题栏行为', () => {
    expect(getWindowChromeOptions('darwin')).toEqual({})
    expect(getWindowChromeOptions('linux')).toEqual({})
  })
})
