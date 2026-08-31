import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { BUILTIN_PLATFORMS, type PlatformDef } from '../platforms.js'
import type { InstallScope, SkillRoot } from '../types.js'
import { PlatformAdapter } from './platform-adapter.js'

interface ClaudePluginRecord {
  scope?: string
  installPath?: string
  projectPath?: string
  enabled?: boolean
}

export interface OmpEnvironment {
  OMP_PROFILE?: string
  PI_PROFILE?: string
  PI_CONFIG_DIR?: string
  PI_CODING_AGENT_DIR?: string
  XDG_DATA_HOME?: string
}

type PluginRegistry = { plugins?: Record<string, ClaudePluginRecord[]> }

interface EnabledPluginOverrides {
  user: Map<string, boolean>
  projects: Map<string, Map<string, boolean>>
}

type PluginRootsById = Map<string, SkillRoot[]>

interface ExtensionConfigResult {
  exists: boolean
  paths: string[] | null
}

function activeProfile(env: OmpEnvironment): string | undefined {
  const value = (env.OMP_PROFILE !== undefined ? env.OMP_PROFILE : env.PI_PROFILE)?.trim()
  return value && value !== 'default' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)
    ? value
    : undefined
}

function ompBaseConfigRoot(homeDir: string, env: OmpEnvironment): string {
  return join(homeDir, env.PI_CONFIG_DIR || '.omp')
}

function ompConfigRoot(homeDir: string, env: OmpEnvironment): string {
  const root = ompBaseConfigRoot(homeDir, env)
  const profile = activeProfile(env)
  return profile ? join(root, 'profiles', profile) : root
}

/** Resolve the same profile-aware native agent directory used by OMP. */
export function resolveOmpAgentDir(homeDir: string, env: OmpEnvironment = process.env): string {
  const profile = activeProfile(env)
  if (profile) return join(ompConfigRoot(homeDir, env), 'agent')
  if (env.PI_CODING_AGENT_DIR) {
    return isAbsolute(env.PI_CODING_AGENT_DIR)
      ? env.PI_CODING_AGENT_DIR
      : resolve(homeDir, env.PI_CODING_AGENT_DIR)
  }
  return join(ompBaseConfigRoot(homeDir, env), 'agent')
}

