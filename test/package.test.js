import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { compatible, compatibleNode, versionParts } from '../lib/version.js'
import { ensurePythonRuntime, managedPythonExecutable, probePythonRuntime, pythonAssetKey, selectPythonAsset } from '../lib/python-runtime.js'
import { writeJsonAtomic } from '../lib/atomic-json.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

test('declares a standard DeepSeek Harness bundle and web client', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.version, '0.4.0-beta.9')
  assert.equal(pkg.engines.node, '^22.19.0 || >=24.0.0')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.equal(pkg.exports['./typert'], './lib/typert.js')
})

test('bundle patch mounts the dual-face Foggy package', async () => {
  const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id: foggy-data-analysis/)
  assert.match(patch, /@foggy-projects\/deepseek-harness-plugin/)
})

test('documents the pnpm workspace-root install required by DSH rc.2', async () => {
  const readme = await readFile(join(root, 'README.md'), 'utf8')
  assert.match(readme, /dsh plugin --profile web add --workspace-root/)
  assert.match(readme, /0\.4\.0-beta\.9\.tgz/)
  assert.match(readme, /@foggy-projects\/deepseek-harness-plugin@beta/)
})

test('ships the pinned onboarding manifest without the Java launcher binary', async () => {
  const versions = JSON.parse(await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'assets', 'versions.json'), 'utf8'))
  assert.equal(versions.packageVersion, '0.4.0-beta.9')
  assert.equal(versions.components.python.version, '3.12.13')
  assert.equal(versions.components.cli.version, '0.1.23')
  assert.equal(versions.components.launcher.version, '0.1.18')
  assert.ok(versions.components.launcher.assets.every((asset) => asset.url && asset.sha256))
})

test('pins private Python distributions for supported desktop platforms', async () => {
  const versions = JSON.parse(await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'assets', 'versions.json'), 'utf8'))
  assert.equal(pythonAssetKey('win32', 'x64'), 'win32-x64')
  assert.match(managedPythonExecutable('C:\\Foggy', versions, 'win32'), /python\.exe$/)
  assert.match(managedPythonExecutable('/tmp/foggy', versions, 'linux'), /bin[\\/]python3$/)
  for (const key of ['win32-x64', 'win32-arm64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64']) {
    const asset = selectPythonAsset(versions, ...key.split('-').reduce((parts, value, index) => {
      if (index === 0) return [value]
      parts.push(value)
      return parts
    }, []))
    assert.match(asset.sha256, /^[a-f0-9]{64}$/)
    assert.ok(asset.size > 20_000_000)
  }
})

test('does not silently fall back to a system executable for private Python', async () => {
  const versions = JSON.parse(await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'assets', 'versions.json'), 'utf8'))
  const installRoot = await mkdtemp(join(tmpdir(), 'foggy-python-probe-'))
  try {
    const missing = await probePythonRuntime({ installRoot, manifest: versions, env: {} })
    assert.equal(missing.available, false)
    assert.equal(missing.source, 'managed')
    const notPython = await probePythonRuntime({ installRoot, manifest: versions, env: { FOGGY_PYTHON: process.execPath } })
    assert.equal(notPython.available, false)
    assert.match(notPython.error, /not Python/)
  } finally {
    await rm(installRoot, { recursive: true, force: true })
  }
})

test('rejects and removes a downloaded Python archive with the wrong SHA256', async () => {
  const versions = JSON.parse(await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'assets', 'versions.json'), 'utf8'))
  const installRoot = await mkdtemp(join(tmpdir(), 'foggy-python-corrupt-'))
  const server = createServer((_request, response) => {
    const body = Buffer.from('not-a-python-runtime')
    response.writeHead(200, { 'content-length': body.length })
    response.end(body)
  })
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
  try {
    const address = server.address()
    const key = pythonAssetKey()
    versions.components.python.assets[key] = {
      file: 'corrupt-python.tar.gz',
      url: `http://127.0.0.1:${address.port}/corrupt-python.tar.gz`,
      sha256: '0'.repeat(64),
      size: 20,
    }
    await assert.rejects(
      ensurePythonRuntime({ installRoot, manifest: versions, env: {} }),
      /SHA256 mismatch/,
    )
    await assert.rejects(access(join(installRoot, 'downloads', 'python', 'corrupt-python.tar.gz.download')))
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise))
    await rm(installRoot, { recursive: true, force: true })
  }
})

