import { dirname, resolve } from 'node:path'
import { surfaceKey } from './types.js'
import type { InstructionDiagnostic, InstructionDocument } from './types.js'

function sharesSurface(left: InstructionDocument, right: InstructionDocument): boolean {
  const keys = new Set(left.bindings.map((binding) => surfaceKey(binding.surface)))
  return right.bindings.some((binding) => keys.has(surfaceKey(binding.surface)))
}

export async function diagnoseInstructions(documents: InstructionDocument[]): Promise<InstructionDiagnostic[]> {
  const diagnostics: InstructionDiagnostic[] = []
  const byDirectory = new Map<string, InstructionDocument[]>()
  for (const document of documents.filter((item) => item.scope === 'project')) {
    const key = dirname(document.path)
    const list = byDirectory.get(key) ?? []
    list.push(document)
    byDirectory.set(key, list)
    if (document.linkBroken) diagnostics.push({ code: 'broken-link', severity: 'error', message: `链接目标不存在：${document.path}`, paths: [document.path], fixable: false })
  }
  for (const [directory, items] of byDirectory) {
    const agents = items.find((item) => item.fileName.toLowerCase() === 'agents.md')
    const claude = items.find((item) => item.fileName === 'CLAUDE.md')
    if (agents && !claude) {
      diagnostics.push({ code: 'missing-claude-bridge', severity: 'info', message: '目录存在 AGENTS.md，但没有 Claude Code 兼容文件', paths: [agents.path, resolve(directory, 'CLAUDE.md')], fixable: true })
    }
    if (agents && claude) {
      const bridge = claude.bindings.some((binding) => binding.status === 'bridged')
      if (!bridge && !agents.linkBroken && !claude.linkBroken) {
        diagnostics.push({ code: 'claude-bridge-conflict', severity: 'warning', message: 'CLAUDE.md 已存在独立内容，无法自动创建桥接', paths: [agents.path, claude.path], fixable: false })
        if (agents.contentHash && claude.contentHash && agents.contentHash !== claude.contentHash) {
          diagnostics.push({ code: 'drifted', severity: 'warning', message: 'AGENTS.md 与 CLAUDE.md 内容存在差异', paths: [agents.path, claude.path], fixable: false })
        }
      }
    }
    // 同目录 + 同内容 + 绑定到同一 Surface，说明同一份规则被复制成多份维护，而不是走共享源。
    const byContent = new Map<string, InstructionDocument[]>()
    for (const item of items) {
      if (!item.contentHash) continue
      const list = byContent.get(item.contentHash) ?? []
      list.push(item)
      byContent.set(item.contentHash, list)
    }
    for (const sameContent of byContent.values()) {
      for (let index = 0; index < sameContent.length; index += 1) {
        for (let next = index + 1; next < sameContent.length; next += 1) {
          const left = sameContent[index]
          const right = sameContent[next]
          if (!left || !right || !sharesSurface(left, right)) continue
          diagnostics.push({ code: 'duplicate', severity: 'info', message: '同一目录存在内容完全相同的指令文件，建议改为共享源加导入', paths: [left.path, right.path], fixable: false })
        }
      }
    }
  }
  // 导入引用先报声明文件，再报解析结果，避免越界目标被项目过滤掉后诊断不可见。
  for (const document of documents) {
    for (const ref of document.imports ?? []) {
      if (ref.exists && !ref.escapesRoot) continue
      diagnostics.push({
        code: 'invalid-import',
        severity: 'warning',
        message: ref.escapesRoot ? `导入路径越出允许范围：@${ref.raw}` : `导入目标不存在：@${ref.raw}`,
        paths: [document.path, ref.target],
        fixable: false,
      })
    }
  }
  return diagnostics
}

export function instructionStats(documents: InstructionDocument[]): { total: number; project: number; global: number; linked: number; readOnly: number } {
  return {
    total: documents.length,
    project: documents.filter((item) => item.scope === 'project').length,
    global: documents.filter((item) => item.scope === 'user').length,
    linked: documents.filter((item) => item.linked).length,
    readOnly: documents.filter((item) => item.readOnly).length,
  }
}
