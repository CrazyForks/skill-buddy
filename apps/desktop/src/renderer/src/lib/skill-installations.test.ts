import { describe, expect, it } from 'vitest'
import type { AggregatedSkill } from '@skillbuddy/core'
import {
  deriveSkillInstallationStatus,
  editableSkillInstallations,
  manageableSkillInstallations,
  matchesSkillInstallation,
  toggleableSkillInstallations,
} from './skill-installations.js'

function skill(): AggregatedSkill {
  const canonical = {
    name: 'review-code',
    description: 'Review code',
    tags: [],
    content: '# Review',
  }
  return {
    name: canonical.name,
    description: canonical.description,
    tags: [],
    hasDrift: false,
    hasParseError: false,
    installations: [
      {
        agent: 'codex',
        scope: 'user',
        path: '/shared/review-code',
        skill: canonical,
        contentHash: 'a',
        enabled: true,
      },
      {
        agent: 'cursor',
        scope: 'user',
        path: '/shared/review-code',
        skill: canonical,
        contentHash: 'a',
        enabled: true,
      },
      {
        agent: 'codex',
        scope: 'project',
        projectRoot: '/workspace/one',
        path: '/workspace/one/.agents/skills/review-code',
        skill: canonical,
        contentHash: 'a',
        enabled: false,
      },
      {
        agent: 'codex',
        scope: 'project',
        projectRoot: '/workspace/two',
        path: '/workspace/two/.agents/skills/review-code',
        skill: canonical,
        contentHash: 'a',
        readOnly: true,
      },
    ],
  }
}

describe('skill installation view', () => {
  it('matches the intersection of Agent, project and ownership filters', () => {
    const installation = skill().installations[2]!
    expect(
      matchesSkillInstallation(installation, {
        platformId: 'codex',
        projectFilter: '/workspace/one',
        ownershipFilter: 'managed',
      }),
    ).toBe(true)
    expect(
      matchesSkillInstallation(installation, {
        platformId: 'cursor',
        projectFilter: '/workspace/one',
      }),
    ).toBe(false)
  })

  it('deduplicates shared writable paths and excludes read-only installations', () => {
    const installations = manageableSkillInstallations(skill(), {})
    expect(installations.map((installation) => installation.path)).toEqual([
      '/shared/review-code',
      '/workspace/one/.agents/skills/review-code',
    ])
  })

  it('keeps operations inside the selected scope', () => {
    expect(
      manageableSkillInstallations(skill(), { projectFilter: '/workspace/one' }).map(
        (installation) => installation.path,
      ),
    ).toEqual(['/workspace/one/.agents/skills/review-code'])
    expect(
      manageableSkillInstallations(skill(), { projectFilter: 'user' }).map(
        (installation) => installation.path,
      ),
    ).toEqual(['/shared/review-code'])
  })

  it('keeps non-toggleable installations manageable but excludes them from toggles', () => {
    const current = skill()
    current.installations[0]!.canToggle = false

    expect(manageableSkillInstallations(current, { projectFilter: 'user' })).toHaveLength(1)
    expect(toggleableSkillInstallations(current, { projectFilter: 'user' })).toEqual([])
    expect(deriveSkillInstallationStatus([current.installations[0]!])).toMatchObject({
      writable: [current.installations[0]!],
      toggleable: [],
      allDisabled: false,
      partiallyDisabled: false,
      hasEnabled: false,
    })
  })

  it('excludes parse failures from editing and still deduplicates shared paths', () => {
    const current = skill()
    current.installations[0]!.parseError = {
      path: '/shared/review-code/SKILL.md',
      message: 'bad frontmatter',
    }
    current.installations[1]!.parseError = current.installations[0]!.parseError

    expect(
      editableSkillInstallations(current, {}).map((installation) => installation.path),
    ).toEqual(['/workspace/one/.agents/skills/review-code'])
  })
})
