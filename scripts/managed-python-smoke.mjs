import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ensurePythonRuntime, probePythonRuntime } from '../lib/python-runtime.js'

const installRoot = process.argv[2] ? resolve(process.argv[2]) : null
if (!installRoot) throw new Error('Usage: node scripts/managed-python-smoke.mjs <empty-test-install-root>')

const manifest = JSON.parse(await readFile(new URL('../skills/foggy-deepseek-onboarding/assets/versions.json', import.meta.url), 'utf8'))
const milestones = new Set()
const installed = await ensurePythonRuntime({
  installRoot,
  manifest,
  force: process.argv.includes('--force'),
  env: {},
  onProgress(progress) {
    const milestone = Math.floor((Number(progress.fraction) || 0) * 4) * 25
    if (!milestones.has(milestone)) {
      milestones.add(milestone)
      process.stderr.write(`[managed-python] ${milestone}% ${progress.message}\n`)
    }
  },
})
const verified = await probePythonRuntime({ installRoot, manifest, env: {} })
process.stdout.write(`${JSON.stringify({
  success: installed.available && verified.available,
  source: verified.source,
  managed: verified.managed,
  version: verified.version,
  path: verified.path,
  asset: verified.asset,
}, null, 2)}\n`)
