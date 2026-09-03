import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  access,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { compatible, versionParts } from './version.js'

const execFileAsync = promisify(execFile)
const MARKER_SCHEMA = 'foggy-managed-python/v1'

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function commandVersion(command) {
  try {
    const { stdout, stderr } = await execFileAsync(command, ['--version'], {
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 256 * 1024,
    })
    return {
      available: true,
      output: `${stdout}\n${stderr}`.trim().split(/\r?\n/)[0] ?? '',
      command,
    }
  } catch (error) {
    return { available: false, output: '', command, error: error.code ?? 'COMMAND_FAILED' }
  }
}

async function sha256(path) {
  const file = await open(path, 'r')
  const hash = createHash('sha256')
  try {
    for await (const chunk of file.readableWebStream()) hash.update(Buffer.from(chunk))
  } finally {
    await file.close()
  }
  return hash.digest('hex')
}

function pythonComponent(manifest) {
  const component = manifest?.components?.python
  if (!component?.version || !component?.assets) {
    throw new Error('The Foggy component manifest does not define a managed Python runtime')
  }
  return component
}

export function pythonAssetKey(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`
}

export function selectPythonAsset(manifest, platform = process.platform, arch = process.arch) {
  const component = pythonComponent(manifest)
  const key = pythonAssetKey(platform, arch)
  const asset = component.assets[key]
  if (!asset) {
    throw new Error(`Managed Python is not published for ${platform}/${arch}; set FOGGY_PYTHON to a compatible Python executable`)
  }
  if (!asset.file || !asset.url || !/^[a-f0-9]{64}$/.test(asset.sha256 || '')) {
    throw new Error(`Managed Python asset ${key} is incomplete or has an invalid SHA256`)
  }
  return { ...asset, key }
}

export function managedPythonHome(installRoot, manifest) {
  return join(installRoot, 'python', pythonComponent(manifest).version)
}

export function managedPythonExecutable(installRoot, manifest, platform = process.platform) {
  const home = managedPythonHome(installRoot, manifest)
  return platform === 'win32' ? join(home, 'python.exe') : join(home, 'bin', 'python3')
}

function markerPath(installRoot, manifest) {
  return join(managedPythonHome(installRoot, manifest), '.foggy-managed-python.json')
}

async function readMarker(installRoot, manifest) {
  try {
    return JSON.parse(await readFile(markerPath(installRoot, manifest), 'utf8'))
  } catch {
    return null
  }
}

function exactVersion(probe, expected) {
  const actualParts = versionParts(probe.output)
  const expectedParts = versionParts(expected)
  return expectedParts.every((part, index) => actualParts[index] === part)
}

export async function probePythonRuntime({ installRoot, manifest, env = process.env } = {}) {
  const minimum = manifest.components.cli.minimumPythonVersion
  if (env.FOGGY_PYTHON) {
    const probe = compatible(await commandVersion(env.FOGGY_PYTHON), minimum)
    const isPython = /^Python\s+\d+/i.test(probe.output)
    return {
      ...probe,
      available: probe.available && isPython,
      source: 'override',
      managed: false,
      path: env.FOGGY_PYTHON,
      version: probe.available && isPython ? versionParts(probe.output).slice(0, 3).join('.') : null,
      error: probe.available && !isPython ? 'Configured executable is not Python' : probe.error,
    }
  }

  const component = pythonComponent(manifest)
  const command = managedPythonExecutable(installRoot, manifest)
  const marker = await readMarker(installRoot, manifest)
  if (!marker || marker.schemaVersion !== MARKER_SCHEMA || marker.version !== component.version) {
    return {
      available: false,
      detected: false,
      output: '',
      error: 'Managed Python is not installed or its marker is invalid',
      source: 'managed',
      managed: true,
      path: command,
      version: component.version,
      minimum,
    }
  }
  const probe = compatible(await commandVersion(command), minimum)
  const valid = probe.available && exactVersion(probe, component.version)
  return {
    ...probe,
    available: valid,
    detected: probe.detected,
    ...(valid ? {} : { error: probe.error || `Expected Python ${component.version}` }),
    source: 'managed',
    managed: true,
    path: command,
    home: managedPythonHome(installRoot, manifest),
    version: component.version,
    asset: marker.asset,
  }
}

async function safeRenameCorrupt(path) {
  if (!await exists(path)) return null
  const corrupt = `${path}.corrupt-${Date.now()}`
  await rename(path, corrupt)
  return corrupt
}

async function cachedAsset(asset, cacheDirs) {
  for (const directory of cacheDirs) {
    const candidate = join(directory, asset.file)
    try {
      if ((await stat(candidate)).isFile() && await sha256(candidate) === asset.sha256) return candidate
    } catch {}
  }
  return null
}

async function materializeAsset(asset, destination, cacheDirs, onProgress) {
  await mkdir(dirname(destination), { recursive: true })
  if (await exists(destination) && await sha256(destination) === asset.sha256) {
    onProgress?.({ fraction: 0.82, message: 'Using verified managed Python archive', currentFile: asset.file })
    return { path: destination, source: 'existing' }
  }
  await safeRenameCorrupt(destination)
  const temporary = `${destination}.download`
  const cached = await cachedAsset(asset, cacheDirs)
  if (cached) {
    onProgress?.({ fraction: 0.35, message: 'Copying managed Python from verified cache', currentFile: asset.file })
    await rm(temporary, { force: true })
    await copyFile(cached, temporary)
  } else {
    let resumeBytes = 0
    try {
      resumeBytes = (await stat(temporary)).size
    } catch {}
    if (resumeBytes >= Number(asset.size || Number.MAX_SAFE_INTEGER)) {
      if (await sha256(temporary) === asset.sha256) {
        await rename(temporary, destination)
        return { path: destination, source: 'resumed' }
      }
      await rm(temporary, { force: true })
      resumeBytes = 0
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20 * 60_000)
    try {
      const headers = resumeBytes > 0 ? { Range: `bytes=${resumeBytes}-` } : undefined
      const response = await fetch(asset.url, { redirect: 'follow', signal: controller.signal, headers })
      if (!response.ok || !response.body) throw new Error(`Managed Python download failed: HTTP ${response.status}`)
      const resumed = resumeBytes > 0 && response.status === 206
      if (!resumed) {
        await rm(temporary, { force: true })
        resumeBytes = 0
      }
      const expectedSize = Number(asset.size || (Number(response.headers.get('content-length')) + resumeBytes) || 0)
      const file = await open(temporary, resumed ? 'a' : 'w')
      let received = resumeBytes
      try {
        const reader = response.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = Buffer.from(value)
          await file.write(chunk)
          received += chunk.length
          const fraction = expectedSize > 0 ? Math.min(received / expectedSize, 1) : 0
          onProgress?.({
            fraction: 0.05 + fraction * 0.72,
            message: resumed ? 'Resuming managed Python download' : 'Downloading managed Python',
            currentFile: asset.file,
            bytes: { received, total: expectedSize || null },
          })
        }
        await file.sync()
      } finally {
        await file.close()
      }
    } finally {
      clearTimeout(timeout)
    }
  }
  if (await sha256(temporary) !== asset.sha256) {
    await rm(temporary, { force: true })
    throw new Error(`Managed Python SHA256 mismatch for ${asset.file}`)
  }
  await rename(temporary, destination)
  return { path: destination, source: cached ? 'cache' : 'download' }
}

function validateArchiveEntries(text) {
  const entries = text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)
  if (!entries.length) throw new Error('Managed Python archive is empty')
  for (const entry of entries) {
    const normalized = entry.replaceAll('\\', '/')
    if (isAbsolute(entry) || normalized.startsWith('/') || normalized.includes('../') || !normalized.startsWith('python/')) {
      throw new Error(`Managed Python archive contains an unsafe entry: ${entry}`)
    }
  }
}

async function extractArchive(archive, installRoot, manifest, asset, onProgress) {
  const pythonRoot = join(installRoot, 'python')
  const target = managedPythonHome(installRoot, manifest)
  const staging = join(pythonRoot, `.staging-${process.pid}-${Date.now()}`)
  const backup = `${target}.previous-${Date.now()}`
  await mkdir(staging, { recursive: true })
  try {
    onProgress?.({ fraction: 0.84, message: 'Inspecting managed Python archive', currentFile: asset.file })
    const listed = await execFileAsync('tar', ['-tzf', archive], {
      windowsHide: true,
      timeout: 2 * 60_000,
      maxBuffer: 16 * 1024 * 1024,
    })
    validateArchiveEntries(listed.stdout)
    onProgress?.({ fraction: 0.88, message: 'Extracting managed Python', currentFile: asset.file })
    await execFileAsync('tar', ['-xzf', archive, '-C', staging], {
      windowsHide: true,
      timeout: 5 * 60_000,
      maxBuffer: 4 * 1024 * 1024,
    })
    const extracted = join(staging, 'python')
    const executable = process.platform === 'win32' ? join(extracted, 'python.exe') : join(extracted, 'bin', 'python3')
    if (!await exists(executable)) throw new Error('Managed Python archive did not contain the expected interpreter')
    await writeFile(join(extracted, '.foggy-managed-python.json'), `${JSON.stringify({
      schemaVersion: MARKER_SCHEMA,
      version: pythonComponent(manifest).version,
      distribution: pythonComponent(manifest).distribution,
      buildRelease: pythonComponent(manifest).buildRelease,
      platform: process.platform,
      arch: process.arch,
      asset: { file: asset.file, sha256: asset.sha256 },
      installedAt: new Date().toISOString(),
    }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })

    let movedPrevious = false
    if (await exists(target)) {
      await rename(target, backup)
      movedPrevious = true
    }
    try {
      await rename(extracted, target)
    } catch (error) {
      if (movedPrevious && !await exists(target)) await rename(backup, target)
      throw error
    }
    if (movedPrevious) await rm(backup, { recursive: true, force: true })
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export async function ensurePythonRuntime({
  installRoot,
  manifest,
  cacheDirs = [],
  force = false,
  env = process.env,
  onProgress,
} = {}) {
  if (env.FOGGY_PYTHON) {
    const override = await probePythonRuntime({ installRoot, manifest, env })
    if (!override.available) throw new Error(`FOGGY_PYTHON is not compatible: ${override.path}`)
    onProgress?.({ fraction: 1, message: 'Using FOGGY_PYTHON override', currentFile: override.path })
    return override
  }

  const current = await probePythonRuntime({ installRoot, manifest, env })
  if (current.available && !force) {
    onProgress?.({ fraction: 1, message: 'Managed Python is ready', currentFile: current.path })
    return current
  }

  const asset = selectPythonAsset(manifest)
  const archive = join(installRoot, 'downloads', 'python', asset.file)
  const materialized = await materializeAsset(asset, archive, cacheDirs, onProgress)
  await extractArchive(materialized.path, installRoot, manifest, asset, onProgress)
  const installed = await probePythonRuntime({ installRoot, manifest, env })
  if (!installed.available) throw new Error(installed.error || 'Managed Python verification failed')
  onProgress?.({ fraction: 1, message: 'Managed Python is ready', currentFile: installed.path })
  return installed
}
