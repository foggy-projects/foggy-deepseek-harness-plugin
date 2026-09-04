import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeJsonAtomic } from './atomic-json.js'

export const RUNTIME_SETTINGS_SCHEMA = 'foggy-deepseek-runtime-settings/v1'
export const DEFAULT_RUNTIME_PORT = 18166
export const MIN_RUNTIME_PORT = 1024
export const MAX_RUNTIME_PORT = 65535

export function normalizeRuntimePort(value) {
  const port = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (!Number.isInteger(port) || port < MIN_RUNTIME_PORT || port > MAX_RUNTIME_PORT) {
    throw new Error(`Runtime port must be an integer between ${MIN_RUNTIME_PORT} and ${MAX_RUNTIME_PORT}`)
  }
  return port
}

export function runtimeUrlForPort(port) {
  return `http://127.0.0.1:${normalizeRuntimePort(port)}`
}

export function runtimeSettingsPath(dataRoot) {
  return join(dataRoot, 'runtime-settings.json')
}

export async function readRuntimeSettings(dataRoot, { defaultPort = DEFAULT_RUNTIME_PORT } = {}) {
  const path = runtimeSettingsPath(dataRoot)
  const fallbackPort = normalizeRuntimePort(defaultPort)
  try {
    const payload = JSON.parse(await readFile(path, 'utf8'))
    if (payload?.schemaVersion !== RUNTIME_SETTINGS_SCHEMA) {
      throw new Error(`expected schemaVersion ${RUNTIME_SETTINGS_SCHEMA}`)
    }
    const port = normalizeRuntimePort(payload.runtimePort)
    return {
      valid: true,
      source: 'configured',
      schemaVersion: RUNTIME_SETTINGS_SCHEMA,
      port,
      runtimeUrl: runtimeUrlForPort(port),
      updatedAt: payload.updatedAt ?? null,
      path,
      error: null,
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        valid: true,
        source: 'default',
        schemaVersion: RUNTIME_SETTINGS_SCHEMA,
        port: fallbackPort,
        runtimeUrl: runtimeUrlForPort(fallbackPort),
        updatedAt: null,
        path,
        error: null,
      }
    }
    return {
      valid: false,
      source: 'invalid',
      schemaVersion: RUNTIME_SETTINGS_SCHEMA,
      port: fallbackPort,
      runtimeUrl: runtimeUrlForPort(fallbackPort),
      updatedAt: null,
      path,
      error: String(error?.message ?? error),
    }
  }
}

export async function writeRuntimeSettings(dataRoot, input) {
  const runtimePort = normalizeRuntimePort(input?.port)
  const payload = {
    schemaVersion: RUNTIME_SETTINGS_SCHEMA,
    runtimePort,
    updatedAt: new Date().toISOString(),
  }
  const path = runtimeSettingsPath(dataRoot)
  await writeJsonAtomic(path, payload)
  return {
    valid: true,
    source: 'configured',
    ...payload,
    port: runtimePort,
    runtimeUrl: runtimeUrlForPort(runtimePort),
    path,
    error: null,
  }
}
