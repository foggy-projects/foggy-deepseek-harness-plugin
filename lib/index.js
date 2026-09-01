import { execFile } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createFoggySkillProvider } from './skill-provider.js'
import { compatible } from './version.js'

const execFileAsync = promisify(execFile)
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const onboardingScript = join(packageRoot, 'skills', 'foggy-deepseek-onboarding', 'scripts', 'onboarding.py')
const versionsFile = join(packageRoot, 'skills', 'foggy-deepseek-onboarding', 'assets', 'versions.json')

function defaultRoots() {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA
    if (!base) throw new Error('LOCALAPPDATA is not set')
    return {
      installRoot: join(base, 'Foggy', 'DeepSeekHarness'),
      dataRoot: join(base, 'Foggy', 'DeepSeekHarnessData'),
      profileStore: process.env.FOGGY_RUNTIME_PROFILE_STORE || join(base, 'Foggy', 'DeepSeekHarnessData', 'cli-profiles'),
    }
  }
  const home = process.env.HOME
  if (!home) throw new Error('HOME is not set')
  const dataRoot = process.env.XDG_STATE_HOME
    ? join(process.env.XDG_STATE_HOME, 'foggy', 'deepseek-harness')
    : join(home, '.local', 'state', 'foggy', 'deepseek-harness')
  return {
    installRoot: process.env.XDG_DATA_HOME
      ? join(process.env.XDG_DATA_HOME, 'foggy', 'deepseek-harness')
      : join(home, '.local', 'share', 'foggy', 'deepseek-harness'),
    dataRoot,
    profileStore: process.env.FOGGY_RUNTIME_PROFILE_STORE || join(dataRoot, 'cli-profiles'),
  }
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function readOptionalJson(path) {
  try {
    return await readJson(path)
  } catch {
    return null
  }
}

async function commandVersion(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 256 * 1024,
    })
    return { available: true, output: `${stdout}\n${stderr}`.trim().split(/\r?\n/)[0] ?? '' }
  } catch (error) {
    return { available: false, output: '', error: error.code ?? 'COMMAND_FAILED' }
  }
}

async function pythonCommand() {
  const configured = process.env.FOGGY_PYTHON
  const candidates = configured ? [configured] : process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']
  for (const command of candidates) {
    const probe = await commandVersion(command, ['--version'])
    if (probe.available) return command
  }
  throw new Error('Python 3.11+ was not found; set FOGGY_PYTHON to its executable')
}

