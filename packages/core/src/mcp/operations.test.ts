import { describe, expect, it } from 'vitest'
import { INITIAL_MCP_PROFILES } from './catalog.js'
import { projectMcpDefinition } from './operations.js'
import type { McpServerDefinition } from './types.js'

const profile = (agent: string) => {
  const found = INITIAL_MCP_PROFILES.find((candidate) => candidate.agent === agent)
  if (!found) throw new Error(`missing profile: ${agent}`)
  return found
}

const stdioDefinition: McpServerDefinition = {
  name: 'database',
  transport: {
    kind: 'stdio',
    command: 'node',
    args: ['server.js'],
    env: {
      DATABASE_URL: { kind: 'env', name: 'DATABASE_URL' },
    },
  },
  requiredSecrets: ['DATABASE_URL'],
}

describe('projectMcpDefinition', () => {
  it('uses platform-native environment references', () => {
    const claude = projectMcpDefinition(
      stdioDefinition,
      { agent: 'claude-code', surface: 'cli', scope: 'user' },
      profile('claude-code'),
    )
    const opencode = projectMcpDefinition(
      stdioDefinition,
      { agent: 'opencode', surface: 'cli', scope: 'user' },
      profile('opencode'),
    )
    const codex = projectMcpDefinition(
      stdioDefinition,
      { agent: 'codex', surface: 'cli', scope: 'user' },
      profile('codex'),
    )

    expect(claude.nativeValue).toMatchObject({ env: { DATABASE_URL: '${DATABASE_URL}' } })
    expect(opencode.nativeValue).toMatchObject({
      environment: { DATABASE_URL: '{env:DATABASE_URL}' },
    })
    expect(codex.nativeValue).toMatchObject({ env_vars: ['DATABASE_URL'] })
  })

  it('projects Antigravity servers to serverUrl without a transport type', () => {
    const stdio = projectMcpDefinition(
      stdioDefinition,
      { agent: 'google-antigravity', surface: 'ide', scope: 'user' },
      profile('google-antigravity'),
    )
    const remote = projectMcpDefinition(
      {
        name: 'remote-service',
        transport: {
          kind: 'sse',
          url: 'https://mcp.example.com/sse',
          headers: {
            Authorization: { kind: 'env', name: 'MCP_TOKEN' },
          },
        },
        requiredSecrets: [],
      },
      { agent: 'google-antigravity', surface: 'ide', scope: 'user' },
      profile('google-antigravity'),
    )

    expect(stdio.blockers).toEqual([])
    expect(stdio.nativeValue).toEqual({
      command: 'node',
      args: ['server.js'],
      env: { DATABASE_URL: '${DATABASE_URL}' },
    })

    expect(remote.blockers).toEqual([])
    expect(remote.nativeValue).toEqual({
      serverUrl: 'https://mcp.example.com/sse',
      headers: { Authorization: '${MCP_TOKEN}' },
    })
    // Antigravity 的配置里没有 type 键，写出来就是无效配置。
    expect(stdio.nativeValue).not.toHaveProperty('type')
    expect(remote.nativeValue).not.toHaveProperty('type')
    expect(remote.nativeValue).not.toHaveProperty('url')
  })

  it('blocks Antigravity transports and scopes it cannot express', () => {
    const unsupportedTransport = projectMcpDefinition(
      {
        name: 'streamed',
        transport: { kind: 'streamable-http', url: 'https://mcp.example.com/mcp', headers: {} },
        requiredSecrets: [],
      },
      { agent: 'google-antigravity', surface: 'ide', scope: 'user' },
      profile('google-antigravity'),
    )
    const unsupportedScope = projectMcpDefinition(
      stdioDefinition,
      { agent: 'google-antigravity', surface: 'ide', scope: 'project' },
      profile('google-antigravity'),
    )

    expect(unsupportedTransport.blockers.map((issue) => issue.code)).toContain(
      'MCP_TRANSPORT_UNSUPPORTED',
    )
    // MCP 只落在全局与插件目录，工作区级配置无处可写。
    expect(unsupportedScope.blockers.map((issue) => issue.code)).toContain(
      'MCP_SCOPE_UNSUPPORTED',
    )
  })

  it('blocks non-exportable secrets and unsupported transports', () => {
    const projection = projectMcpDefinition(
      {
        name: 'private',
        transport: {
          kind: 'websocket',
          url: 'wss://example.invalid/mcp',
          headers: {
            Authorization: { kind: 'secret', key: 'Authorization', state: 'configured' },
          },
        },
        requiredSecrets: ['Authorization'],
        metadata: { nonExportableFields: ['transport.url'] },
      },
      { agent: 'codex', surface: 'cli', scope: 'user' },
      profile('codex'),
    )

    expect(projection.blockers.map((issue) => issue.code)).toContain(
      'MCP_TRANSPORT_UNSUPPORTED',
    )
    expect(projection.blockers.map((issue) => issue.code)).toContain(
      'MCP_SECRET_NOT_EXPORTABLE',
    )
  })
})
