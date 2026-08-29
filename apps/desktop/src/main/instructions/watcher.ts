import { watch, type FSWatcher } from 'node:fs'

export interface InstructionWatcherOptions {
  debounceMs?: number
}

/** 监听项目与全局指令目录，并将连续文件系统事件合并为一次刷新。 */
export class InstructionWatcher {
  readonly #watchers: FSWatcher[] = []
  readonly #debounceMs: number
  #timer: ReturnType<typeof setTimeout> | undefined
  #onChange: (() => void) | undefined

  constructor(options: InstructionWatcherOptions = {}) {
    this.#debounceMs = options.debounceMs ?? 180
  }

  start(projectRoots: string[], globalParents: string[], onChange: () => void): number {
    this.stop()
    this.#onChange = onChange
    const schedule = (): void => {
      if (this.#timer) clearTimeout(this.#timer)
      this.#timer = setTimeout(() => {
        this.#timer = undefined
        this.#onChange?.()
      }, this.#debounceMs)
    }
    for (const root of [...new Set([...projectRoots, ...globalParents])]) {
      try {
        const watcher = watch(root, { recursive: projectRoots.includes(root) }, schedule)
        watcher.on('error', () => watcher.close())
        this.#watchers.push(watcher)
      } catch {
        // 单个目录不可监听时，扫描和手动刷新仍然可用。
      }
    }
    return this.#watchers.length
  }

  stop(): void {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = undefined
    for (const watcher of this.#watchers.splice(0)) watcher.close()
    this.#onChange = undefined
  }
}