function supplementalRoot(
  agent: SkillRoot['agent'],
  path: string,
  scope: InstallScope = 'user',
  projectRoot?: string,
  origin: SkillRoot['origin'] = 'shared',
): SkillRoot {
  return { agent, scope, path, projectRoot, origin, readOnly: true, canToggle: false }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function readEnabledPluginOverrides(paths: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>()
  for (const path of paths) {
    const settings = await readJson<{ enabledPlugins?: Record<string, unknown> }>(path)
    for (const [id, enabled] of Object.entries(settings?.enabledPlugins ?? {})) {
      if (typeof enabled === 'boolean') result.set(id, enabled)
    }
  }
  return result
}

async function enabledPluginOverrides(
  homeDir: string,
  projectRoots: string[],
): Promise<EnabledPluginOverrides> {
  const user = await readEnabledPluginOverrides([join(homeDir, '.claude', 'settings.json')])
  const projects = new Map<string, Map<string, boolean>>()
  await Promise.all(
    projectRoots.map(async (projectRoot) => {
      const project = new Map(user)
      const scoped = await readEnabledPluginOverrides([
        join(projectRoot, '.claude', 'settings.json'),
        join(projectRoot, '.claude', 'settings.local.json'),
      ])
      for (const [id, enabled] of scoped) project.set(id, enabled)
      projects.set(projectRoot, project)
    }),
  )
  return { user, projects }
}

async function pathExists(path: string): Promise<boolean> {
  return fs.access(path).then(
    () => true,
    () => false,
  )
}

async function ompPluginsRoot(
  homeDir: string,
  env: OmpEnvironment,
  platform: NodeJS.Platform,
): Promise<string> {
  const configRoot = ompConfigRoot(homeDir, env)
  const agentDir = resolveOmpAgentDir(homeDir, env)
  const defaultAgentDir = join(configRoot, 'agent')
  if (
    (platform !== 'linux' && platform !== 'darwin')
    || agentDir !== defaultAgentDir
    || !env.XDG_DATA_HOME
    || !isAbsolute(env.XDG_DATA_HOME)
  ) {
    return join(configRoot, 'plugins')
  }

  const profile = activeProfile(env)
  const xdgRoot = profile
    ? join(env.XDG_DATA_HOME, 'omp', 'profiles', profile)
    : join(env.XDG_DATA_HOME, 'omp')
  return join(await pathExists(xdgRoot) ? xdgRoot : configRoot, 'plugins')
}

async function pluginRootsByIdFromRegistry(
  agent: SkillRoot['agent'],
  registryPath: string,
  overrides: EnabledPluginOverrides | null,
  defaultProjectRoot?: string,
  activeProjectRoots: string[] = [],
  preserveEmptyPluginIds = false,
): Promise<PluginRootsById> {
  const registry = await readJson<PluginRegistry>(registryPath)
  const roots = new Map<string, SkillRoot[]>()
  for (const [pluginId, records] of Object.entries(registry?.plugins ?? {})) {
    if (!Array.isArray(records)) continue
    const pluginRoots: SkillRoot[] = []
    for (const record of records) {
      if (record.enabled === false || typeof record.installPath !== 'string') continue
      const isProject = record.scope === 'local' || record.scope === 'project' || !!defaultProjectRoot
      if (!isProject) {
        if (overrides?.user.get(pluginId) === false) continue
        pluginRoots.push(
          supplementalRoot(agent, join(record.installPath, 'skills'), 'user', undefined, 'plugin'),
        )
        continue
      }
      const recordedProjectRoot = record.projectPath ?? defaultProjectRoot
      const targetProjects = defaultProjectRoot
        ? [defaultProjectRoot]
        : activeProjectRoots.filter(
            (projectRoot) =>
              projectRoot === recordedProjectRoot
              || overrides?.projects.get(projectRoot)?.get(pluginId) === true,
          )
      for (const projectRoot of targetProjects) {
        if (overrides?.projects.get(projectRoot)?.get(pluginId) === false) continue
        pluginRoots.push(
          supplementalRoot(
            agent,
            join(record.installPath, 'skills'),
            'project',
            projectRoot,
            'plugin',
          ),
        )
      }
    }
    if (pluginRoots.length > 0 || (preserveEmptyPluginIds && records.length > 0)) {
      roots.set(pluginId, pluginRoots)
    }
  }
  return roots
}

function mergePluginRoots(target: PluginRootsById, source: PluginRootsById): void {
  for (const [pluginId, roots] of source) target.set(pluginId, roots)
}

async function installedOmpExtensionRoots(
  agent: SkillRoot['agent'],
  pluginsRoot: string,
  scope: InstallScope,
  projectRoot?: string,
): Promise<SkillRoot[]> {
  const packageJson = await readJson<{ dependencies?: Record<string, string> }>(
    join(pluginsRoot, 'package.json'),
  )
  const lock = await readJson<{
    plugins?: Record<string, { enabled?: boolean }>
  }>(join(pluginsRoot, 'omp-plugins.lock.json'))
  const overrides = projectRoot
    ? await readJson<{ disabled?: string[] }>(join(projectRoot, '.omp', 'plugin-overrides.json'))
    : null
  const names = new Set([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(lock?.plugins ?? {}),
  ])
  const roots: SkillRoot[] = []
  for (const name of names) {
    if (lock?.plugins?.[name]?.enabled === false || overrides?.disabled?.includes(name)) continue
    const pluginRoot = join(pluginsRoot, 'node_modules', name)
    const pluginPackage = await readJson<{ omp?: unknown; pi?: unknown }>(join(pluginRoot, 'package.json'))
    if (!pluginPackage?.omp && !pluginPackage?.pi) continue
    roots.push(supplementalRoot(agent, join(pluginRoot, 'skills'), scope, projectRoot, 'plugin'))
  }
  return roots
}

function extensionPaths(value: unknown, projectRoot: string, homeDir: string): string[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const extensions = (value as { extensions?: unknown }).extensions
  if (!Array.isArray(extensions)) return null
  return extensions
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .map((entry) => {
      const expanded = entry === '~'
        ? homeDir
        : entry.startsWith('~/')
          ? join(homeDir, entry.slice(2))
          : entry
      return isAbsolute(expanded) ? expanded : resolve(projectRoot, expanded)
    })
}

async function readExtensionConfig(
  path: string,
  projectRoot: string,
  homeDir: string,
): Promise<ExtensionConfigResult> {
  let content: string
  try {
    content = await fs.readFile(path, 'utf8')
  } catch {
    return { exists: false, paths: null }
  }
  try {
    const parsed = path.endsWith('.json') ? JSON.parse(content) : parseYaml(content)
    return { exists: true, paths: extensionPaths(parsed, projectRoot, homeDir) }
  } catch {
    return { exists: true, paths: null }
  }
}

async function configuredExtensionsForProject(
  projectRoot: string,
  homeDir: string,
  agentDir: string,
): Promise<{ paths: string[]; scope: InstallScope } | null> {
  if (projectRoot !== agentDir) {
    const projectYaml = await readExtensionConfig(
      join(projectRoot, '.omp', 'config.yml'),
      projectRoot,
      homeDir,
    )
    if (projectYaml.paths !== null) return { paths: projectYaml.paths, scope: 'project' }

    const projectSettings = await readExtensionConfig(
      join(projectRoot, '.omp', 'settings.json'),
      projectRoot,
      homeDir,
    )
    if (projectSettings.paths !== null) return { paths: projectSettings.paths, scope: 'project' }
  }

  for (const fileName of ['config.yml', 'config.yaml']) {
    const userYaml = await readExtensionConfig(join(agentDir, fileName), projectRoot, homeDir)
    if (!userYaml.exists) continue
    return userYaml.paths === null ? null : { paths: userYaml.paths, scope: 'user' }
  }

  const userSettings = await readExtensionConfig(
    join(agentDir, 'settings.json'),
    projectRoot,
    homeDir,
  )
  return userSettings.paths === null ? null : { paths: userSettings.paths, scope: 'user' }
}

async function configuredExtensionRoots(
  agent: SkillRoot['agent'],
  homeDir: string,
  agentDir: string,
  projectRoots: string[],
): Promise<SkillRoot[]> {
  const contexts = projectRoots.length > 0 ? projectRoots : [agentDir]
  const roots: SkillRoot[] = []
  for (const projectRoot of contexts) {
    const configured = await configuredExtensionsForProject(projectRoot, homeDir, agentDir)
    if (!configured) continue
    roots.push(
      ...configured.paths.map((path) =>
        supplementalRoot(
          agent,
          join(path, 'skills'),
          configured.scope,
          configured.scope === 'project' ? projectRoot : undefined,
          'plugin',
        ),
      ),
    )
  }
  return roots
}

/** OMP adapter mirroring its native, shared and plugin Skill providers. */
export class OmpAdapter extends PlatformAdapter {
  constructor(
    def: PlatformDef,
    private readonly ompHomeDir: string = homedir(),
    private readonly env: OmpEnvironment = process.env,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    super(def, ompHomeDir)
  }

  override skillsDir(scope: InstallScope, projectRoot?: string): string | null {
    if (scope === 'user') return join(resolveOmpAgentDir(this.ompHomeDir, this.env), 'skills')
    return super.skillsDir(scope, projectRoot)
  }

  override async detect(): Promise<boolean> {
    return fs.access(resolveOmpAgentDir(this.ompHomeDir, this.env)).then(
      () => true,
      () => false,
    )
  }

  async supplementalRoots(projectRoots: string[] = []): Promise<SkillRoot[]> {
    const agentDir = resolveOmpAgentDir(this.ompHomeDir, this.env)
    const pluginsRoot = await ompPluginsRoot(this.ompHomeDir, this.env, this.platform)
    const roots: SkillRoot[] = [
      join(this.ompHomeDir, '.agent', 'skills'),
      join(this.ompHomeDir, '.agents', 'skills'),
      join(this.ompHomeDir, '.claude', 'skills'),
      join(this.ompHomeDir, '.codex', 'skills'),
      join(this.ompHomeDir, '.pi', 'agent', 'skills'),
      join(this.ompHomeDir, '.config', 'opencode', 'skills'),
      join(agentDir, 'managed-skills'),
    ].map((path) => supplementalRoot(this.agent, path))

    const projectProviders = ['.agent', '.agents', '.claude', '.codex', '.pi', '.opencode', '.github']
    for (const projectRoot of projectRoots) {
      roots.push(
        ...projectProviders.map((directory) =>
          supplementalRoot(this.agent, join(projectRoot, directory, 'skills'), 'project', projectRoot),
        ),
      )
    }

    const overrides = await enabledPluginOverrides(this.ompHomeDir, projectRoots)
    const pluginRoots = await pluginRootsByIdFromRegistry(
      this.agent,
      join(this.ompHomeDir, '.claude', 'plugins', 'installed_plugins.json'),
      overrides,
      undefined,
      projectRoots,
    )
    mergePluginRoots(
      pluginRoots,
      await pluginRootsByIdFromRegistry(
        this.agent,
        join(pluginsRoot, 'installed_plugins.json'),
        null,
        undefined,
        projectRoots,
        true,
      ),
    )
    const projectPluginRoots = new Map<string, SkillRoot[]>()
    for (const projectRoot of projectRoots) {
      const discovered = await pluginRootsByIdFromRegistry(
        this.agent,
        join(projectRoot, '.omp', 'plugins', 'installed_plugins.json'),
        null,
        projectRoot,
        projectRoots,
      )
      for (const [pluginId, discoveredRoots] of discovered) {
        projectPluginRoots.set(pluginId, [
          ...(projectPluginRoots.get(pluginId) ?? []),
          ...discoveredRoots,
        ])
      }
    }
    mergePluginRoots(pluginRoots, projectPluginRoots)
    roots.push(...[...pluginRoots.values()].flatMap((items) => items))
    roots.push(
      ...(await configuredExtensionRoots(this.agent, this.ompHomeDir, agentDir, projectRoots)),
      ...(await installedOmpExtensionRoots(this.agent, pluginsRoot, 'user')),
    )
    for (const projectRoot of projectRoots) {
      roots.push(
        ...(await installedOmpExtensionRoots(
          this.agent,
          join(projectRoot, '.omp', 'plugins'),
          'project',
          projectRoot,
        )),
      )
    }
    return roots
  }
}

export function discoverOmpSupplementalRoots(
  homeDir: string = homedir(),
  projectRoots: string[] = [],
  env: OmpEnvironment = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<SkillRoot[]> {
  const def = BUILTIN_PLATFORMS.find((platform) => platform.id === 'omp')!
  return new OmpAdapter(def, homeDir, env, platform).supplementalRoots(projectRoots)
}
