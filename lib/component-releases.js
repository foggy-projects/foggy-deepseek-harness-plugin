import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeJsonAtomic } from './atomic-json.js'

const CACHE_SCHEMA = 'foggy-component-releases/v1'
const CACHE_TTL = 6 * 60 * 60_000
const FAILURE_TTL = 15 * 60_000
const PAGE_SIZE = 30
const MAX_PAGES = 3
const MAX_RELEASES = 30
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/
const SHA256 = /^[a-f0-9]{64}$/
const SOURCES = {
  launcher: { repository: 'foggy-projects/foggy-data-mcp-bridge', prefix: 'foggy-runtime-launcher-v' },
  cli: { repository: 'foggy-projects/foggy-runtime-cli', prefix: 'v' },
}
const checks = new Map()

export class ComponentReleaseError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ComponentReleaseError'
    this.code = code
  }
}

function fail(code, message) {
  throw new ComponentReleaseError(code, message)
}

function sourceFor(kind) {
  const source = SOURCES[kind]
  if (!source) fail('COMPONENT_KIND_INVALID', 'Select Launcher or CLI.')
  return source
}

function validVersion(version) {
  if (typeof version !== 'string' || version.length > 80) return false
  const match = version.match(VERSION)
  return Boolean(match && (!match[4] || match[4].split('.').every((part) => /^[0-9A-Za-z-]+$/.test(part) && !/^0\d+$/.test(part))))
}

function compareNumeric(left, right) {
  if (left.length !== right.length) return Math.sign(left.length - right.length)
  return left === right ? 0 : left < right ? -1 : 1
}

export function compareReleaseVersions(left, right) {
  if (!validVersion(left) || !validVersion(right)) fail('COMPONENT_VERSION_INVALID', 'Invalid component version.')
  const a = String(left).match(VERSION)
  const b = String(right).match(VERSION)
  for (let index = 1; index <= 3; index += 1) {
    const result = compareNumeric(a[index], b[index])
    if (result) return result
  }
  if (!a[4] && !b[4]) return 0
  if (!a[4]) return 1
  if (!b[4]) return -1
  const aParts = a[4].split('.')
  const bParts = b[4].split('.')
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    if (aParts[index] === bParts[index]) continue
    if (aParts[index] === undefined) return -1
    if (bParts[index] === undefined) return 1
    const aNumeric = /^\d+$/.test(aParts[index])
    const bNumeric = /^\d+$/.test(bParts[index])
    if (aNumeric && bNumeric) return compareNumeric(aParts[index], bParts[index])
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
    return aParts[index] < bParts[index] ? -1 : 1
  }
  return 0
}

function requiredFiles(kind, version) {
  return kind === 'launcher'
    ? [
        `foggy-runtime-launcher-${version}.jar`,
        'start-foggy-runtime.ps1',
        'start-foggy-runtime.sh',
        'README-foggy-runtime-launcher.md',
        'runtime-launcher-manifest.json',
        'SHA256SUMS',
      ]
    : [`foggy_runtime_cli-${version}-py3-none-any.whl`, 'SHA256SUMS']
}

function releaseUrl(kind, tag) {
  return `https://github.com/${sourceFor(kind).repository}/releases/tag/${tag}`
}

function assetUrl(kind, tag, file) {
  return `https://github.com/${sourceFor(kind).repository}/releases/download/${tag}/${file}`
}

function verifiedAsset(kind, tag, file, assets) {
  const matching = assets.filter((asset) => asset?.name === file)
  if (matching.length !== 1) fail('COMPONENT_ASSET_MISSING', `Release requires exactly one ${file} asset.`)
  const asset = matching[0]
  if (asset.browser_download_url !== assetUrl(kind, tag, file)) {
    fail('COMPONENT_ASSET_UNTRUSTED', `Release asset ${file} does not use the official download URL.`)
  }
  if (asset.digest != null && !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) {
    fail('COMPONENT_DIGEST_INVALID', `Release asset ${file} has an invalid SHA256 digest.`)
  }
  return asset
}

function normalizeRelease(kind, release) {
  const source = sourceFor(kind)
  if (!release || release.draft || typeof release.tag_name !== 'string' || !release.tag_name.startsWith(source.prefix)) return null
  const version = release.tag_name.slice(source.prefix.length)
  if (!validVersion(version)) return null
  const tag = `${source.prefix}${version}`
  if (release.tag_name !== tag || release.html_url !== releaseUrl(kind, tag)) return null
  let unavailableReason = null
  try {
    if (!Array.isArray(release.assets)) fail('COMPONENT_ASSET_MISSING', 'Release assets are unavailable.')
    for (const file of requiredFiles(kind, version)) verifiedAsset(kind, tag, file, release.assets)
  } catch (error) {
    unavailableReason = error.message
  }
  return {
    version,
    tag,
    prerelease: Boolean(release.prerelease || version.includes('-')),
    publishedAt: typeof release.published_at === 'string' && Number.isFinite(Date.parse(release.published_at)) ? release.published_at : null,
    url: releaseUrl(kind, tag),
    installable: unavailableReason === null,
    ...(unavailableReason ? { unavailableReason } : {}),
  }
}

