import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  checkComponentReleases,
  compareReleaseVersions,
  componentReleaseCachePath,
  readComponentReleaseCache,
  resolveComponentRelease,
  validateComponentRelease,
} from '../lib/component-releases.js'

const NOW = Date.parse('2026-10-27T04:00:00.000Z')
const now = () => NOW
const hash = (value) => createHash('sha256').update(value).digest('hex')

function fixture(kind = 'launcher', version = '0.1.46', overrides = {}) {
  const repo = kind === 'launcher' ? 'foggy-projects/foggy-data-mcp-bridge' : 'foggy-projects/foggy-runtime-cli'
  const tag = kind === 'launcher' ? `foggy-runtime-launcher-v${version}` : `v${version}`
  const base = `https://github.com/${repo}/releases/download/${tag}`
  const mainFile = kind === 'launcher' ? `foggy-runtime-launcher-${version}.jar` : `foggy_runtime_cli-${version}-py3-none-any.whl`
  const mainHash = hash('main artifact')
  const files = kind === 'launcher'
    ? [mainFile, 'start-foggy-runtime.ps1', 'start-foggy-runtime.sh', 'README-foggy-runtime-launcher.md', 'runtime-launcher-manifest.json']
    : [mainFile, 'release-manifest.json']
  const manifest = kind === 'launcher'
    ? { schemaVersion: 'foggy-runtime-launcher/v1', releaseVersion: version, runtimeApiProfile: true, releaseReady: true, jar: { file: mainFile, sha256: mainHash } }
    : { schemaVersion: 'foggy-runtime-cli-release/v1', version, artifacts: [{ file: mainFile, sha256: mainHash }] }
  const contents = Object.fromEntries(files.map((file) => [file, file === mainFile ? 'main artifact' : file.endsWith('.json') ? JSON.stringify(manifest) : `content of ${file}`]))
  const sums = files.map((file) => `${hash(contents[file])}  ${file}`).join('\n') + '\n'
  contents.SHA256SUMS = sums
  const release = {
    tag_name: tag,
    html_url: `https://github.com/${repo}/releases/tag/${tag}`,
    published_at: '2026-10-26T04:15:00Z',
    draft: false,
    prerelease: false,
    assets: Object.entries(contents).map(([name, text]) => ({ name, browser_download_url: `${base}/${name}`, digest: `sha256:${hash(text)}` })),
    ...overrides,
  }
  const urls = Object.fromEntries(Object.entries(contents).map(([name, text]) => [`${base}/${name}`, text]))
  urls[`https://api.github.com/repos/${repo}/releases/tags/${tag}`] = release
  return { release, urls, sums, contents, manifest, repo, tag, base, mainFile }
}

function fetchRoutes(routes, calls = []) {
  return async (url, options) => {
    calls.push({ url, options })
    if (!(url in routes)) throw new Error(`Unexpected request: ${url}`)
    const value = routes[url]
    if (value instanceof Error) throw value
    if (value instanceof Response) return value
    return new Response(typeof value === 'string' ? value : JSON.stringify(value), { status: 200 })
  }
}

