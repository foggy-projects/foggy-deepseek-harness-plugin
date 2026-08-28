import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
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
    }
  }
  const home = process.env.HOME
  if (!home) throw new Error('HOME is not set')
  return {
    installRoot: process.env.XDG_DATA_HOME
      ? join(process.env.XDG_DATA_HOME, 'foggy', 'deepseek-harness')
      : join(home, '.local', 'share', 'foggy', 'deepseek-harness'),
    dataRoot: process.env.XDG_STATE_HOME
      ? join(process.env.XDG_STATE_HOME, 'foggy', 'deepseek-harness')
      : join(home, '.local', 'state', 'foggy', 'deepseek-harness'),
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
  operation = null

  constructor(ctx) {
    super(ctx, 'foggyIntegration')
    for (const initialize of markerInitializers) initialize.call(this)
  }

  async status() {
    const roots = defaultRoots()
    const statePath = join(roots.installRoot, 'install-state.json')
    const runtimeStatePath = join(roots.dataRoot, 'runtime-state.json')
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
    const cliPath = state?.cli?.command
    const launcherPath = state?.launcher?.path
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
        installed: Boolean(state?.skills?.analysis?.path && await exists(state.skills.analysis.path)),
        version: state?.skills?.analysis?.version ?? manifest.components.analysisSkill.version,
      },
    }
    const installed = components.cli.installed && components.launcher.installed && components.analysisSkill.installed
    const running = Boolean(runtime && processRunning(Number(runtime.pid)))
    return {
      success: true,
      packageVersion: manifest.packageVersion,
      state: running ? 'running' : installed ? 'ready' : state ? 'degraded' : 'not-installed',
      installed,
      running,
      runtimeUrl: running ? runtime.runtimeUrl ?? null : null,
      roots,
      projectRoot: process.env.FOGGY_PROJECT_ROOT || process.cwd(),
      components,
      operation: operationView(this.operation),
      next: installed ? (running ? 'configure-database' : 'start-runtime') : 'initialize',
    }
  }

  async plan() {
    const roots = defaultRoots()
    const manifest = await readJson(versionsFile)
    return {
      success: true,
      roots,
      projectRoot: process.env.FOGGY_PROJECT_ROOT || process.cwd(),
      versions: Object.fromEntries(Object.entries(manifest.components).map(([name, value]) => [name, value.version])),
      operations: [
        'create isolated Python environment',
        'download and verify pinned CLI and Launcher assets',
        'install Foggy analysis and onboarding Skills into the workspace',
        'write local install state',
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
    const args = explicitArgs ?? ['install', '--project-root', process.env.FOGGY_PROJECT_ROOT || process.cwd()]
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
      promise: null,
    }
    operation.promise = runOnboarding(args)
      .then((result) => {
        operation.state = result.success === false ? 'failed' : 'succeeded'
        operation.result = result
        operation.finishedAt = new Date().toISOString()
      })
      .catch((error) => {
        operation.state = 'failed'
        operation.error = String(error.message ?? error)
        operation.finishedAt = new Date().toISOString()
      })
    this.operation = operation
    return { success: true, accepted: true, operation: operationView(operation) }
  }
}

const markerInitializers = []
for (const method of ['status', 'plan', 'initialize', 'repair', 'runtimeStart', 'runtimeStop']) {
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
