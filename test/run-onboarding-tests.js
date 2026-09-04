import { spawnSync } from 'node:child_process'

const candidates = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']

for (const command of candidates) {
  const result = spawnSync(command, ['test/onboarding_unit.py'], { stdio: 'inherit' })
  if (result.error?.code === 'ENOENT') continue
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

throw new Error(`Python is required to run onboarding tests; tried: ${candidates.join(', ')}`)
