import { execFile } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createFoggySkillProvider } from './skill-provider.js'
import { writeJsonAtomic } from './atomic-json.js'
import { ensurePythonRuntime, probePythonRuntime } from './python-runtime.js'
import { compatible, compatibleNode } from './version.js'
import { enrichRuntimeStartFailure } from './diagnostics.js'
import {
  DEFAULT_RUNTIME_PORT,
  readRuntimeSettings,
  writeRuntimeSettings,
} from './runtime-settings.js'

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

function componentReleaseState({ installed, installedVersion, targetVersion }) {
  const normalizedInstalled = installedVersion || null
  const normalizedTarget = targetVersion || null
  const updateAvailable = Boolean(installed && normalizedInstalled && normalizedTarget && normalizedInstalled !== normalizedTarget)
  return {
    installed: Boolean(installed && !updateAvailable),
    installedVersion: normalizedInstalled,
    targetVersion: normalizedTarget,
    updateAvailable,
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

async function runtimeRunningUpdateGuard() {
  const roots = defaultRoots()
  const runtime = await readOptionalJson(join(roots.dataRoot, 'runtime-state.json'))
  if (runtime && processRunning(Number(runtime.pid))) {
    return {
      success: false,
      accepted: false,
      error: {
        code: 'RUNTIME_RUNNING_UPDATE_REQUIRES_STOP',
        message: 'Stop Foggy Runtime before updating or repairing managed components.',
      },
    }
  }
  return null
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

function parseOutput(stdout, stderr) {
  const text = String(stdout ?? '').trim()
  if (!text) throw new Error(String(stderr ?? '').trim() || 'Foggy onboarding returned no JSON')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Foggy onboarding returned invalid JSON: ${text.slice(0, 240)}`)
  }
}

async function runOnboarding(args, timeout = 15 * 60_000, options = {}) {
  const roots = defaultRoots()
  const manifest = await readJson(versionsFile)
  const cacheDirs = (process.env.FOGGY_ASSET_CACHE_DIRS || '').split(delimiter).filter(Boolean)
  const python = options.ensurePython
    ? await ensurePythonRuntime({
        installRoot: roots.installRoot,
        manifest,
        cacheDirs,
        force: options.forcePython,
        onProgress: options.onPythonProgress,
      })
    : await probePythonRuntime({ installRoot: roots.installRoot, manifest })
  if (!python.available) {
    throw new Error('Foggy managed Python is unavailable; initialize or repair the Python component')
  }
  await options.flushPythonProgress?.()
  try {
    const { stdout, stderr } = await execFileAsync(python.path, [onboardingScript, ...args], {
      windowsHide: true,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      cwd: process.env.FOGGY_PROJECT_ROOT || process.cwd(),
      env: {
        ...process.env,
        FOGGY_ONBOARDING_PYTHON: python.path,
        FOGGY_ONBOARDING_PYTHON_SOURCE: python.source,
      },
    })
    return parseOutput(stdout, stderr)
  } catch (error) {
    if (error.stdout) return parseOutput(error.stdout, error.stderr)
    throw error
  }
}

async function assertSystemPrerequisites(kind) {
  if (kind === 'initialize' && !compatibleNode(process.versions.node)) {
    throw new Error(`DeepSeek Harness requires Node.js ^22.19.0 or >=24.0.0; detected ${process.versions.node}`)
  }
  if (kind === 'initialize' || kind === 'runtime-start') {
    const java = compatible(await commandVersion(process.env.JAVA_EXE || 'java', ['-version']), '17.0')
    if (!java.available) throw new Error('Java 17+ is required; install a system JRE/JDK or set JAVA_EXE')
  }
}

function createPythonProgressReporter(operation, path) {
  let pending = Promise.resolve()
  const runtimeStart = operation.kind === 'runtime-start'
  const totalSteps = runtimeStart ? 6 : 7
  return {
    update(detail) {
      const fraction = Math.max(0, Math.min(1, Number(detail.fraction) || 0))
      const payload = {
        schemaVersion: 'foggy-deepseek-onboarding-progress/v1',
        operationId: operation.id,
        kind: operation.kind,
        state: 'running',
        phase: runtimeStart ? 'runtime-preflight' : 'python',
        message: runtimeStart ? 'Preparing the Foggy Runtime controller' : detail.message || 'Preparing managed Python',
        currentFile: detail.currentFile || null,
        percent: runtimeStart ? Math.round(fraction * 3) : Math.round(((1 + fraction) / totalSteps) * 100),
        step: { index: runtimeStart ? 1 : 2, total: totalSteps },
        startedAt: operation.startedAt,
        updatedAt: new Date().toISOString(),
      }
      if (detail.bytes) payload.bytes = detail.bytes
      operation.progress = payload
      pending = pending.then(() => writeJsonAtomic(path, payload))
    },
    flush() {
      return pending
    },
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
    const portConflictPath = join(roots.dataRoot, 'last-runtime-port-conflict.json')
    const manifest = await readJson(versionsFile)
    const runtimeSettings = await readRuntimeSettings(roots.dataRoot, {
      defaultPort: manifest.defaults?.port ?? DEFAULT_RUNTIME_PORT,
    })
    const python = await probePythonRuntime({ installRoot: roots.installRoot, manifest })
    const java = compatible(await commandVersion(process.env.JAVA_EXE || 'java', ['-version']), '17.0')
    let state = null
    let runtime = null
    let lastRuntimePortConflict = null
    try { state = await readJson(statePath) } catch {}
    try { runtime = await readJson(runtimeStatePath) } catch {}
    try { lastRuntimePortConflict = await readJson(portConflictPath) } catch {}
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
    const semanticQuerySkillPath = state?.skills?.semanticQuery?.path || join(roots.installRoot, 'skills', 'foggy-semantic-query')
    const onboardingSkillPath = join(packageRoot, 'skills', 'foggy-deepseek-onboarding')
    const analysisMarker = await readOptionalJson(join(analysisSkillPath, '.foggy-managed-skill.json'))
    const semanticQueryMarker = await readOptionalJson(join(semanticQuerySkillPath, '.foggy-managed-skill.json'))
    const cliPresent = Boolean(cliPath && await exists(cliPath))
    const launcherPresent = Boolean(launcherPath && await exists(launcherPath))
    const analysisSkillPresent = await exists(join(analysisSkillPath, 'SKILL.md'))
      && analysisMarker?.schemaVersion === 'foggy-managed-skill/v1'
    const semanticQuerySkillPresent = await exists(join(semanticQuerySkillPath, 'SKILL.md'))
      && semanticQueryMarker?.schemaVersion === 'foggy-managed-skill/v1'
    const cliRelease = componentReleaseState({
      installed: cliPresent,
      installedVersion: state?.cli?.version,
      targetVersion: manifest.components.cli.version,
    })
    const launcherRelease = componentReleaseState({
      installed: launcherPresent,
      installedVersion: state?.launcher?.version,
      targetVersion: manifest.components.launcher.version,
    })
    const analysisRelease = componentReleaseState({
      installed: analysisSkillPresent,
      installedVersion: analysisMarker?.componentVersion || state?.skills?.analysis?.version,
      targetVersion: manifest.components.analysisSkill.version,
    })
    const semanticQueryRelease = componentReleaseState({
      installed: semanticQuerySkillPresent,
      installedVersion: semanticQueryMarker?.componentVersion || state?.skills?.semanticQuery?.version,
      targetVersion: manifest.components.semanticQuerySkill.version,
    })
    const components = {
      python,
      java,
      cli: {
        ...cliRelease,
        version: cliRelease.installedVersion ?? manifest.components.cli.version,
      },
      launcher: {
        ...launcherRelease,
        version: launcherRelease.installedVersion ?? manifest.components.launcher.version,
      },
      analysisSkill: {
        ...analysisRelease,
        version: analysisRelease.installedVersion ?? manifest.components.analysisSkill.version,
      },
      semanticQuerySkill: {
        ...semanticQueryRelease,
        version: semanticQueryRelease.installedVersion ?? manifest.components.semanticQuerySkill.version,
      },
      onboardingSkill: {
        installed: await exists(join(onboardingSkillPath, 'SKILL.md')),
        version: manifest.packageVersion,
        provider: 'foggy-managed-skills',
      },
    }
    const installed = components.python.available
      && components.cli.installed
      && components.launcher.installed
      && components.analysisSkill.installed
      && components.semanticQuerySkill.installed
      && components.onboardingSkill.installed
    const updateAvailable = Object.values(components).some((component) => component?.updateAvailable)
    const running = Boolean(runtime && processRunning(Number(runtime.pid)))
    const activePort = running && Number.isInteger(Number(runtime?.port)) ? Number(runtime.port) : null
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
      updateAvailable,
      running,
      runtimeUrl: running ? runtime.runtimeUrl ?? null : null,
      runtimeSettings: {
        ...runtimeSettings,
        activePort,
        activeRuntimeUrl: running ? runtime.runtimeUrl ?? null : null,
        pendingRestart: Boolean(running && activePort && activePort !== runtimeSettings.port),
        lastConflict: lastRuntimePortConflict,
        conflictApplies: Number(lastRuntimePortConflict?.port) === runtimeSettings.port,
      },
      roots,
      components,
      operation,
      onboarding,
      profileMigration,
      next: !state
        ? 'initialize'
        : updateAvailable
          ? 'update-components'
          : installed
            ? (running ? 'configure-database' : 'start-runtime')
            : 'repair',
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
        'download and verify a pinned private Python runtime',
        'create isolated Python environment',
        'download and verify pinned CLI and Launcher assets',
        'install the Foggy analysis and semantic-query Skills into the global managed component directory',
        'register onboarding, analysis, and semantic-query Skills through the native DSH Skill registry',
        'write global install state; resolve each workspace from the DSH session cwd',
      ],
      secretsInDshSettings: false,
    }
  }

  async initialize() {
    return this.startOperation('initialize', false)
  }

  async initializeAndStart() {
    const status = await this.status()
    if (status.state !== 'not-installed') {
      return {
        success: false,
        accepted: false,
        error: { code: 'FOGGY_ALREADY_INITIALIZED', message: 'Foggy is already initialized; use Start Runtime or Update components.' },
      }
    }
    return this.startOperation('initialize-and-start', false, undefined, async ({ operation, progressPath, pythonProgress }) => {
      await assertSystemPrerequisites('initialize')
      const cacheArgs = (process.env.FOGGY_ASSET_CACHE_DIRS || '').split(delimiter).filter(Boolean)
        .flatMap((cacheDir) => ['--asset-cache-dir', cacheDir])
      const install = await runOnboarding([
        'install', '--progress-file', progressPath, '--operation-id', operation.id, '--operation-kind', 'initialize',
        ...cacheArgs,
      ], 15 * 60_000, {
        ensurePython: true,
        onPythonProgress: (detail) => pythonProgress?.update(detail),
        flushPythonProgress: () => pythonProgress?.flush(),
      })
      if (install.success === false) return install

      await assertSystemPrerequisites('runtime-start')
      const roots = defaultRoots()
      const manifest = await readJson(versionsFile)
      const settings = await readRuntimeSettings(roots.dataRoot, {
        defaultPort: manifest.defaults?.port ?? DEFAULT_RUNTIME_PORT,
      })
      if (!settings.valid) {
        return {
          success: false,
          error: { code: 'RUNTIME_SETTINGS_INVALID', message: `Runtime settings are invalid: ${settings.error}` },
        }
      }
      return runOnboarding([
        'runtime-start', '--install-root', roots.installRoot, '--data-root', roots.dataRoot,
        '--port', String(settings.port), '--progress-file', progressPath, '--operation-id', operation.id,
        '--operation-kind', 'runtime-start',
      ], 15 * 60_000, { ensurePython: false })
    })
  }

  async repair() {
    const blocked = await runtimeRunningUpdateGuard()
    if (blocked) return blocked
    return this.startOperation('repair', true)
  }

  async updateComponents() {
    const blocked = await runtimeRunningUpdateGuard()
    if (blocked) return blocked
    const status = await this.status()
    if (status.state === 'not-installed') {
      return {
        success: false,
        accepted: false,
        error: { code: 'FOGGY_NOT_INITIALIZED', message: 'Initialize Foggy before updating managed components.' },
      }
    }
    return this.startOperation('update-components', true)
  }

  async repairCli() {
    const blocked = await runtimeRunningUpdateGuard()
    if (blocked) return blocked
    return this.startOperation('repair-cli', false, ['install', '--repair-component', 'cli'])
  }

  async repairPython() {
    const blocked = await runtimeRunningUpdateGuard()
    if (blocked) return blocked
    return this.startOperation('repair-python', false, ['install'])
  }

  async repairLauncher() {
    const blocked = await runtimeRunningUpdateGuard()
    if (blocked) return blocked
    return this.startOperation('repair-launcher', false, ['install', '--repair-component', 'launcher'])
  }

  async repairAnalysisSkill() {
    const blocked = await runtimeRunningUpdateGuard()
    if (blocked) return blocked
    return this.startOperation('repair-analysis-skill', true, ['install', '--repair-component', 'analysis-skill'])
  }

  async repairSemanticQuerySkill() {
    const blocked = await runtimeRunningUpdateGuard()
    if (blocked) return blocked
    return this.startOperation('repair-semantic-query-skill', true, ['install', '--repair-component', 'semantic-query-skill'])
  }

  async migrateProfiles() {
    return this.startOperation('profile-migration', false, ['profile-migrate', '--approve'])
  }

  async diagnostics() {
    const roots = defaultRoots()
    const status = await this.status()
    const lastRuntimeStartFailure = await enrichRuntimeStartFailure(
      await readOptionalJson(join(roots.dataRoot, 'last-runtime-start-failure.json')),
      roots.dataRoot,
    )
    let doctor
    try {
      doctor = await runOnboarding(['doctor', '--no-fail'])
    } catch (error) {
      doctor = { success: false, error: String(error.message ?? error), bootstrapOnly: true }
    }
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
      runtimeSettings: status.runtimeSettings,
      lastRuntimeStartFailure,
      doctor,
    }
    const directory = join(roots.dataRoot, 'diagnostics')
    await mkdir(directory, { recursive: true })
    const path = join(directory, `diagnostics-${Date.now()}.json`)
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    return { success: true, path, report }
  }

  async runtimeStart() {
    const roots = defaultRoots()
    const manifest = await readJson(versionsFile)
    const settings = await readRuntimeSettings(roots.dataRoot, {
      defaultPort: manifest.defaults?.port ?? DEFAULT_RUNTIME_PORT,
    })
    if (!settings.valid) {
      return {
        success: false,
        accepted: false,
        error: {
          code: 'RUNTIME_SETTINGS_INVALID',
          message: `Runtime settings are invalid: ${settings.error}. Save a valid port in Foggy plugin settings.`,
        },
      }
    }
    return this.startOperation('runtime-start', false, [
      'runtime-start', '--install-root', roots.installRoot, '--data-root', roots.dataRoot,
      '--port', String(settings.port),
    ])
  }

  async runtimeStop() {
    const roots = defaultRoots()
    return this.startOperation('runtime-stop', false, [
      'runtime-stop', '--install-root', roots.installRoot, '--data-root', roots.dataRoot,
    ])
  }

  async saveRuntimeSettings(input) {
    const roots = defaultRoots()
    if (this.operation?.state === 'running') {
      return {
        success: false,
        error: { code: 'OPERATION_RUNNING', message: 'Wait for the current Foggy operation to finish before changing the Runtime port.' },
      }
    }
    const runtime = await readOptionalJson(join(roots.dataRoot, 'runtime-state.json'))
    if (runtime && processRunning(Number(runtime.pid))) {
      return {
        success: false,
        error: { code: 'RUNTIME_RUNNING', message: 'Stop Foggy Runtime before changing its port.' },
      }
    }
    try {
      const settings = await writeRuntimeSettings(roots.dataRoot, input)
      if (this.operation?.state === 'failed' && this.operation.result?.error?.code === 'RUNTIME_PORT_UNAVAILABLE') {
        this.operation = null
      }
      return { success: true, settings }
    } catch (error) {
      return {
        success: false,
        error: { code: 'RUNTIME_PORT_INVALID', message: String(error?.message ?? error) },
      }
    }
  }

  startOperation(kind, replaceSkill, explicitArgs, runner = null) {
    if (this.operation?.state === 'running') {
      return { success: false, accepted: false, operation: operationView(this.operation), error: 'another Foggy operation is running' }
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
    const args = explicitArgs ?? ['install']
    const reportsProgress = args[0] === 'install' || args[0] === 'runtime-start' || runner !== null
    const progressPath = reportsProgress ? join(defaultRoots().dataRoot, 'operation-progress.json') : null
    if (reportsProgress) {
      args.push('--progress-file', progressPath, '--operation-id', id, '--operation-kind', kind)
    }
    if (replaceSkill) args.push('--replace-skill')
    for (const cacheDir of (process.env.FOGGY_ASSET_CACHE_DIRS || '').split(delimiter).filter(Boolean)) {
      args.push('--asset-cache-dir', cacheDir)
    }
    const runtimeStart = kind === 'runtime-start' || kind.endsWith('-and-start')
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
        message: runtimeStart ? 'Starting Foggy Runtime' : 'Starting Foggy initialization',
        currentFile: null,
        percent: 0,
        step: { index: 1, total: runtimeStart ? 6 : 7 },
      } : null,
      promise: null,
    }
    const pythonProgress = reportsProgress
      ? createPythonProgressReporter(operation, progressPath)
      : null
    operation.promise = (async () => {
      await assertSystemPrerequisites(kind)
      if (runner) return runner({ operation, progressPath, pythonProgress })
      return runOnboarding(args, 15 * 60_000, {
        ensurePython: true,
        forcePython: kind === 'repair-python',
        onPythonProgress: (detail) => pythonProgress?.update(detail),
        flushPythonProgress: () => pythonProgress?.flush(),
      })
    })()
      .then((result) => {
        operation.state = result.success === false ? 'failed' : 'succeeded'
        operation.result = result
        operation.finishedAt = new Date().toISOString()
        this.skillProviderControl?.invalidate()
        if (operation.progress) {
          operation.progress = {
            ...operation.progress,
            state: operation.state,
            phase: operation.state === 'succeeded' ? (runtimeStart ? 'runtime-complete' : 'complete') : operation.progress.phase,
            message: operation.state === 'succeeded'
              ? (runtimeStart ? 'Foggy Runtime is ready' : 'Foggy initialization completed')
              : (runtimeStart ? 'Foggy Runtime startup failed' : 'Foggy initialization failed'),
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
            message: runtimeStart ? 'Foggy Runtime startup failed' : 'Foggy initialization failed',
          }
        }
      })
    this.operation = operation
    return { success: true, accepted: true, operation: operationView(operation) }
  }
}

const markerInitializers = []
for (const method of [
  'status', 'plan', 'initialize', 'initializeAndStart', 'repair', 'updateComponents', 'repairPython', 'repairCli', 'repairLauncher', 'repairAnalysisSkill', 'repairSemanticQuerySkill',
  'migrateProfiles', 'diagnostics', 'runtimeStart', 'runtimeStop',
  'saveRuntimeSettings',
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
