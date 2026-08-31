import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
import { applyTheme } from './composables/useSettings'
import './assets/main.css'

// vibrancy class 由 applyTheme → applyAppearance 按平台与用户设置统一控制
applyTheme()

/** 将渲染层未捕获异常统一输出，主进程会持久化 error 级日志。 */
function reportRendererError(kind: string, error: unknown): void {
  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`
      : String(error)
  console.error(`[${kind}] ${detail}`)
}

window.addEventListener('error', (event) => {
  reportRendererError('window.error', event.error ?? event.message)
})
window.addEventListener('unhandledrejection', (event) => {
  reportRendererError('unhandledrejection', event.reason)
})

const vueApp = createApp(App)
vueApp.config.errorHandler = (error, _instance, info) => {
  reportRendererError(`vue:${info}`, error)
}
vueApp.use(i18n).mount('#app')
