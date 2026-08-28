import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { compatible, versionParts } from '../lib/version.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

test('declares a standard DeepSeek Harness bundle and web client', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.version, '0.4.0-beta.2')
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
  assert.match(readme, /@foggy-projects\/deepseek-harness-plugin@beta/)
})

test('ships the pinned onboarding manifest without the Java launcher binary', async () => {
  const versions = JSON.parse(await readFile(join(root, 'skills', 'foggy-deepseek-onboarding', 'assets', 'versions.json'), 'utf8'))
  assert.equal(versions.packageVersion, '0.4.0-beta.2')
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
