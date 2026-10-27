import { access, readFile, readdir } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { writeJsonAtomic } from './atomic-json.js'
import { checkComponentReleases, compareReleaseVersions, resolveComponentRelease, validateComponentRelease } from './component-releases.js'

const KINDS = ['launcher', 'cli']
const HISTORY_SCHEMA = 'foggy-component-history/v1'
const MINIMUM_VERSION = '0.1.24'

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return null }
}

function assertSupported(kind, version) {
  if (!KINDS.includes(kind)) throw new Error('Select Launcher or CLI.')
  if (compareReleaseVersions(version, MINIMUM_VERSION) < 0) throw new Error(`This plugin requires ${kind === 'cli' ? 'CLI' : 'Launcher'} ${MINIMUM_VERSION} or later.`)
}

export function effectiveComponentVersions(bundled, state) {
  const manifest = structuredClone(bundled)
  manifest.componentSelections = {}
  for (const kind of KINDS) {
    const selection = state?.componentSelections?.[kind]
    if (!selection) continue
    const component = validateComponentRelease(kind, selection)
    assertSupported(kind, component.version)
    manifest.components[kind] = component
    manifest.componentSelections[kind] = component
  }
  return manifest
}

function assetList(kind, component) {
  return kind === 'launcher' ? component.assets : [component.wheel, component.checksums]
}

function componentFromState(kind, state) {
  if (!state?.[kind]?.version) return null
  if (state.componentManifests?.[kind]) return validateComponentRelease(kind, state.componentManifests[kind])
  // Older plugin releases saved hashes and paths, but not complete component manifests.
  const { version } = state[kind]
  const tag = kind === 'launcher' ? `foggy-runtime-launcher-v${version}` : `v${version}`
  const repository = kind === 'launcher' ? 'foggy-data-mcp-bridge' : 'foggy-runtime-cli'
  const names = kind === 'launcher'
    ? [`foggy-runtime-launcher-${version}.jar`, 'start-foggy-runtime.ps1', 'start-foggy-runtime.sh', 'README-foggy-runtime-launcher.md', 'runtime-launcher-manifest.json', 'SHA256SUMS']
    : [`foggy_runtime_cli-${version}-py3-none-any.whl`, 'SHA256SUMS']
  const assets = names.map((file) => {
    const candidates = (state.verifiedAssets || []).filter((asset) => asset.file === file && asset.path
      && (kind === 'launcher' ? relative(state.launcher.path, asset.path) === file : relative(join(state.installRoot, 'downloads', 'cli'), asset.path) === file))
    if (candidates.length !== 1) throw new Error('The previous component does not have a complete verified asset receipt.')
    return { file, sha256: candidates[0].sha256, url: `https://github.com/foggy-projects/${repository}/releases/download/${tag}/${file}` }
  })
  return validateComponentRelease(kind, kind === 'launcher'
    ? { version, minimumJavaVersion: '17.0.0', runtimeApiContract: 'foggy-runtime-api/v1', assets }
    : { version, minimumPythonVersion: '3.11.0', wheel: assets[0], checksums: assets[1] })
}

function within(root, path) {
  const suffix = relative(root, path)
  return suffix !== '' && suffix !== '..' && !suffix.startsWith(`..\\`) && !suffix.startsWith('../') && !isAbsolute(suffix)
}

export async function rememberInstalledComponents(roots, state) {
  const warnings = []
  if (!state) return warnings
  for (const kind of KINDS) {
    let component
    try { component = componentFromState(kind, state) } catch { continue }
    if (!component) continue
    const assets = assetList(kind, component).map((asset) => {
      const verified = state.verifiedAssets?.find((entry) => entry.file === asset.file && entry.sha256 === asset.sha256
        && typeof entry.path === 'string' && within(roots.installRoot, entry.path))
      return verified ? { file: asset.file, sha256: asset.sha256, path: verified.path } : null
    })
    if (assets.some((asset) => !asset)) continue
    try {
      await writeJsonAtomic(join(roots.installRoot, 'component-history', kind, `${component.version}.json`), {
        schemaVersion: HISTORY_SCHEMA, component, assets, installedAt: state.installedAt || null,
      })
    } catch { warnings.push(`Could not save ${kind === 'cli' ? 'CLI' : 'Launcher'} download history. Check the component directory permissions and free space.`) }
  }
  return warnings
}