test('resumes an interrupted managed Python download before verification', async () => {
  const versions = JSON.parse(await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'assets', 'versions.json'), 'utf8'))
  const installRoot = await mkdtemp(join(tmpdir(), 'foggy-python-resume-'))
  const body = Buffer.from('complete-but-not-a-real-tar-archive')
  let requestCount = 0
  let resumedRange = null
  const server = createServer((request, response) => {
    requestCount += 1
    if (requestCount === 1) {
      response.writeHead(200, { 'content-length': body.length })
      response.write(body.subarray(0, 8))
      setTimeout(() => response.destroy(), 10)
      return
    }
    resumedRange = request.headers.range
    const start = Number(String(resumedRange).match(/bytes=(\d+)-/)?.[1] || 0)
    response.writeHead(206, {
      'content-length': body.length - start,
      'content-range': `bytes ${start}-${body.length - 1}/${body.length}`,
    })
    response.end(body.subarray(start))
  })
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
  try {
    const address = server.address()
    const key = pythonAssetKey()
    const file = 'resumable-python.tar.gz'
    versions.components.python.assets[key] = {
      file,
      url: `http://127.0.0.1:${address.port}/${file}`,
      sha256: createHash('sha256').update(body).digest('hex'),
      size: body.length,
    }
    await assert.rejects(ensurePythonRuntime({ installRoot, manifest: versions, env: {} }))
    const partial = join(installRoot, 'downloads', 'python', `${file}.download`)
    const partialSize = (await stat(partial)).size
    assert.ok(partialSize > 0 && partialSize < body.length)
    await assert.rejects(ensurePythonRuntime({ installRoot, manifest: versions, env: {} }))
    assert.equal(resumedRange, `bytes=${partialSize}-`)
    assert.deepEqual(await readFile(join(installRoot, 'downloads', 'python', file)), body)
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise))
    await rm(installRoot, { recursive: true, force: true })
  }
})

test('retries transient atomic JSON replacement failures without leaving temp files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'foggy-atomic-json-retry-'))
  const target = join(directory, 'operation-progress.json')
  let attempts = 0
  try {
    await writeFile(target, '{"old":true}')
    await writeJsonAtomic(target, { success: true }, {
      replace: async (source, destination) => {
        attempts += 1
        if (attempts < 4) throw Object.assign(new Error('temporarily locked'), { code: 'EPERM' })
        await rename(source, destination)
      },
      sleep: async () => {},
    })
    assert.equal(attempts, 4)
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), { success: true })
    assert.deepEqual(await readdir(directory), ['operation-progress.json'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('preserves the previous JSON when a replacement remains locked', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'foggy-atomic-json-locked-'))
  const target = join(directory, 'operation-progress.json')
  try {
    await writeFile(target, '{"old":true}')
    await assert.rejects(
      writeJsonAtomic(target, { success: true }, {
        attempts: 3,
        replace: async () => { throw Object.assign(new Error('locked'), { code: 'EPERM' }) },
        sleep: async () => {},
      }),
      /locked/,
    )
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), { old: true })
    assert.deepEqual(await readdir(directory), ['operation-progress.json'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('pins the publicly published CLI artifacts', async () => {
  const versions = JSON.parse(await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'assets', 'versions.json'), 'utf8'))
  assert.equal(versions.components.cli.wheel.sha256, 'db428812039e5961db93b5c0dc35b53a21d5c349428e6830c96fbf3218cf8a45')
  assert.equal(versions.components.cli.checksums.sha256, '1494d7f13af18bef321995509058a1ab43b1d0b2e9f9ea08230dd78028090221')
})

