import { access, readFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const onboardingRoot = join(packageRoot, 'skills', 'foggy-deepseek-onboarding')
const onboardingPath = join(onboardingRoot, 'SKILL.md')
const providerName = 'foggy-managed-skills'
const invocation = { modelInvocable: true, userInvocable: true }

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

function parseSkill(source, expectedName) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) throw new Error(`Foggy Skill ${expectedName} has no valid frontmatter`)
  const metadata = Object.fromEntries(match[1].split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf(':')
    if (separator < 1) return []
    return [[line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^(['\"])(.*)\1$/, '$2')]]
  }))
  if (metadata.name !== expectedName || !metadata.description) {
    throw new Error(`Foggy Skill ${expectedName} has invalid name or description metadata`)
  }
  return { metadata, content: match[2] }
}

function candidate(name, description, path, source) {
  const root = dirname(path)
  return {
    name,
    description,
    invocation,
    provider: providerName,
    source,
    resourceBase: { kind: 'directory', path: root },
    rank: BUNDLED_SKILL_RANK,
    locator: { name, path },
    path,
  }
}

async function managedSkill(installRoot, manifest, { stateKey, componentKey, kind }) {
  const state = await readOptionalJson(join(installRoot, 'install-state.json'))
  const path = state?.skills?.[stateKey]?.path
  if (!path || !await exists(join(path, 'SKILL.md'))) return null
  const marker = await readOptionalJson(join(path, '.foggy-managed-skill.json'))
  if (
    marker?.schemaVersion !== 'foggy-managed-skill/v1'
    || marker?.kind !== kind
    || marker?.componentVersion !== manifest.components[componentKey].version
  ) return null
  return join(path, 'SKILL.md')
}

export function createFoggySkillProvider({ installRoot, versionsFile }) {
  return {
    name: providerName,
    async list(options = {}) {
      if (options.signal?.aborted) return []
      const manifest = await readOptionalJson(versionsFile)
      const onboarding = parseSkill(await readFile(onboardingPath, 'utf8'), 'foggy-deepseek-onboarding')
      const result = [candidate(
        'foggy-deepseek-onboarding',
        onboarding.metadata.description,
        onboardingPath,
        'bundled',
      )]
      if (!manifest) return result
      const managedSkills = [
        { name: 'foggy-ai-analysis', stateKey: 'analysis', componentKey: 'analysisSkill', kind: 'analysis' },
        { name: 'foggy-semantic-query', stateKey: 'semanticQuery', componentKey: 'semanticQuerySkill', kind: 'semantic-query' },
      ]
      for (const spec of managedSkills) {
        const path = await managedSkill(installRoot, manifest, spec)
        if (!path) continue
        const skill = parseSkill(await readFile(path, 'utf8'), spec.name)
        result.push(candidate(spec.name, skill.metadata.description, path, 'bundled'))
      }
      return result
    },
    async get(selected, options = {}) {
      if (options.signal?.aborted) return undefined
      const locator = selected?.locator
      if (!locator?.name || !locator?.path || !await exists(locator.path)) return undefined
      const parsed = parseSkill(await readFile(locator.path, 'utf8'), locator.name)
      return {
        name: locator.name,
        description: parsed.metadata.description,
        invocation,
        provider: providerName,
        source: selected.source,
        resourceBase: { kind: 'directory', path: dirname(locator.path) },
        content: parsed.content,
        path: locator.path,
        metadata: parsed.metadata,
      }
    },
  }
}