async function dataRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'foggy-component-release-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('discovers official releases, semver sorts, labels prereleases and excludes drafts', async (t) => {
  const root = await dataRoot(t)
  const older = fixture('launcher', '0.1.9')
  const current = fixture('launcher', '0.1.46', { prerelease: true })
  const incomplete = fixture('launcher', '0.1.47', { assets: [] })
  const cli = fixture('cli', '0.1.25')
  const calls = []
  const routes = {
    [`https://api.github.com/repos/${older.repo}/releases?per_page=30&page=1`]: [
      older.release, current.release, incomplete.release,
      { ...fixture('launcher', '0.1.48').release, draft: true },
      { ...fixture('launcher', '0.1.49').release, html_url: 'https://example.com/release' },
      { tag_name: 'other-v9.9.9' },
    ],
    [`https://api.github.com/repos/${cli.repo}/releases?per_page=30&page=1`]: [cli.release],
  }
  const result = await checkComponentReleases({ dataRoot: root, fetchImpl: fetchRoutes(routes, calls), now })
  assert.equal(result.stale, false)
  assert.equal(result.checkedAt, new Date(NOW).toISOString())
  assert.equal(result.components.launcher.latestVersion, '0.1.47')
  assert.equal(result.components.launcher.latestStableVersion, '0.1.47')
  assert.deepEqual(result.components.launcher.releases.map((release) => release.version), ['0.1.47', '0.1.46', '0.1.9'])
  assert.equal(result.components.launcher.releases[0].installable, false)
  assert.match(result.components.launcher.releases[0].unavailableReason, /requires exactly one/)
  assert.equal(result.components.launcher.releases[1].prerelease, true)
  assert.equal(result.components.cli.latestVersion, '0.1.25')
  assert.equal(calls.length, 2)
  assert.ok(calls.every((call) => call.options.redirect === 'error' && call.options.signal && !call.options.headers.Authorization))
  const cached = await readComponentReleaseCache(root, { now })
  assert.equal(cached.components.cli.latestVersion, '0.1.25')
  assert.equal(JSON.parse(await readFile(componentReleaseCachePath(root), 'utf8')).schemaVersion, 'foggy-component-releases/v1')
  const again = await checkComponentReleases({ dataRoot: root, fetchImpl: async () => assert.fail('fresh cache should not fetch'), now })
  assert.equal(again.components.launcher.latestVersion, '0.1.47')
})

test('checks pagination with a fixed upper bound and ignores untrusted asset URLs', async (t) => {
  const root = await dataRoot(t)
  const cli = fixture('cli', '0.1.25')
  const launcher = fixture('launcher', '0.1.46')
  launcher.release.assets[0].browser_download_url = 'https://evil.example/file.jar'
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url.includes('foggy-runtime-cli')) return new Response(JSON.stringify([cli.release]))
    const page = Number(new URL(url).searchParams.get('page'))
    return new Response(JSON.stringify(page === 2 ? [launcher.release, ...Array.from({ length: 29 }, () => ({ tag_name: 'other' }))] : Array.from({ length: 30 }, () => ({ tag_name: 'other' }))))
  }
  const result = await checkComponentReleases({ dataRoot: root, fetchImpl, now })
  assert.equal(calls.length, 4)
  assert.equal(result.components.launcher.releases[0].installable, false)
  assert.match(result.components.launcher.releases[0].unavailableReason, /official download URL/)
})

test('offline checks keep cached releases, retry later and allow an explicit retry', async (t) => {
  const root = await dataRoot(t)
  const launcher = fixture()
  const cli = fixture('cli', '0.1.25')
  const routes = {
    [`https://api.github.com/repos/${launcher.repo}/releases?per_page=30&page=1`]: [launcher.release],
    [`https://api.github.com/repos/${cli.repo}/releases?per_page=30&page=1`]: [cli.release],
  }
  await checkComponentReleases({ dataRoot: root, fetchImpl: fetchRoutes(routes), now })
  const later = () => NOW + 7 * 60 * 60_000
  let requests = 0
  const offline = async () => { requests += 1; throw new Error('connection failed') }
  const result = await checkComponentReleases({ dataRoot: root, fetchImpl: offline, now: later })
  assert.equal(result.stale, true)
  assert.equal(result.components.launcher.latestVersion, '0.1.46')
  assert.match(result.error, /Cannot reach/)
  await checkComponentReleases({ dataRoot: root, fetchImpl: offline, now: later })
  assert.equal(requests, 2)
  await checkComponentReleases({ dataRoot: root, fetchImpl: offline, now: later, force: true })
  assert.equal(requests, 4)
})

