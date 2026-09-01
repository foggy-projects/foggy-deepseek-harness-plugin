import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { compatible, versionParts } from '../lib/version.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

test('declares a standard DeepSeek Harness bundle and web client', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.version, '0.4.0-beta.6')
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
  assert.match(readme, /0\.4\.0-beta\.6\.tgz/)
  assert.match(readme, /@foggy-projects\/deepseek-harness-plugin@beta/)
})

test('ships the pinned onboarding manifest without the Java launcher binary', async () => {
  const versions = JSON.parse(await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'assets', 'versions.json'), 'utf8'))
  assert.equal(versions.packageVersion, '0.4.0-beta.6')
  assert.equal(versions.components.cli.version, '0.1.23')
  assert.equal(versions.components.launcher.version, '0.1.18')
  assert.ok(versions.components.launcher.assets.every((asset) => asset.url && asset.sha256))
})

test('pins the publicly published CLI artifacts', async () => {
  const versions = JSON.parse(await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'assets', 'versions.json'), 'utf8'))
  assert.equal(versions.components.cli.wheel.sha256, 'db428812039e5961db93b5c0dc35b53a21d5c349428e6830c96fbf3218cf8a45')
  assert.equal(versions.components.cli.checksums.sha256, '1494d7f13af18bef321995509058a1ab43b1d0b2e9f9ea08230dd78028090221')
})

test('ships a Linux experience entry that enforces native filesystem prerequisites', async () => {
  const script = await readFile(join(root, 'experience', 'linux', 'prepare.sh'), 'utf8')
  assert.match(script, /Node 22\.19\+/)
  assert.match(script, /Python 3\.11\+/)
  assert.match(script, /Java 17\+/)
  assert.match(script, /\/mnt\//)
  assert.match(script, /@deepseek-ai\/dsh@/)
})

test('rejects Java versions below the Launcher minimum', () => {
  assert.deepEqual(versionParts('java version "12.0.2"'), [12, 0, 2])
  assert.equal(compatible({ available: true, output: 'java version "12.0.2"' }, '17.0').available, false)
  assert.equal(compatible({ available: true, output: 'openjdk version "17.0.12"' }, '17.0').available, true)
})

test('exposes persistent initialization progress to the gateway and web client', async () => {
  const gateway = await readFile(join(root, 'lib', 'index.js'), 'utf8')
  const client = await readFile(join(root, 'lib', 'client.js'), 'utf8')
  const onboarding = await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'scripts', 'onboarding.py'), 'utf8')
  assert.match(gateway, /operation-progress\.json/)
  assert.match(gateway, /--progress-file/)
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