async function downloadedComponents(roots) {
  const result = { launcher: new Map(), cli: new Map() }
  for (const kind of KINDS) {
    const directory = join(roots.installRoot, 'component-history', kind)
    let files
    try { files = await readdir(directory) } catch { continue }
    for (const name of files.slice(0, 200)) {
      if (!name.endsWith('.json')) continue
      try {
        const receipt = await readJson(join(directory, name))
        if (receipt?.schemaVersion !== HISTORY_SCHEMA) continue
        const component = validateComponentRelease(kind, receipt.component)
        assertSupported(kind, component.version)
        const expected = assetList(kind, component)
        if (!Array.isArray(receipt.assets) || receipt.assets.length !== expected.length) continue
        for (const asset of expected) {
          const entry = receipt.assets.find((item) => item.file === asset.file && item.sha256 === asset.sha256)
          if (!entry || typeof entry.path !== 'string' || !within(roots.installRoot, entry.path)) throw new Error('Invalid saved component path.')
          await access(entry.path)
        }
        result[kind].set(component.version, component)
      } catch { /* Incomplete or invalid downloads must not be offered for offline use. */ }
    }
  }
  return result
}

export async function componentVersions({ roots, bundled, state, force = false, ...options }) {
  const warnings = await rememberInstalledComponents(roots, state)
  const [catalog, local] = await Promise.all([
    checkComponentReleases({ dataRoot: roots.dataRoot, force, ...options }),
    downloadedComponents(roots),
  ])
  const effective = effectiveComponentVersions(bundled, state)
  const components = {}
  for (const kind of KINDS) {
    const source = catalog.components[kind]
    const releases = new Map(source.releases.map((release) => [release.version, { ...release, downloaded: local[kind].has(release.version) }]))
    for (const version of [bundled.components[kind].version, ...local[kind].keys()]) {
      if (!releases.has(version)) releases.set(version, {
        version, prerelease: kind === 'launcher', publishedAt: null,
        url: `https://github.com/foggy-projects/${kind === 'launcher' ? 'foggy-data-mcp-bridge' : 'foggy-runtime-cli'}/releases/tag/${kind === 'launcher' ? 'foggy-runtime-launcher-v' : 'v'}${version}`,
        installable: true, downloaded: local[kind].has(version),
      })
    }
    const entries = [...releases.values()].map((release) => {
      try { assertSupported(kind, release.version); return release } catch (error) { return { ...release, installable: false, unavailableReason: error.message } }
    }).sort((a, b) => compareReleaseVersions(b.version, a.version))
    components[kind] = {
      ...source, releases: entries,
      installedVersion: state?.[kind]?.version || null,
      selectedVersion: effective.components[kind].version,
      bundledVersion: bundled.components[kind].version,
    }
  }
  return { checkedAt: catalog.checkedAt, stale: catalog.stale, error: catalog.error, components, warnings }
}

export async function prepareComponentVersion({ roots, bundled, state, component: kind, version, ...options }) {
  assertSupported(kind, version)
  const warnings = await rememberInstalledComponents(roots, state)
  if (warnings.length) throw new Error(warnings.join(' '))
  const local = await downloadedComponents(roots)
  const component = local[kind].get(version)
    || (bundled.components[kind].version === version ? validateComponentRelease(kind, bundled.components[kind]) : await resolveComponentRelease(kind, version, { dataRoot: roots.dataRoot, ...options }))
  const manifest = effectiveComponentVersions(bundled, state)
  // A Launcher selection must not silently change CLI, or vice versa.
  for (const other of KINDS.filter((item) => item !== kind)) {
    const installed = componentFromState(other, state)
    if (!installed) throw new Error(`Repair ${other === 'cli' ? 'CLI' : 'Launcher'} before selecting component versions.`)
    if (compareReleaseVersions(installed.version, MINIMUM_VERSION) < 0) {
      throw new Error('Use Update components first to upgrade this older installation before selecting individual component versions.')
    }
    manifest.components[other] = installed
    manifest.componentSelections[other] = installed
  }
  manifest.components[kind] = component
  manifest.componentSelections[kind] = component
  return manifest
}
