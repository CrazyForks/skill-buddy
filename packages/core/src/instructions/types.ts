import type { AgentId } from '../types.js'

export interface SurfaceRef {
  vendorId: string
  productId: string
  surfaceId: string
}

export function surfaceKey(ref: SurfaceRef): string {
  return `${ref.vendorId}/${ref.productId}/${ref.surfaceId}`
}

export type InstructionScope = 'user' | 'project'
export type InstructionKind = 'agents' | 'claude' | 'gemini' | 'custom'
export type InstructionStatus =
  | 'ok'
  | 'missing'
  | 'bridged'
  | 'drifted'
  | 'conflict'
  | 'link-broken'
  | 'externally-changed'
  | 'read-only'

export interface InstructionBinding {
  surface: SurfaceRef
  role: 'primary' | 'fallback' | 'shadowed' | 'requires-config' | 'unsupported'
  status: InstructionStatus
  shadowedBy?: string
}

/**
 * 指令文件里解析出的一条 Markdown 导入引用（Claude Code 的 `@path` 语法）。
 *
 * 路径一律按声明文件所在目录解析；`root` 为该项目允许访问的边界，
 * 越过边界的引用在诊断阶段报为 `invalid-import`。
 */
export interface InstructionImportRef {
  /** 原始引用文本，不含前导 `@`。 */
  raw: string
  /** 按声明文件所在目录解析后的绝对路径。 */
  target: string
  /** 目标文件当前是否存在。 */
  exists: boolean
  /** 目标是否越出允许的根目录（项目根或全局根）。 */
  escapesRoot: boolean
}

export interface InstructionDocument {
  id: string
  kind: InstructionKind
  fileName: string
  path: string
  scope: InstructionScope
  projectRoot?: string
  relativeDirectory?: string
  bindings: InstructionBinding[]
  contentHash: string
  modifiedAt: number
  size: number
  readOnly: boolean
  linked: boolean
  linkTarget?: string
  linkBroken?: boolean
  contentTruncated?: boolean
  encodingInvalid?: boolean
  /** 文件中解析出的导入引用，仅在内容可读且编码合法时存在。 */
  imports?: InstructionImportRef[]
}

export interface InstructionRuleProfile {
  key: SurfaceRef
  displayName: string
  versionRange?: string
  platformId: AgentId | null
  globalPaths: string[]
  projectFileCandidates: string[]
  localOverlayCandidates: string[]
  overrideCandidates?: string[]
  rulesDirCandidates?: string[]
  supportsNested: boolean | 'unknown'
  traversal:
    | 'merge-root-to-leaf'
    | 'nearest-match'
    | 'dynamic-root-to-target'
    | 'tool-defined'
  sameDirectoryPrecedence: string[]
  projectFallbacks: string[]
  bridgeStrategies: InstructionBridgeStrategy[]
  evidence: 'official' | 'verified' | 'community' | 'unknown'
  verifiedVersion?: string
  verifiedAt?: string
}

export type InstructionBridgeStrategy = 'markdown-import' | 'symlink' | 'copy'

export interface EffectiveInstructionChain {
  surface: SurfaceRef
  projectRoot: string
  targetDirectory: string
  documents: InstructionDocument[]
  warnings: InstructionDiagnostic[]
  includesGlobal: boolean
}

export interface InstructionDiagnostic {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  paths: string[]
  fixable: boolean
}

export interface InstructionScanResult {
  documents: InstructionDocument[]
  warnings: InstructionDiagnostic[]
  scannedRoots: string[]
  directories: InstructionDirectory[]
}

export interface InstructionDirectory {
  projectRoot: string
  path: string
  relativeDirectory: string
}
