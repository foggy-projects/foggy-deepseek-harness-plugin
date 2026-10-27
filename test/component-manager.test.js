import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { componentVersions, effectiveComponentVersions, prepareComponentVersion, rememberInstalledComponents } from '../lib/component-manager.js'
import { FoggyIntegrationGateway, withAssetCacheArguments } from '../lib/index.js'
import { descriptors } from '../lib/remote-descriptor.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const bundled = JSON.parse(await readFile(new URL('../skills/foggy-deepseek-onboarding/assets/versions.json', import.meta.url), 'utf8'))
const assets = (kind, component) => kind === 'cli' ? [component.wheel, component.checksums] : component.assets
function versionOf(kind, version) {
  return JSON.parse(JSON.stringify(bundled.components[kind]).replaceAll(bundled.components[kind].version, version))
}

async function fixture(t, version = '0.1.24', legacy = false) {
  const root = await mkdtemp(join(tmpdir(), 'foggy-components-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const roots = { installRoot: join(root, 'install'), dataRoot: join(root, 'data') }
  const manifests = { launcher: versionOf('launcher', version), cli: versionOf('cli', version) }
  const state = { installRoot: roots.installRoot, launcher: { version, path: join(roots.installRoot, legacy ? 'launcher' : `launchers/${version}`) }, cli: { version, command: join(roots.installRoot, 'cli', version, 'venv', 'foggy-runtime') }, verifiedAssets: [] }
  if (!legacy) state.componentManifests = manifests
  for (const kind of ['launcher', 'cli']) {
    for (const asset of assets(kind, manifests[kind])) {
      const path = kind === 'launcher' ? join(state.launcher.path, asset.file) : join(roots.installRoot, 'downloads', 'cli', legacy ? '' : version, asset.file)
      await mkdir(join(path, '..'), { recursive: true })
      await writeFile(path, 'fixture download')
      state.verifiedAssets.push({ ...asset, path })
    }
  }
  await mkdir(roots.dataRoot, { recursive: true })
  return { roots, state, manifests }
}

test('saved version choices survive a newer plugin default without changing the bundled manifest', () => {
  const selected = versionOf('launcher', '0.1.24')
  const effective = effectiveComponentVersions(bundled, { componentSelections: { launcher: selected } })
  assert.equal(effective.components.launcher.version, '0.1.24')
  assert.equal(effective.components.cli.version, '0.1.25')
  assert.equal(bundled.components.launcher.version, '0.1.46')
  assert.throws(() => effectiveComponentVersions(bundled, { componentSelections: { cli: { ...bundled.components.cli, wheel: { ...bundled.components.cli.wheel, url: 'https://example.com/cli.whl' } } } }), /URL/)
})

test('selecting CLI preserves the installed Launcher on a legacy installation', async (t) => {
  const { roots, state } = await fixture(t, '0.1.24', true)
  const result = await prepareComponentVersion({ roots, bundled, state, component: 'cli', version: '0.1.25', fetchImpl: () => { throw new Error('network not expected') } })
  assert.equal(result.components.cli.version, '0.1.25')
  assert.equal(result.components.launcher.version, '0.1.24')
  assert.equal(result.componentSelections.launcher.version, '0.1.24')
  assert.equal(state.cli.version, '0.1.24')
})

test('offline catalog retains downloaded versions and permits an explicit rollback without contacting GitHub', async (t) => {
  const { roots, state } = await fixture(t)
  const offline = async () => { throw new Error('offline') }
  const catalog = await componentVersions({ roots, bundled, state, fetchImpl: offline })
  assert.equal(catalog.stale, true)
  assert.match(catalog.error, /Cannot reach/)
  assert.equal(catalog.components.launcher.releases.find((entry) => entry.version === '0.1.24').downloaded, true)
  assert.equal(catalog.components.launcher.bundledVersion, '0.1.46')
  assert.equal(catalog.components.launcher.installedVersion, '0.1.24')
  const selected = await prepareComponentVersion({ roots, bundled, state, component: 'launcher', version: '0.1.24', fetchImpl: offline })
  assert.equal(selected.components.launcher.version, '0.1.24')
  assert.equal(selected.components.cli.version, '0.1.24')
})

test('older installations must update all components before saving individual selections', async (t) => {
  const { roots, state } = await fixture(t, '0.1.23', true)
  await assert.rejects(prepareComponentVersion({ roots, bundled, state, component: 'cli', version: '0.1.25' }), /Update components first/)
  assert.equal(state.cli.version, '0.1.23')
  assert.equal(state.componentSelections, undefined)
})

test('incomplete downloads cannot masquerade as an offline rollback and versions below the supported floor are rejected', async (t) => {
  const { roots, state } = await fixture(t)
  await rememberInstalledComponents(roots, state)
  await rm(state.verifiedAssets[0].path)
  await assert.rejects(prepareComponentVersion({ roots, bundled, state, component: 'launcher', version: '0.1.24', fetchImpl: async () => { throw new Error('offline') } }), /Cannot reach/)
  await assert.rejects(prepareComponentVersion({ roots, bundled, state, component: 'cli', version: '0.1.23' }), /0.1.24 or later/)
  await assert.rejects(prepareComponentVersion({ roots, bundled, state, component: 'cli', version: '../../bad' }), /Invalid component version/)
})

test('history failures remain nonfatal for reading versions but block a switch before modifying state', async (t) => {
  const { roots, state } = await fixture(t)
  await writeFile(join(roots.installRoot, 'component-history'), 'blocked directory')
  const warnings = await rememberInstalledComponents(roots, state)
  assert.equal(warnings.length, 2)
  const result = await componentVersions({ roots, bundled, state, fetchImpl: async () => { throw new Error('offline') } })
  assert.equal(result.components.cli.installedVersion, '0.1.24')
  await assert.rejects(prepareComponentVersion({ roots, bundled, state, component: 'cli', version: '0.1.25' }), /Could not save/)
  assert.equal(state.cli.version, '0.1.24')
})

test('the gateway refuses version changes while the recorded Runtime process is alive', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'foggy-gateway-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const variable = process.platform === 'win32' ? 'LOCALAPPDATA' : 'XDG_STATE_HOME'
  const previous = process.env[variable]
  process.env[variable] = root
  t.after(() => previous === undefined ? delete process.env[variable] : process.env[variable] = previous)
  const dataRoot = process.platform === 'win32' ? join(root, 'Foggy', 'DeepSeekHarnessData') : join(root, 'foggy', 'deepseek-harness')
  await mkdir(dataRoot, { recursive: true })
  await writeFile(join(dataRoot, 'runtime-state.json'), JSON.stringify({ pid: process.pid }))
  const gateway = { startOperation: () => { throw new Error('must not begin an install') } }
  const result = await FoggyIntegrationGateway.prototype.useComponentVersion.call(gateway, { component: 'launcher', version: '0.1.46' })
  assert.equal(result.accepted, false)
  assert.equal(result.error.code, 'RUNTIME_RUNNING_UPDATE_REQUIRES_STOP')
})

test('operation arguments are accepted by the real Python parser with asset caches configured', async () => {
  const execAsync = promisify(execFile)
  const script = fileURLToPath(new URL('../skills/foggy-deepseek-onboarding/scripts/onboarding.py', import.meta.url))
  const parse = 'import importlib.util,json,sys; s=importlib.util.spec_from_file_location("onboarding",sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.build_parser().parse_args(json.loads(sys.argv[2]))'
  for (const command of ['install', 'runtime-start', 'runtime-stop', 'profile-migrate']) {
    const args = withAssetCacheArguments([command], ['/verified-cache'])
    await execAsync(process.platform === 'win32' ? 'python' : 'python3', ['-c', parse, script, JSON.stringify(args)], { windowsHide: true })
  }
})

test('host remote descriptors include the complete settings lifecycle and repair API', () => {
  const methods = new Set(descriptors.map((entry) => entry.method))
  for (const method of ['repairCli', 'repairLauncher', 'repairAnalysisSkill', 'migrateProfiles', 'diagnostics', 'componentVersions', 'checkComponentVersions', 'useComponentVersion']) {
    assert.equal(methods.has(method), true, `${method} must be registered on the host`)
  }
})

test('status retains its entry operation snapshot when completion races with asynchronous probes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'foggy-status-snapshot-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const variables = process.platform === 'win32' ? ['LOCALAPPDATA'] : ['XDG_STATE_HOME', 'XDG_DATA_HOME']
  const previous = Object.fromEntries(variables.map((key) => [key, process.env[key]]))
  for (const key of variables) process.env[key] = root
  t.after(() => {
    for (const key of variables) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]
    }
  })
  const operation = { id: 'status-snapshot-test', state: 'running', progress: null }
  const gateway = { operation }
  const pending = FoggyIntegrationGateway.prototype.status.call(gateway)
  operation.state = 'succeeded'
  assert.equal((await pending).operation.state, 'running', 'an in-flight status must request another poll')
  assert.equal((await FoggyIntegrationGateway.prototype.status.call(gateway)).operation.state, 'succeeded')
})