function parseOutput(stdout, stderr) {
  const text = String(stdout ?? '').trim()
  if (!text) throw new Error(String(stderr ?? '').trim() || 'Foggy onboarding returned no JSON')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Foggy onboarding returned invalid JSON: ${text.slice(0, 240)}`)
  }
}

async function runOnboarding(args, timeout = 15 * 60_000) {
  const python = await pythonCommand()
  try {
    const { stdout, stderr } = await execFileAsync(python, [onboardingScript, ...args], {
      windowsHide: true,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      cwd: process.env.FOGGY_PROJECT_ROOT || process.cwd(),
    })
    return parseOutput(stdout, stderr)
  } catch (error) {
    if (error.stdout) return parseOutput(error.stdout, error.stderr)
    throw error
  }
}

function processRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function operationView(operation) {
  if (!operation) return { state: 'idle' }
  const { promise: _promise, ...view } = operation
  return view
}

export class FoggyIntegrationGateway extends TypertRemoteService {
  static inject = ['skills']

  operation = null
  skillProviderControl = null

  constructor(ctx) {
    super(ctx, 'foggyIntegration')
    const roots = defaultRoots()
    ctx.skills.registerProvider((control) => {
      this.skillProviderControl = control
      return createFoggySkillProvider({ installRoot: roots.installRoot, versionsFile })
    })
    for (const initialize of markerInitializers) initialize.call(this)
  }

  async status() {
    const roots = defaultRoots()
    const statePath = join(roots.installRoot, 'install-state.json')
    const runtimeStatePath = join(roots.dataRoot, 'runtime-state.json')
    const progressPath = join(roots.dataRoot, 'operation-progress.json')
    const manifest = await readJson(versionsFile)
    let pythonProbe
    try {
      pythonProbe = await commandVersion(await pythonCommand(), ['--version'])
    } catch (error) {
      pythonProbe = { available: false, output: '', error: String(error.message ?? error) }
    }
    const python = compatible(pythonProbe, '3.11')
    const java = compatible(await commandVersion(process.env.JAVA_EXE || 'java', ['-version']), '17.0')
    let state = null
    let runtime = null
    try { state = await readJson(statePath) } catch {}
    try { runtime = await readJson(runtimeStatePath) } catch {}
    let onboarding = { success: true, profiles: [], profileCount: 0 }
    let profileMigration = { success: true, entries: [], pendingCount: 0, conflictCount: 0, profileStore: roots.profileStore }
    if (state) {
      try { onboarding = await runOnboarding(['onboard-list']) } catch (error) {
        onboarding = { success: false, profiles: [], profileCount: 0, error: String(error.message ?? error) }
      }
      try { profileMigration = await runOnboarding(['profile-migration-status']) } catch (error) {
        profileMigration = { success: false, entries: [], pendingCount: 0, conflictCount: 0, profileStore: roots.profileStore, error: String(error.message ?? error) }
      }
    }
    const cliPath = state?.cli?.command
    const launcherPath = state?.launcher?.path
    const analysisSkillPath = state?.skills?.analysis?.path || join(roots.installRoot, 'skills', 'foggy-ai-analysis')
    const onboardingSkillPath = join(packageRoot, 'skills', 'foggy-deepseek-onboarding')
    const analysisMarker = await readOptionalJson(join(analysisSkillPath, '.foggy-managed-skill.json'))
    const components = {
      python,
      java,
      cli: {
        installed: Boolean(cliPath && await exists(cliPath)),
        version: state?.cli?.version ?? manifest.components.cli.version,
      },
      launcher: {
        installed: Boolean(launcherPath && await exists(launcherPath)),
        version: state?.launcher?.version ?? manifest.components.launcher.version,
      },
      analysisSkill: {
        installed: Boolean(
          await exists(join(analysisSkillPath, 'SKILL.md'))
          && analysisMarker?.schemaVersion === 'foggy-managed-skill/v1'
          && analysisMarker?.componentVersion === manifest.components.analysisSkill.version
        ),
        version: state?.skills?.analysis?.version ?? manifest.components.analysisSkill.version,
      },
      onboardingSkill: {
        installed: await exists(join(onboardingSkillPath, 'SKILL.md')),
        version: manifest.packageVersion,
        provider: 'foggy-managed-skills',
      },
    }
    const installed = components.cli.installed
      && components.launcher.installed
      && components.analysisSkill.installed
      && components.onboardingSkill.installed
    const running = Boolean(runtime && processRunning(Number(runtime.pid)))
    const progress = await readOptionalJson(progressPath)
    let operation = operationView(this.operation)
    if (operation.state === 'running' && progress?.operationId === operation.id) {
      operation = { ...operation, progress }
    } else if (!this.operation && progress?.state === 'running' && progress.operationId) {
      operation = {
        id: progress.operationId,
        kind: progress.kind || 'initialize',
        state: 'running',
        startedAt: progress.startedAt || null,
        finishedAt: null,
        result: null,
        error: null,
        progress,
      }
    }
    return {
      success: true,
      packageVersion: manifest.packageVersion,
      state: running ? 'running' : installed ? 'ready' : state ? 'degraded' : 'not-installed',
      installed,
      running,
      runtimeUrl: running ? runtime.runtimeUrl ?? null : null,
      roots,
      components,
      operation,
      onboarding,
      profileMigration,
      next: installed ? (running ? 'configure-database' : 'start-runtime') : 'initialize',
    }
  }

  async plan() {
    const roots = defaultRoots()
    const manifest = await readJson(versionsFile)
    return {
      success: true,
      roots,
      workspaceMode: 'dsh-session-cwd',
      versions: Object.fromEntries(Object.entries(manifest.components).map(([name, value]) => [name, value.version])),
      operations: [
        'create isolated Python environment',
        'download and verify pinned CLI and Launcher assets',
        'install the Foggy analysis Skill into the global managed component directory',
        'register onboarding and analysis Skills through the native DSH Skill registry',
        'write global install state; resolve each workspace from the DSH session cwd',
      ],
      secretsInDshSettings: false,
    }
  }

  async initialize() {
    return this.startOperation('initialize', false)
  }

  async repair() {
    return this.startOperation('repair', true)
  }

  async repairCli() {
    return this.startOperation('repair-cli', false, ['install', '--repair-component', 'cli'])
  }

  async repairLauncher() {
    return this.startOperation('repair-launcher', false, ['install', '--repair-component', 'launcher'])
  }

  async repairAnalysisSkill() {
    return this.startOperation('repair-analysis-skill', true, ['install', '--repair-component', 'analysis-skill'])
  }

  async migrateProfiles() {
    return this.startOperation('profile-migration', false, ['profile-migrate', '--approve'])
  }

  async diagnostics() {
    const roots = defaultRoots()
    const [status, doctor] = await Promise.all([
      this.status(),
      runOnboarding(['doctor', '--no-fail']),
    ])
    const report = {
      schemaVersion: 'foggy-deepseek-diagnostics/v1',
      generatedAt: new Date().toISOString(),
      packageVersion: status.packageVersion,
      state: status.state,
      installed: status.installed,
      running: status.running,
      runtimeUrl: status.runtimeUrl,
      roots: status.roots,
      components: status.components,
      onboarding: status.onboarding,
      profileMigration: status.profileMigration,
      doctor,
    }
    const directory = join(roots.dataRoot, 'diagnostics')
    await mkdir(directory, { recursive: true })
    const path = join(directory, `diagnostics-${Date.now()}.json`)
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    return { success: true, path, report }
  }

  async runtimeStart() {
    return this.startOperation('runtime-start', false, ['runtime-start'])
  }

  async runtimeStop() {
    return this.startOperation('runtime-stop', false, ['runtime-stop'])
  }

  startOperation(kind, replaceSkill, explicitArgs) {
    if (this.operation?.state === 'running') {
      return { success: false, accepted: false, operation: operationView(this.operation), error: 'another Foggy operation is running' }
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
    const args = explicitArgs ?? ['install']
    const reportsProgress = args[0] === 'install'
    if (reportsProgress) {
      const roots = defaultRoots()
      args.push('--progress-file', join(roots.dataRoot, 'operation-progress.json'), '--operation-id', id, '--operation-kind', kind)
    }
    if (replaceSkill) args.push('--replace-skill')
    for (const cacheDir of (process.env.FOGGY_ASSET_CACHE_DIRS || '').split(delimiter).filter(Boolean)) {
      args.push('--asset-cache-dir', cacheDir)
    }
    const operation = {
      id,
      kind,
      state: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
      progress: reportsProgress ? {
        schemaVersion: 'foggy-deepseek-onboarding-progress/v1',
        operationId: id,
        kind,
        state: 'running',
        phase: 'preflight',
        message: 'Starting Foggy initialization',
        currentFile: null,
        percent: 0,
        step: { index: 1, total: 6 },
      } : null,
      promise: null,
    }
    operation.promise = runOnboarding(args)
      .then((result) => {
        operation.state = result.success === false ? 'failed' : 'succeeded'
        operation.result = result
        operation.finishedAt = new Date().toISOString()
        this.skillProviderControl?.invalidate()
        if (operation.progress) {
          operation.progress = {
            ...operation.progress,
            state: operation.state,
            phase: operation.state === 'succeeded' ? 'complete' : operation.progress.phase,
            message: operation.state === 'succeeded' ? 'Foggy initialization completed' : 'Foggy initialization failed',
            percent: operation.state === 'succeeded' ? 100 : operation.progress.percent,
          }
        }
      })
      .catch((error) => {
        operation.state = 'failed'
        operation.error = String(error.message ?? error)
        operation.finishedAt = new Date().toISOString()
        this.skillProviderControl?.invalidate()
        if (operation.progress) {
          operation.progress = {
            ...operation.progress,
            state: 'failed',
            message: 'Foggy initialization failed',
          }
        }
      })
    this.operation = operation
    return { success: true, accepted: true, operation: operationView(operation) }
  }
}

const markerInitializers = []
for (const method of [
  'status', 'plan', 'initialize', 'repair', 'repairCli', 'repairLauncher', 'repairAnalysisSkill',
  'migrateProfiles', 'diagnostics', 'runtimeStart', 'runtimeStop',
]) {
  Remote(method)(FoggyIntegrationGateway.prototype[method], {
    kind: 'method',
    name: method,
    static: false,
    private: false,
    access: {
      has: (object) => method in object,
      get: (object) => object[method],
    },
    addInitializer: (initializer) => markerInitializers.push(initializer),
  })
}

export default FoggyIntegrationGateway