function emptyComponent() {
  return { latestVersion: null, latestStableVersion: null, checkedAt: null, releases: [] }
}

function emptyCatalog() {
  return { checkedAt: null, attemptedAt: null, stale: true, error: null, components: { launcher: emptyComponent(), cli: emptyComponent() } }
}

function validateCachedComponent(kind, component) {
  if (!component || !Array.isArray(component.releases) || component.releases.length > MAX_RELEASES) return emptyComponent()
  const releases = component.releases.filter((release) => validVersion(release?.version)
    && release.tag === `${sourceFor(kind).prefix}${release.version}`
    && release.url === releaseUrl(kind, release.tag)
    && typeof release.installable === 'boolean')
    .map(({ version, tag, prerelease, publishedAt, url, installable, unavailableReason }) => ({ version, tag, prerelease: Boolean(prerelease || version.includes('-')), publishedAt: typeof publishedAt === 'string' && Number.isFinite(Date.parse(publishedAt)) ? publishedAt : null, url, installable, ...(unavailableReason ? { unavailableReason: String(unavailableReason).slice(0, 300) } : {}) }))
    .sort((a, b) => compareReleaseVersions(b.version, a.version))
  return {
    latestVersion: releases[0]?.version ?? null,
    latestStableVersion: releases.find((release) => !release.prerelease)?.version ?? null,
    checkedAt: Number.isFinite(Date.parse(component.checkedAt)) ? component.checkedAt : null,
    releases,
  }
}

export function componentReleaseCachePath(dataRoot) {
  return join(dataRoot, 'component-releases.json')
}

export async function readComponentReleaseCache(dataRoot, { now = Date.now } = {}) {
  try {
    const payload = JSON.parse(await readFile(componentReleaseCachePath(dataRoot), 'utf8'))
    if (payload.schemaVersion !== CACHE_SCHEMA) return emptyCatalog()
    const checkedAt = Number.isFinite(Date.parse(payload.checkedAt)) ? payload.checkedAt : null
    return {
      checkedAt,
      attemptedAt: Number.isFinite(Date.parse(payload.attemptedAt)) ? payload.attemptedAt : null,
      stale: Boolean(payload.stale || !checkedAt || now() - Date.parse(checkedAt) >= CACHE_TTL),
      error: typeof payload.error === 'string' ? payload.error.slice(0, 600) : null,
      components: {
        launcher: validateCachedComponent('launcher', payload.components?.launcher),
        cli: validateCachedComponent('cli', payload.components?.cli),
      },
    }
  } catch {
    return emptyCatalog()
  }
}

async function requestText(url, { fetchImpl = globalThis.fetch, timeoutMs = 10_000, api = false, maxBytes = 3 * 1024 * 1024 } = {}) {
  let response
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: api ? 'error' : 'follow',
      headers: { Accept: api ? 'application/vnd.github+json' : 'application/octet-stream', 'User-Agent': 'Foggy-DeepSeek-Harness-Plugin', ...(api ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}) },
    })
  } catch {
    fail('COMPONENT_RELEASE_NETWORK', 'Cannot reach the official component release service; check your network and try again.')
  }
  if (!response.ok) {
    fail('COMPONENT_RELEASE_HTTP', response.status === 403 || response.status === 429
      ? 'GitHub release checks are temporarily rate limited; try again later.'
      : `Official component release request failed (HTTP ${response.status}).`)
  }
  const length = Number(response.headers?.get?.('content-length'))
  if (length > maxBytes) fail('COMPONENT_RELEASE_TOO_LARGE', 'Official release metadata exceeds the supported size.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > maxBytes) fail('COMPONENT_RELEASE_TOO_LARGE', 'Official release metadata exceeds the supported size.')
  return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), bytes }
}

async function requestJson(url, options) {
  const { text } = await requestText(url, { ...options, api: true })
  try { return JSON.parse(text) } catch { fail('COMPONENT_RELEASE_INVALID', 'The official release service returned invalid metadata.') }
}

