import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const identifier = /^[A-Za-z0-9_.-]{1,128}$/

export function assertStandardDsl(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Query DSL must be a JSON object')
  if (payload.route === 'DSL_CTE' || 'executable_plan' in payload || 'executablePlan' in payload) {
    throw new Error('CTE preview is not supported in this release; use a standard QM DSL query')
  }
  if (!Array.isArray(payload.columns) || payload.columns.length === 0 || !payload.columns.every((item) => typeof item === 'string')) {
    throw new Error('Standard QM DSL requires non-empty columns')
  }
}

export function previewPayload(payload) {
  assertStandardDsl(payload)
  const supported = new Set(['columns', 'slice', 'groupBy', 'orderBy', 'calculatedFields', 'extData'])
  const unsupported = Object.keys(payload).filter((key) => !supported.has(key) && !['start', 'limit', 'returnTotal'].includes(key))
  if (unsupported.length) throw new Error(`DataViewer preview does not support: ${unsupported.join(', ')}`)
  for (const key of ['slice', 'calculatedFields']) {
    if (payload[key] !== undefined && (!Array.isArray(payload[key]) || payload[key].some((item) => !item || typeof item !== 'object' || Array.isArray(item)))) {
      throw new Error(`DataViewer preview requires object-form ${key} entries`)
    }
  }
  const result = Object.fromEntries([...supported].filter((key) => payload[key] !== undefined).map((key) => [key, payload[key]]))
  if (payload.groupBy !== undefined) {
    if (!Array.isArray(payload.groupBy) || payload.groupBy.some((item) => typeof item !== 'string' && (!item || typeof item !== 'object' || Array.isArray(item)))) {
      throw new Error('DataViewer preview requires field names or object-form groupBy entries')
    }
    result.groupBy = payload.groupBy.map((item) => typeof item === 'string' ? { field: item } : item)
  }
  if (payload.orderBy !== undefined) {
    if (!Array.isArray(payload.orderBy) || payload.orderBy.some((item) => typeof item !== 'string' && (!item || typeof item !== 'object' || Array.isArray(item)))) {
      throw new Error('DataViewer preview requires field names or object-form orderBy entries')
    }
    result.orderBy = payload.orderBy.map((item) => {
      if (typeof item !== 'string') return item
      const shorthand = item.trim().match(/^(-)?(.+?)(?:\s+(asc|desc))?$/i)
      if (!shorthand || !shorthand[2].trim()) throw new Error('DataViewer preview requires a valid orderBy field')
      return { field: shorthand[2].trim(), dir: shorthand[1] ? 'desc' : (shorthand[3] || 'asc').toLowerCase() }
    })
  }
  return result
}

export function safeRuntimeUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Managed Runtime URL must be a plain loopback HTTP origin')
  }
  return url.origin
}

export async function managedConnection(roots) {
  const install = JSON.parse(await readFile(join(roots.installRoot, 'install-state.json'), 'utf8'))
  const runtime = JSON.parse(await readFile(join(roots.dataRoot, 'runtime-state.json'), 'utf8'))
  if (!install.cli?.command) throw new Error('Foggy CLI is not installed')
  return { cli: install.cli.command, runtimeUrl: safeRuntimeUrl(runtime.runtimeUrl) }
}

async function cliJson(cli, runtimeUrl, namespace, command, signal) {
  const { stdout } = await execFileAsync(cli, ['--base-url', runtimeUrl, '--namespace', namespace, '--output', 'json', ...command], {
    signal,
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  const value = JSON.parse(stdout.trim())
  if (value?.success !== true) throw new Error(value?.error?.message || value?.error?.code || 'Foggy query failed')
  return value
}

export function createFoggyQueryTool(roots) {
  return {
    name: 'foggy_query',
    description: 'Validate and execute a bounded, read-only standard Foggy QueryModel DSL query against the managed local Runtime. On success Harness shows a query card; its DataViewer preview link is created only if the user clicks Open DataViewer. CTE is not supported here.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Published Foggy QueryModel name' },
        namespace: { type: 'string', description: 'Foggy namespace' },
        payload: { type: 'object', additionalProperties: true, description: 'Standard QueryModel DSL, including explicit columns and bounded limit' },
      },
      required: ['model', 'namespace', 'payload'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          model: { type: 'string' },
          namespace: { type: 'string' },
          validation: {},
          execution: {},
        },
        required: ['model', 'namespace', 'validation', 'execution'],
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    timeoutMs: 150_000,
    async execute(args, exec) {
      const { model, namespace, payload } = args || {}
      if (!identifier.test(model) || !identifier.test(namespace)) throw new Error('Invalid model or namespace')
      assertStandardDsl(payload)
      if (!Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 100) {
        throw new Error('Query DSL limit must be an integer from 1 to 100')
      }
      const { cli, runtimeUrl } = await managedConnection(roots)
      const directory = await mkdtemp(join(tmpdir(), 'foggy-dsh-query-'))
      const payloadPath = join(directory, 'query.json')
      try {
        await writeFile(payloadPath, JSON.stringify(payload), { encoding: 'utf8', flag: 'wx' })
        const validation = await cliJson(cli, runtimeUrl, namespace, ['query', 'validate', model, '--payload', payloadPath], exec?.signal)
        const execution = await cliJson(cli, runtimeUrl, namespace, ['query', 'execute', model, '--payload', payloadPath], exec?.signal)
        return { model, namespace, validation, execution }
      } finally {
        await unlink(payloadPath).catch(() => {})
        await rmdir(directory).catch(() => {})
      }
    },
    presentCall({ model }) {
      return { card: 'generic', title: `Foggy DSL · ${model}`, kind: 'read' }
    },
  }
}