test('failed initial checks and rate limits are nonfatal catalog errors', async (t) => {
  const root = await dataRoot(t)
  const result = await checkComponentReleases({ dataRoot: root, fetchImpl: async () => new Response('{}', { status: 403 }), now })
  assert.equal(result.stale, true)
  assert.equal(result.checkedAt, null)
  assert.equal(result.components.launcher.latestVersion, null)
  assert.match(result.error, /rate limited/)
})

test('resolves official launcher and CLI to verified component receipts', async () => {
  const launcher = fixture()
  const calls = []
  const component = await resolveComponentRelease('launcher', '0.1.46', { fetchImpl: fetchRoutes(launcher.urls, calls) })
  assert.equal(component.version, '0.1.46')
  assert.equal(component.runtimeApiContract, 'foggy-runtime-api/v1')
  assert.equal(component.assets.length, 6)
  assert.equal(component.assets[0].sha256, hash('main artifact'))
  assert.equal(component.assets[5].sha256, hash(launcher.sums))
  assert.deepEqual(validateComponentRelease('launcher', component), component)
  assert.equal(calls.length, 3)
  const cli = fixture('cli', '0.1.25')
  const cliComponent = await resolveComponentRelease('cli', '0.1.25', { fetchImpl: fetchRoutes(cli.urls) })
  assert.equal(cliComponent.wheel.file, 'foggy_runtime_cli-0.1.25-py3-none-any.whl')
  assert.deepEqual(validateComponentRelease('cli', cliComponent), cliComponent)
})

test('rejects arbitrary versions, repository redirects and missing checksums', async () => {
  await assert.rejects(resolveComponentRelease('launcher', '../../other'), { code: 'COMPONENT_VERSION_INVALID' })
  await assert.rejects(resolveComponentRelease('python', '0.1.46'), { code: 'COMPONENT_KIND_INVALID' })
  const launcher = fixture()
  launcher.release.assets[0].browser_download_url = 'https://github.com/other/repo/file.jar'
  await assert.rejects(resolveComponentRelease('launcher', '0.1.46', { fetchImpl: fetchRoutes(launcher.urls) }), { code: 'COMPONENT_RELEASE_INCOMPLETE' })
  const cli = fixture('cli', '0.1.25')
  cli.release.assets = cli.release.assets.filter((asset) => asset.name !== 'SHA256SUMS')
  await assert.rejects(resolveComponentRelease('cli', '0.1.25', { fetchImpl: fetchRoutes(cli.urls) }), { code: 'COMPONENT_RELEASE_INCOMPLETE' })
})

test('rejects missing hash coverage and conflicts between checksums and GitHub digest', async () => {
  const launcher = fixture()
  launcher.release.assets.find((asset) => asset.name === 'SHA256SUMS').digest = null
  launcher.urls[`${launcher.base}/SHA256SUMS`] = launcher.sums.split('\n').filter((line) => !line.endsWith('start-foggy-runtime.sh')).join('\n')
  await assert.rejects(resolveComponentRelease('launcher', '0.1.46', { fetchImpl: fetchRoutes(launcher.urls) }), { code: 'COMPONENT_CHECKSUM_MISSING' })
  const conflict = fixture()
  conflict.release.assets[0].digest = `sha256:${'0'.repeat(64)}`
  await assert.rejects(resolveComponentRelease('launcher', '0.1.46', { fetchImpl: fetchRoutes(conflict.urls) }), { code: 'COMPONENT_CHECKSUM_MISMATCH' })
})