test('ships a Linux experience entry with private Python and native filesystem prerequisites', async () => {
  const script = await readFile(join(root, 'experience', 'linux', 'prepare.sh'), 'utf8')
  assert.match(script, /Node \^22\.19\.0 or >=24/)
  assert.doesNotMatch(script, /require_command python3/)
  assert.match(script, /private managed 3\.12\.13/)
  assert.match(script, /Java 17\+/)
  assert.match(script, /\/mnt\//)
  assert.match(script, /@deepseek-ai\/dsh@/)
})

test('rejects Java versions below the Launcher minimum', () => {
  assert.deepEqual(versionParts('java version "12.0.2"'), [12, 0, 2])
  assert.equal(compatible({ available: true, output: 'java version "12.0.2"' }, '17.0').available, false)
  assert.equal(compatible({ available: true, output: 'openjdk version "17.0.12"' }, '17.0').available, true)
})

test('accepts only the DeepSeek Harness Node engine lines', () => {
  assert.equal(compatibleNode('22.18.0'), false)
  assert.equal(compatibleNode('22.19.0'), true)
  assert.equal(compatibleNode('22.22.0'), true)
  assert.equal(compatibleNode('23.1.0'), false)
  assert.equal(compatibleNode('24.0.0'), true)
  assert.equal(compatibleNode('26.0.0'), true)
})

test('exposes persistent initialization progress to the gateway and web client', async () => {
  const gateway = await readFile(join(root, 'lib', 'index.js'), 'utf8')
  const client = await readFile(join(root, 'lib', 'client.js'), 'utf8')
  const onboarding = await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'scripts', 'onboarding.py'), 'utf8')
  assert.match(gateway, /operation-progress\.json/)
  assert.match(gateway, /--progress-file/)
  assert.match(gateway, /progress\?\.operationId === operation\.id/)
  assert.match(client, /role: 'progressbar'/)
  assert.match(client, /foggy-progress-fill/)
  assert.match(onboarding, /PROGRESS_SCHEMA = "foggy-deepseek-onboarding-progress\/v1"/)
  assert.match(onboarding, /--progress-file/)
})

test('registers Skills natively and keeps managed analysis assets global', async () => {
  const gateway = await readFile(join(root, 'lib', 'index.js'), 'utf8')
  const provider = await readFile(join(root, 'lib', 'skill-provider.js'), 'utf8')
  const client = await readFile(join(root, 'lib', 'client.js'), 'utf8')
  const onboarding = await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'scripts', 'onboarding.py'), 'utf8')
  const skill = await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'SKILL.md'), 'utf8')
  assert.match(gateway, /static inject = \['skills'\]/)
  assert.match(gateway, /registerProvider/)
  assert.match(gateway, /onboardingSkill/)
  assert.match(provider, /BUNDLED_SKILL_RANK/)
  assert.match(provider, /foggy-managed-skills/)
  assert.match(provider, /foggy-ai-analysis/)
  assert.match(client, /skillRegistry/)
  assert.match(client, /status\.state !== 'not-installed'/)
  assert.match(onboarding, /MANAGED_SKILL_SCHEMA = "foggy-managed-skill\/v1"/)
  assert.match(onboarding, /install_root \/ "skills"/)
  assert.doesNotMatch(onboarding, /install_onboarding_skill/)
  assert.match(skill, /native Skill registry/)
  assert.match(skill, /absence of `foggy-runtime` from\s+`PATH` is not evidence/)
  assert.match(skill, /current DSH session workspace as the authoritative `projectRoot`/)
  assert.match(skill, /do not remove a successfully\s+published bundle/)
})

test('exposes public-beta recovery, diagnostics, and onboarding progress controls', async () => {
  const gateway = await readFile(join(root, 'lib', 'index.js'), 'utf8')
  const client = await readFile(join(root, 'lib', 'client.js'), 'utf8')
  const onboarding = await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'scripts', 'onboarding.py'), 'utf8')
  const remoteDescriptor = await readFile(join(root, 'lib', 'remote-descriptor.js'), 'utf8')
  assert.match(gateway, /repairPython/)
  assert.match(gateway, /repairCli/)
  assert.match(gateway, /migrateProfiles/)
  assert.match(gateway, /foggy-deepseek-diagnostics\/v1/)
  assert.match(client, /onboardingPanel/)
  assert.match(client, /profileMigrationPending/)
  assert.match(onboarding, /profile-migration-status/)
  assert.match(onboarding, /already-running-verified/)
  assert.match(onboarding, /workspaceBindings/)
  assert.match(remoteDescriptor, /descriptor\('repairPython'\)/)
})
