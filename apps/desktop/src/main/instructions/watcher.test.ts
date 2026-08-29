import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstructionWatcher } from './watcher'

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })))
})

describe('InstructionWatcher', () => {
  it('debounces changes and stop cancels pending callbacks', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-watcher-'))
    cleanup.push(root)
    const watcher = new InstructionWatcher({ debounceMs: 20 })
    const onChange = vi.fn()
    expect(watcher.start([], [root], onChange)).toBe(1)
    await fs.writeFile(join(root, 'AGENTS.md'), 'one\n', 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(onChange).toHaveBeenCalled()
    const callsAfterFirstWrite = onChange.mock.calls.length
    watcher.stop()
    await fs.writeFile(join(root, 'AGENTS.md'), 'two\n', 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onChange).toHaveBeenCalledTimes(callsAfterFirstWrite)
  })

  it('restarts cleanly without retaining old watchers', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-watcher-restart-'))
    cleanup.push(root)
    const watcher = new InstructionWatcher({ debounceMs: 10 })
    const onChange = vi.fn()
    expect(watcher.start([], [root], onChange)).toBe(1)
    expect(watcher.start([], [root], onChange)).toBe(1)
    watcher.stop()
  })
})