test('verifies checksum file and downloaded manifest bytes before creating a receipt', async () => {
  const checksum = fixture()
  checksum.urls[`${checksum.base}/SHA256SUMS`] += '\n'
  await assert.rejects(resolveComponentRelease('launcher', '0.1.46', { fetchImpl: fetchRoutes(checksum.urls) }), { code: 'COMPONENT_CHECKSUM_MISMATCH' })
  const manifest = fixture()
  manifest.urls[`${manifest.base}/runtime-launcher-manifest.json`] = '{}'
  await assert.rejects(resolveComponentRelease('launcher', '0.1.46', { fetchImpl: fetchRoutes(manifest.urls) }), { code: 'COMPONENT_CHECKSUM_MISMATCH' })
  const readiness = fixture('launcher', '0.1.46')
  const text = JSON.stringify({ ...readiness.manifest, releaseReady: false })
  const oldHash = hash(readiness.contents['runtime-launcher-manifest.json'])
  readiness.urls[`${readiness.base}/runtime-launcher-manifest.json`] = text
  readiness.urls[`${readiness.base}/SHA256SUMS`] = readiness.sums.replace(oldHash, hash(text))
  readiness.release.assets.find((asset) => asset.name === 'runtime-launcher-manifest.json').digest = `sha256:${hash(text)}`
  readiness.release.assets.find((asset) => asset.name === 'SHA256SUMS').digest = `sha256:${hash(readiness.urls[`${readiness.base}/SHA256SUMS`])}`
  await assert.rejects(resolveComponentRelease('launcher', '0.1.46', { fetchImpl: fetchRoutes(readiness.urls) }), { code: 'COMPONENT_MANIFEST_INCOMPATIBLE' })
})

test('validates offline receipts against exact official assets and rejects path/hash tampering', async () => {
  const launcher = fixture()
  const component = await resolveComponentRelease('launcher', '0.1.46', { fetchImpl: fetchRoutes(launcher.urls) })
  assert.throws(() => validateComponentRelease('launcher', { ...component, assets: [...component.assets, component.assets[0]] }), { code: 'COMPONENT_ASSET_MISSING' })
  assert.throws(() => validateComponentRelease('launcher', { ...component, assets: component.assets.map((asset, index) => index ? asset : { ...asset, url: asset.url + '?other=1' }) }), { code: 'COMPONENT_ASSET_UNTRUSTED' })
  assert.throws(() => validateComponentRelease('launcher', { ...component, assets: component.assets.map((asset, index) => index ? asset : { ...asset, sha256: 'invalid' }) }), { code: 'COMPONENT_ASSET_UNTRUSTED' })
  assert.throws(() => validateComponentRelease('launcher', { ...component, runtimeApiContract: 'v2' }), { code: 'COMPONENT_MANIFEST_INCOMPATIBLE' })
})

test('uses numeric and prerelease ordering for component versions', () => {
  assert.equal(compareReleaseVersions('0.1.46', '0.1.9'), 1)
  assert.equal(compareReleaseVersions('0.1.46', '0.1.46-rc.2'), 1)
  assert.equal(compareReleaseVersions('0.1.46-rc.10', '0.1.46-rc.2'), 1)
  assert.equal(compareReleaseVersions('0.1.46-alpha.1', '0.1.46-rc.1'), -1)
  assert.equal(compareReleaseVersions('0.1.46', '0.1.46'), 0)
})

if (process.env.FOGGY_COMPONENT_RELEASE_LIVE_TEST === '1') {
  test('live official releases resolve published Launcher and CLI and discover their catalogs', async (t) => {
    const root = await dataRoot(t)
    const [launcher, cli] = await Promise.all([
      resolveComponentRelease('launcher', '0.1.46'),
      resolveComponentRelease('cli', '0.1.25'),
    ])
    assert.equal(launcher.assets[0].sha256, 'f85e56115621cd73ac554e963b00fa46f4ebb30b9b4f5f7de9f56307f1d13ce8')
    assert.equal(cli.wheel.sha256, '162a0b50d2035132bf679b262fcf5f33ba7b50a462bda28a7def7705323ee0ac')
    const catalog = await checkComponentReleases({ dataRoot: root })
    assert.equal(catalog.error, null)
    assert.ok(compareReleaseVersions(catalog.components.launcher.latestVersion, '0.1.46') >= 0)
    assert.ok(compareReleaseVersions(catalog.components.cli.latestVersion, '0.1.25') >= 0)
  })
}