async function discoverComponent(kind, options) {
  const source = sourceFor(kind)
  const releases = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await requestJson(`https://api.github.com/repos/${source.repository}/releases?per_page=${PAGE_SIZE}&page=${page}`, options)
    if (!Array.isArray(payload)) fail('COMPONENT_RELEASE_INVALID', 'The official release service did not return a release list.')
    for (const release of payload) {
      const normalized = normalizeRelease(kind, release)
      if (normalized && !releases.some((item) => item.version === normalized.version)) releases.push(normalized)
    }
    if (payload.length < PAGE_SIZE) break
  }
  releases.sort((a, b) => compareReleaseVersions(b.version, a.version))
  const visible = releases.slice(0, MAX_RELEASES)
  return {
    latestVersion: visible[0]?.version ?? null,
    latestStableVersion: visible.find((release) => !release.prerelease)?.version ?? null,
    checkedAt: new Date((options.now ?? Date.now)()).toISOString(),
    releases: visible,
  }
}

/** Read official versions, with a six-hour cache and offline fallback. Does not install anything. */
export async function checkComponentReleases({ dataRoot, force = false, now = Date.now, ...options }) {
  if (!dataRoot) throw new TypeError('dataRoot is required')
  const cached = await readComponentReleaseCache(dataRoot, { now })
  const age = cached.attemptedAt ? now() - Date.parse(cached.attemptedAt) : Infinity
  if (!force && age >= 0 && age < (cached.error ? FAILURE_TTL : CACHE_TTL)) return cached
  if (checks.has(dataRoot)) return checks.get(dataRoot)
  const pending = (async () => {
    const result = { ...cached, attemptedAt: new Date(now()).toISOString(), components: { ...cached.components } }
    const outcomes = await Promise.allSettled(['launcher', 'cli'].map((kind) => discoverComponent(kind, { ...options, now })))
    const errors = []
    for (let index = 0; index < outcomes.length; index += 1) {
      const kind = index === 0 ? 'launcher' : 'cli'
      const outcome = outcomes[index]
      if (outcome.status === 'fulfilled') result.components[kind] = outcome.value
      else errors.push(`${kind === 'launcher' ? 'Launcher' : 'CLI'}: ${outcome.reason?.message || 'Release check failed.'}`)
    }
    result.stale = errors.length > 0
    result.error = errors.length ? errors.join(' ').slice(0, 600) : null
    if (!errors.length) result.checkedAt = result.attemptedAt
    try {
      await writeJsonAtomic(componentReleaseCachePath(dataRoot), { schemaVersion: CACHE_SCHEMA, ...result })
    } catch {
      // Version checking must never prevent running already-installed components.
    }
    return result
  })()
  checks.set(dataRoot, pending)
  try { return await pending } finally { if (checks.get(dataRoot) === pending) checks.delete(dataRoot) }
}

function parseChecksums(text) {
  const hashes = new Map()
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?([^\r\n]+?)\s*$/)
    if (!match || !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(match[2])) {
      fail('COMPONENT_CHECKSUM_INVALID', 'The official SHA256SUMS file contains an invalid entry.')
    }
    const hash = match[1].toLowerCase()
    if (hashes.has(match[2]) && hashes.get(match[2]) !== hash) fail('COMPONENT_CHECKSUM_INVALID', 'The official SHA256SUMS file contains conflicting entries.')
    hashes.set(match[2], hash)
  }
  if (!hashes.size) fail('COMPONENT_CHECKSUM_INVALID', 'The official SHA256SUMS file contains no checksums.')
  return hashes
}

function assertDigest(asset, hash) {
  if (asset.digest && asset.digest !== `sha256:${hash}`) fail('COMPONENT_CHECKSUM_MISMATCH', `GitHub and SHA256SUMS disagree for ${asset.name}.`)
}

/** Validate an already-verified component receipt without contacting GitHub. */
export function validateComponentRelease(kind, component) {
  const source = sourceFor(kind)
  if (!component || !validVersion(component.version)) fail('COMPONENT_VERSION_INVALID', 'Invalid saved component version.')
  const { version } = component
  const tag = `${source.prefix}${version}`
  const files = requiredFiles(kind, version)
  const inputs = kind === 'launcher' ? component.assets : [component.wheel, component.checksums]
  if (!Array.isArray(inputs) || inputs.length !== files.length) fail('COMPONENT_ASSET_MISSING', 'Saved component receipt has an incomplete asset list.')
  const assets = files.map((file) => {
    const matches = inputs.filter((asset) => asset?.file === file)
    if (matches.length !== 1) fail('COMPONENT_ASSET_MISSING', `Saved component receipt requires exactly one ${file} asset.`)
    const asset = matches[0]
    if (asset.url !== assetUrl(kind, tag, file) || !SHA256.test(asset.sha256 ?? '')) {
      fail('COMPONENT_ASSET_UNTRUSTED', `Saved component asset ${file} has an invalid official URL or checksum.`)
    }
    return { file, url: asset.url, sha256: asset.sha256 }
  })
  if (kind === 'launcher') {
    if (component.minimumJavaVersion !== '17.0.0' || component.runtimeApiContract !== 'foggy-runtime-api/v1') {
      fail('COMPONENT_MANIFEST_INCOMPATIBLE', 'Saved Launcher receipt uses an unsupported Runtime API or Java requirement.')
    }
    return { version, minimumJavaVersion: '17.0.0', runtimeApiContract: 'foggy-runtime-api/v1', assets }
  }
  if (component.minimumPythonVersion !== '3.11.0') fail('COMPONENT_MANIFEST_INCOMPATIBLE', 'Saved CLI receipt uses an unsupported Python requirement.')
  return { version, minimumPythonVersion: '3.11.0', wheel: assets[0], checksums: assets[1] }
}

