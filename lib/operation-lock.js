import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { writeJsonAtomic } from './atomic-json.js'

const SCHEMA = 'foggy-managed-operation-lock/v1'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

export class ManagedOperationBusyError extends Error {
  constructor(owner = null, initializing = false) {
    const detail = owner?.operationKind ? ` (${owner.operationKind})` : ''
    super(initializing
      ? 'Another Foggy operation is initializing, or its operation-lock metadata is incomplete. Wait for it to finish before trying again.'
      : `Another Foggy operation${detail} is running in a different Harness process. Wait for it to finish before trying again.`)
    this.name = 'ManagedOperationBusyError'
    this.code = 'FOGGY_OPERATION_RUNNING'
    this.ownerPID = owner?.ownerPID ?? null
    this.operationKind = owner?.operationKind ?? null
  }
}

export function managedOperationLockDirectory(dataRoot) {
  return join(dataRoot, 'operation-locks')
}

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // Lack of permission is not evidence that a process has stopped.
    return error?.code !== 'ESRCH'
  }
}

function entryName(owner) {
  return `owner-${owner.ownerPID}-${owner.token}.json`
}

function validOwner(owner, name) {
  return owner?.schemaVersion === SCHEMA
    && Number.isInteger(owner.ownerPID) && owner.ownerPID > 0 && owner.ownerPID <= 2147483647
    && typeof owner.token === 'string' && UUID.test(owner.token)
    && entryName(owner) === name
    && typeof owner.createdAt === 'string' && Number.isFinite(Date.parse(owner.createdAt))
    && typeof owner.operationKind === 'string' && owner.operationKind.length <= 100
    && (owner.phase === 'choosing' || (owner.phase === 'waiting' && typeof owner.ticket === 'string' && /^[1-9]\d{0,39}$/.test(owner.ticket)))
}

async function readOwner(directory, name) {
  try {
    const path = join(directory, name)
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 8192) throw new ManagedOperationBusyError(null, true)
    const owner = JSON.parse(await readFile(path, 'utf8'))
    if (!validOwner(owner, name)) throw new ManagedOperationBusyError(null, true)
    return owner
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    if (error instanceof ManagedOperationBusyError) throw error
    throw new ManagedOperationBusyError(null, true)
  }
}

async function owners(directory, self, isProcessAlive) {
  const result = []
  for (const name of await readdir(directory)) {
    // Atomic JSON staging files are never published lock owners.
    if (!name.endsWith('.json')) continue
    if (name === entryName(self)) continue
    const owner = await readOwner(directory, name)
    if (!owner) continue
    if (!isProcessAlive(owner.ownerPID)) {
      // Each contender owns a unique UUID path. Removing a dead contender cannot
      // remove a new owner's file, even if several processes recover it at once.
      try { await unlink(join(directory, name)) } catch (error) { if (error?.code !== 'ENOENT') throw error }
      continue
    }
    result.push(owner)
  }
  return result
}

function precedes(left, right) {
  const leftTicket = BigInt(left.ticket)
  const rightTicket = BigInt(right.ticket)
  return leftTicket < rightTicket || (leftTicket === rightTicket && left.token < right.token)
}

async function release(directory, owner) {
  const name = entryName(owner)
  const saved = await readOwner(directory, name)
  if (saved?.token !== owner.token || saved?.ownerPID !== owner.ownerPID) return
  try { await unlink(join(directory, name)) } catch (error) { if (error?.code !== 'ENOENT') throw error }
}

/**
 * Nonblocking cross-process lock for the user's managed component roots.
 *
 * A file-based bakery ticket avoids deleting/replacing a shared owner file or
 * an empty directory during initialization. Every owner is fully written and
 * atomically published before it chooses a ticket. Dead processes leave only
 * their unique UUID file, which subsequent contenders can safely remove.
 */
export async function withManagedOperationLock(dataRoot, action, {
  kind = 'managed-operation',
  isProcessAlive = processAlive,
  now = Date.now,
} = {}) {
  if (typeof dataRoot !== 'string' || !dataRoot) throw new TypeError('dataRoot is required')
  if (typeof action !== 'function') throw new TypeError('action must be a function')
  const directory = managedOperationLockDirectory(dataRoot)
  const owner = {
    schemaVersion: SCHEMA,
    ownerPID: process.pid,
    token: randomUUID(),
    createdAt: new Date(now()).toISOString(),
    operationKind: String(kind).slice(0, 100),
    phase: 'choosing',
  }
  await mkdir(directory, { recursive: true })
  const path = join(directory, entryName(owner))
  try {
    await writeJsonAtomic(path, owner)
    const contenders = await owners(directory, owner, isProcessAlive)
    const largest = contenders.reduce((ticket, other) => other.phase === 'waiting' && BigInt(other.ticket) > ticket ? BigInt(other.ticket) : ticket, 0n)
    owner.ticket = (largest + 1n).toString()
    owner.phase = 'waiting'
    await writeJsonAtomic(path, owner)
    for (const other of await owners(directory, owner, isProcessAlive)) {
      if (other.phase === 'choosing' || precedes(other, owner)) {
        throw new ManagedOperationBusyError(other, other.phase === 'choosing')
      }
    }
    return await action()
  } finally {
    await release(directory, owner)
  }
}
