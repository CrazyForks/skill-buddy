import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { allAdapters } from './adapters/index.js'
import { readSkillDirState } from './skill-io.js'
import type { AgentId, InstalledSkill, SkillRoot } from './types.js'

export interface PlatformStatus {
  id: AgentId
  displayName: string
  detected: boolean
  hasProjectScope: boolean
}

/** One directory whose immediate children are SKILL.md folders. */
export type { SkillRoot } from './types.js'

/** Backward-compatible exports; implementations live in dedicated adapters. */
export {
  discoverClaudePluginRoots,
  discoverCodexSupplementalRoots,
  discoverDoubaoSupplementalRoots,
  discoverLingxiSupplementalRoots,
} from './adapters/index.js'

/** Detection status of every registered platform, for pickers and sidebars. */
export async function listPlatformStatus(): Promise<PlatformStatus[]> {
  return Promise.all(
    allAdapters().map(async (adapter) => ({
      id: adapter.agent,
      displayName: adapter.displayName,
      detected: await adapter.detect(),
      hasProjectScope: adapter.skillsDir('project', '/probe') !== null,
    })),
  )
}

async function listDirectories(path: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path, { withFileTypes: true })
    const directories: string[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        directories.push(entry.name)
        continue
      }
      if (!entry.isSymbolicLink()) continue
      try {
        if ((await fs.stat(join(path, entry.name))).isDirectory()) directories.push(entry.name)
      } catch {
        // Ignore broken links.
      }
    }
    return directories
  } catch {
    return []
  }
}

function dedupeRoots(roots: SkillRoot[]): SkillRoot[] {
  const seen = new Set<string>()
  return roots.filter((root) => {
    const key = `${root.agent}:${resolve(root.path)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Resolve every managed and supplemental skill root for detected platforms. */
export async function listSkillRoots(projectRoots: string[] = []): Promise<SkillRoot[]> {
  const roots: SkillRoot[] = []

  for (const adapter of allAdapters()) {
    if (!(await adapter.detect())) continue
    const canToggle = adapter.supportsToggle !== false && adapter.capabilities?.canToggle !== false
    const userPath = adapter.skillsDir('user')
    if (userPath) {
      roots.push({
        agent: adapter.agent,
        scope: 'user',
        path: userPath,
        origin: 'user',
        readOnly: false,
        canToggle,
      })
    }

    const supplementalRoots = await adapter.supplementalRoots?.()
    if (supplementalRoots) {
      roots.push(...supplementalRoots)
    } else {
      const legacyRoots = await adapter.supplementalSkillRoots?.()
      roots.push(
        ...(legacyRoots ?? []).map((root) => ({
          ...root,
          agent: adapter.agent,
          canToggle: false,
        })),
      )
    }

    for (const projectRoot of projectRoots) {
      const projectPath = adapter.skillsDir('project', projectRoot)
      if (!projectPath) continue
      roots.push({
        agent: adapter.agent,
        scope: 'project',
        path: projectPath,
        projectRoot,
        origin: 'project',
        readOnly: false,
        canToggle,
      })
    }
  }

  return dedupeRoots(roots)
}

async function scanSkillRoot(root: SkillRoot): Promise<InstalledSkill[]> {
  const skills: InstalledSkill[] = []
  for (const name of await listDirectories(root.path)) {
    const skillPath = join(root.path, name)
    const state = await readSkillDirState(skillPath, name)
    if (!state) continue
    let modifiedAt: number | undefined
    try {
      modifiedAt = (await fs.stat(join(skillPath, state.enabled ? 'SKILL.md' : 'SKILL.md.disabled')))
        .mtimeMs
    } catch {
      modifiedAt = undefined
    }
    skills.push({
      agent: root.agent,
      scope: root.scope,
      path: skillPath,
      projectRoot: root.projectRoot,
      origin: root.origin,
      readOnly: root.readOnly,
      canToggle: root.canToggle,
      enabled: state.enabled,
      modifiedAt,
      skill: state.skill,
    })
  }
  return skills
}

/** Scan every resolved root and return all locally available skills. */
export async function scanInstalledSkills(
  projectRoots: string[] = [],
  resolvedRoots?: readonly SkillRoot[],
): Promise<InstalledSkill[]> {
  const roots = resolvedRoots ?? (await listSkillRoots(projectRoots))
  const installations = (await Promise.all(roots.map(scanSkillRoot))).flat()
  const reconciled: InstalledSkill[] = []
  const registeredAgents = new Set<AgentId>()
  for (const adapter of allAdapters()) {
    registeredAgents.add(adapter.agent)
    const agentInstallations = installations.filter(
      (installation) => installation.agent === adapter.agent,
    )
    reconciled.push(
      ...(adapter.reconcileInstallations?.(agentInstallations) ?? agentInstallations),
    )
  }
  reconciled.push(
    ...installations.filter((installation) => !registeredAgents.has(installation.agent)),
  )
  return reconciled
}
