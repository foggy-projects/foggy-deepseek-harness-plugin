import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const TRANSIENT_REPLACE_CODES = new Set(['EACCES', 'EBUSY', 'EPERM'])
const TRANSIENT_WINERRORS = new Set([5, 32, 33])

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function transientReplaceError(error) {
  return TRANSIENT_REPLACE_CODES.has(error?.code) || TRANSIENT_WINERRORS.has(error?.winerror)
}

export async function replaceWithRetry(source, destination, {
  replace = rename,
  sleep = wait,
  attempts = 12,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await replace(source, destination)
      return
    } catch (error) {
      if (!transientReplaceError(error) || attempt === attempts - 1) throw error
      await sleep(Math.min(25 * (2 ** attempt), 400))
    }
  }
}

export async function writeJsonAtomic(path, payload, options = {}) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await replaceWithRetry(temporary, path, options)
  } finally {
    await rm(temporary, { force: true })
  }
}
