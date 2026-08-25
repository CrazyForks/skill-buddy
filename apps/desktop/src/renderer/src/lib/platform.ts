/** 当前渲染窗口是否运行在 Windows。 */
export const isWindowsPlatform =
  typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('windows')
