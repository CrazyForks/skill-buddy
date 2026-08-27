import { shallowRef } from 'vue'

/** Toast 的语义类型，决定左侧图标与其配色。 */
export type ToastType = 'success' | 'warning' | 'error' | 'info'

export interface ToastState {
  message: string
  /** 语义类型；省略时不显示图标，保持纯文本外观。 */
  type?: ToastType
  actionLabel?: string
  onAction?: () => void | Promise<void>
}

/** 便捷方法的可选参数，在 {@link ToastState} 的基础上额外支持自定义时长。 */
export type ToastOptions = Omit<ToastState, 'message' | 'type'> & { duration?: number }

const toast = shallowRef<ToastState | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * 显示一条 Toast，超时后自动关闭。
 * @param state - Toast 内容，含文案、语义类型与可选的操作按钮
 * @param duration - 自动关闭的毫秒数
 */
function show(state: ToastState, duration = 5000): void {
  toast.value = state
  clearTimeout(timer)
  timer = setTimeout(() => (toast.value = null), duration)
}

/**
 * 生成指定语义类型的便捷方法。
 * @param type - 该便捷方法固定使用的语义类型
 */
function withType(type: ToastType) {
  return (message: string, options: ToastOptions = {}): void => {
    const { duration, ...rest } = options
    show({ message, type, ...rest }, duration)
  }
}

/**
 * 显示 Toast。既可传入完整的 {@link ToastState}，也可用 `showToast.success('...')`
 * 等便捷方法直接指定语义类型。
 */
export const showToast = Object.assign(show, {
  success: withType('success'),
  warning: withType('warning'),
  error: withType('error'),
  info: withType('info'),
})

/** 立即关闭当前 Toast 并取消自动关闭计时。 */
export function dismissToast(): void {
  clearTimeout(timer)
  toast.value = null
}

export function useToast() {
  return { toast }
}