async function verifiedJsonAsset(kind, tag, file, assets, hashes, options) {
  const asset = verifiedAsset(kind, tag, file, assets)
  const expected = hashes.get(file)
  if (!expected) fail('COMPONENT_CHECKSUM_MISSING', `SHA256SUMS does not cover ${file}.`)
  const payload = await requestText(asset.browser_download_url, { ...options, maxBytes: 256 * 1024 })
  const actual = createHash('sha256').update(payload.bytes).digest('hex')
  if (actual !== expected) fail('COMPONENT_CHECKSUM_MISMATCH', `Downloaded ${file} does not match SHA256SUMS.`)
  assertDigest(asset, actual)
  try { return JSON.parse(payload.text) } catch { fail('COMPONENT_MANIFEST_INVALID', `The official ${file} is invalid.`) }
}

/** Resolve a selected official tag to the existing versions.json component format. */
export async function resolveComponentRelease(kind, version, options = {}) {
  const source = sourceFor(kind)
  if (!validVersion(version)) fail('COMPONENT_VERSION_INVALID', 'Select a valid published component version.')
  const tag = `${source.prefix}${version}`
  const release = await requestJson(`https://api.github.com/repos/${source.repository}/releases/tags/${tag}`, options)
  const normalized = normalizeRelease(kind, release)
  if (!normalized || normalized.tag !== tag) fail('COMPONENT_RELEASE_INVALID', 'The requested official release was not found or is a draft.')
  if (!normalized.installable) fail('COMPONENT_RELEASE_INCOMPLETE', normalized.unavailableReason)
  const checksumAsset = verifiedAsset(kind, tag, 'SHA256SUMS', release.assets)
  const checksumPayload = await requestText(checksumAsset.browser_download_url, { ...options, maxBytes: 256 * 1024 })
  const checksumHash = createHash('sha256').update(checksumPayload.bytes).digest('hex')
  assertDigest(checksumAsset, checksumHash)
  const hashes = parseChecksums(checksumPayload.text)
  const assets = requiredFiles(kind, version).map((file) => {
    const asset = verifiedAsset(kind, tag, file, release.assets)
    const hash = file === 'SHA256SUMS' ? checksumHash : hashes.get(file)
    if (!SHA256.test(hash ?? '')) fail('COMPONENT_CHECKSUM_MISSING', `SHA256SUMS does not cover ${file}.`)
    assertDigest(asset, hash)
    return { file, url: asset.browser_download_url, sha256: hash }
  })
  if (kind === 'launcher') {
    const manifest = await verifiedJsonAsset(kind, tag, 'runtime-launcher-manifest.json', release.assets, hashes, options)
    const jar = assets[0]
    if (manifest.schemaVersion !== 'foggy-runtime-launcher/v1' || manifest.releaseVersion !== version
      || manifest.runtimeApiProfile !== true || manifest.releaseReady !== true
      || manifest.jar?.file !== jar.file || manifest.jar?.sha256 !== jar.sha256) {
      fail('COMPONENT_MANIFEST_INCOMPATIBLE', 'The selected Launcher does not declare a ready Runtime API launcher with matching artifacts.')
    }
    return { version, minimumJavaVersion: '17.0.0', runtimeApiContract: 'foggy-runtime-api/v1', assets }
  }
  // Older CLI releases do not all have a manifest. When published, verify it too.
  if (release.assets.some((asset) => asset.name === 'release-manifest.json')) {
    const manifest = await verifiedJsonAsset(kind, tag, 'release-manifest.json', release.assets, hashes, options)
    if (manifest.schemaVersion !== 'foggy-runtime-cli-release/v1' || manifest.version !== version) {
      fail('COMPONENT_MANIFEST_INCOMPATIBLE', 'The selected CLI release manifest does not match its version.')
    }
    const wheel = manifest.artifacts?.find((asset) => asset.file === assets[0].file)
    if (!wheel || wheel.sha256 !== assets[0].sha256) fail('COMPONENT_MANIFEST_INCOMPATIBLE', 'The selected CLI manifest does not match its wheel checksum.')
  }
  return { version, minimumPythonVersion: '3.11.0', wheel: assets[0], checksums: assets[1] }
}
