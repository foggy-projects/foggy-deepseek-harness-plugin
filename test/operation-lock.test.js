import assert from 'node:assert/strict'
import { execFile, fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'
import { managedOperationLockDirectory, withManagedOperationLock } from '../lib/operation-lock.js'

const execFileAsync = promisify(execFile)
const workerMode = process.env.FOGGY_OPERATION_LOCK_WORKER

async function root(t) {
  const directory = await mkdtemp(join(tmpdir(), 'foggy-operation-lock-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function savedOwner(dataRoot, overrides = {}) {
  const owner = {
    schemaVersion: 'foggy-managed-operation-lock/v1',
    ownerPID: process.pid,
    token: randomUUID(),
    createdAt: new Date().toISOString(),
    operationKind: 'component-switch',
    phase: 'waiting',
    ticket: '1',
    ...overrides,
  }
  const directory = managedOperationLockDirectory(dataRoot)
  await mkdir(directory, { recursive: true })
  const path = join(directory, `owner-${owner.ownerPID}-${owner.token}.json`)
  await writeFile(path, JSON.stringify(owner))
  return { path, owner }
}

if (workerMode === 'hold') {
  await withManagedOperationLock(process.env.FOGGY_OPERATION_LOCK_ROOT, async () => {
    process.send?.({ state: 'locked' })
    await new Promise((resolve) => process.once('message', resolve))
  }, { kind: 'worker-test' })
  process.send?.({ state: 'released' })
} else if (workerMode === 'try') {
  try {
    await withManagedOperationLock(process.env.FOGGY_OPERATION_LOCK_ROOT, async () => {})
    process.stdout.write('acquired')
  } catch (error) {
    process.stdout.write(error.code || error.message)
  }
} else {
  test('serializes independent callers and releases only its own entry', async (t) => {
    const dataRoot = await root(t)
    let enter
    let finish
    const entered = new Promise((resolve) => { enter = resolve })
    const release = new Promise((resolve) => { finish = resolve })
    const first = withManagedOperationLock(dataRoot, async () => { enter(); await release; return 'completed' }, { kind: 'launcher-switch' })
    await entered
    await assert.rejects(withManagedOperationLock(dataRoot, async () => assert.fail('competing operation must not enter')), { code: 'FOGGY_OPERATION_RUNNING', ownerPID: process.pid })
    assert.equal((await readdir(managedOperationLockDirectory(dataRoot))).length, 1)
    finish()
    assert.equal(await first, 'completed')
    assert.deepEqual(await readdir(managedOperationLockDirectory(dataRoot)), [])
    assert.equal(await withManagedOperationLock(dataRoot, async () => 42), 42)
  })

  test('releases the lock when its action throws', async (t) => {
    const dataRoot = await root(t)
    await assert.rejects(withManagedOperationLock(dataRoot, async () => { throw new Error('installation failed') }), /installation failed/)
    assert.deepEqual(await readdir(managedOperationLockDirectory(dataRoot)), [])
    assert.equal(await withManagedOperationLock(dataRoot, async () => 'recovered'), 'recovered')
  })

  test('recovers a known dead owner without deleting a live owner', async (t) => {
    const dataRoot = await root(t)
    await savedOwner(dataRoot, { ownerPID: 2147483647 })
    assert.equal(await withManagedOperationLock(dataRoot, async () => 'recovered', { isProcessAlive: (pid) => pid !== 2147483647 }), 'recovered')
    assert.deepEqual(await readdir(managedOperationLockDirectory(dataRoot)), [])
    const alive = await savedOwner(dataRoot)
    await assert.rejects(withManagedOperationLock(dataRoot, async () => assert.fail('live owner must not be removed')), { code: 'FOGGY_OPERATION_RUNNING' })
    assert.deepEqual(await readdir(managedOperationLockDirectory(dataRoot)), [alive.path.split(/[\\/]/).at(-1)])
  })

  test('does not remove an initializing owner or incomplete metadata', async (t) => {
    const dataRoot = await root(t)
    const initializing = await savedOwner(dataRoot, { phase: 'choosing', ticket: undefined })
    await assert.rejects(withManagedOperationLock(dataRoot, async () => assert.fail('initializing owner must block')), /initializing/)
    assert.equal((await readdir(managedOperationLockDirectory(dataRoot))).length, 1)
    await rm(initializing.path)
    const incomplete = join(managedOperationLockDirectory(dataRoot), 'owner.json')
    await writeFile(incomplete, '')
    await assert.rejects(withManagedOperationLock(dataRoot, async () => assert.fail('unknown initialization must block')), /incomplete/)
    assert.deepEqual(await readdir(managedOperationLockDirectory(dataRoot)), ['owner.json'])
  })

  test('excludes concurrent operations across actual Node processes', { timeout: 10_000 }, async (t) => {
    const dataRoot = await root(t)
    const path = fileURLToPath(import.meta.url)
    const holder = fork(path, [], { env: { ...process.env, FOGGY_OPERATION_LOCK_WORKER: 'hold', FOGGY_OPERATION_LOCK_ROOT: dataRoot }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true })
    t.after(() => { if (holder.exitCode === null) holder.kill() })
    await new Promise((resolve, reject) => {
      holder.once('message', (message) => message.state === 'locked' ? resolve() : reject(new Error('worker did not acquire lock')))
      holder.once('error', reject)
      holder.once('exit', (code) => reject(new Error(`holder exited early: ${code}`)))
    })
    const denied = await execFileAsync(process.execPath, [path], { env: { ...process.env, FOGGY_OPERATION_LOCK_WORKER: 'try', FOGGY_OPERATION_LOCK_ROOT: dataRoot }, windowsHide: true, timeout: 10_000 })
    assert.equal(denied.stdout, 'FOGGY_OPERATION_RUNNING')
    const exited = new Promise((resolve) => holder.once('exit', resolve))
    holder.send('release')
    assert.equal(await exited, 0)
    const accepted = await execFileAsync(process.execPath, [path], { env: { ...process.env, FOGGY_OPERATION_LOCK_WORKER: 'try', FOGGY_OPERATION_LOCK_ROOT: dataRoot }, windowsHide: true, timeout: 10_000 })
    assert.equal(accepted.stdout, 'acquired')
  })

  test('recovers a terminated process on the next operation', { timeout: 10_000 }, async (t) => {
    const dataRoot = await root(t)
    const holder = fork(fileURLToPath(import.meta.url), [], { env: { ...process.env, FOGGY_OPERATION_LOCK_WORKER: 'hold', FOGGY_OPERATION_LOCK_ROOT: dataRoot }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true })
    t.after(() => { if (holder.exitCode === null) holder.kill() })
    await new Promise((resolve, reject) => { holder.once('message', resolve); holder.once('error', reject) })
    const exited = new Promise((resolve) => holder.once('exit', resolve))
    holder.kill()
    await exited
    assert.equal((await readdir(managedOperationLockDirectory(dataRoot))).length, 1)
    assert.equal(await withManagedOperationLock(dataRoot, async () => 'after crash'), 'after crash')
    assert.deepEqual(await readdir(managedOperationLockDirectory(dataRoot)), [])
  })
}
