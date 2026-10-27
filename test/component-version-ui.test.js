import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const catalog = () => ({
  checkedAt: '2026-10-27T04:00:00.000Z', stale: false, error: null,
  components: {
    launcher: {
      installedVersion: '0.1.24', selectedVersion: '0.1.24', bundledVersion: '0.1.46', latestVersion: '0.1.46',
      releases: [
        { version: '0.1.46', prerelease: true, installable: true, url: 'https://github.com/foggy-projects/foggy-data-mcp-bridge/releases/tag/foggy-runtime-launcher-v0.1.46' },
        { version: '0.1.24', downloaded: true, installable: true },
        { version: '0.1.23', downloaded: true, installable: false, unavailableReason: 'Requires Launcher 0.1.24 or later' },
        { version: '0.1.20', installable: false, unavailableReason: 'Requires Launcher 0.1.24 or later' },
      ],
    },
    cli: {
      installedVersion: '0.1.24', selectedVersion: '0.1.24', bundledVersion: '0.1.25', latestVersion: '0.1.25',
      releases: [{ version: '0.1.25', installable: true }, { version: '0.1.24', downloaded: true, installable: true }],
    },
  },
})
const readyStatus = {
  state: 'ready', running: false,
  components: { launcher: { installedVersion: '0.1.24' }, cli: { installedVersion: '0.1.24' } },
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

function walk(node, predicate) {
  if (!node || typeof node !== 'object') return []
  const children = [node.props?.children].flat(Infinity)
  return [...(predicate(node) ? [node] : []), ...children.flatMap((child) => walk(child, predicate))]
}
function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node !== 'object') return String(node)
  return [node.props?.children].flat(Infinity).map(textOf).join(' ')
}

function mount(api, overrides = {}) {
  const states = []
  let cursor = 0
  let effects = []
  let plugin
  let intervalCalls = 0
  const intervalDurations = []
  const element = (type, props, key) => ({ type, props, key })
  runInNewContext(source.replace('exports.NS = NS', 'exports.testUI = { ComponentVersionsPanel, componentVersionInputSchema, progressPanel }; exports.NS = NS'), {
    window: { __ModuleLoader__: { load({ factory }) {
      plugin = factory((specifier) => {
        if (specifier === 'react/jsx-runtime') return { jsx: element, jsxs: element }
        if (specifier === 'react') return {
          useCallback: (callback) => callback,
          useEffect: (effect) => effects.push(effect),
          useState(initial) {
            const index = cursor++
            if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
            return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
          },
        }
        throw new Error(`Unexpected client dependency: ${specifier}`)
      })
    } } },
    document: { querySelector: () => ({}) },
    setInterval: (_callback, duration) => { intervalCalls++; intervalDurations.push(duration); return intervalCalls }, clearInterval() {},
  })
  const choices = []
  const props = { api, status: readyStatus, busy: false, onUse: (input) => choices.push(input), t: (key) => key, ...overrides }
  const render = () => {
    cursor = 0
    effects = []
    return plugin.testUI.ComponentVersionsPanel(props)
  }
  const tree = render()
  const dispose = effects.map((effect) => effect()).filter(Boolean)
  return { tree, render, choices, props, codec: plugin.testUI.componentVersionInputSchema, progress: plugin.testUI.progressPanel, intervalCalls, intervalDurations, dispose: () => dispose.forEach((stop) => stop()) }
}

const selector = (tree, kind) => walk(tree, (node) => node.type === 'select' && node.props.id === `foggy-${kind}-version`)[0]
const card = (tree, kind) => walk(tree, (node) => node.key === kind && node.props.className === 'foggy-version-item')[0]
const action = (tree, kind) => walk(card(tree, kind), (node) => node.type === 'button')[0]

test('automatic release checks never install and choosing a version requires a user action', async () => {
  let automatic = 0
  let forced = 0
  const mounted = mount({
    async componentVersions() { automatic++; return { ok: true, value: catalog() } },
    async checkComponentVersions() { forced++; return { ok: true, value: catalog() } },
  })
  try {
    await tick()
    let tree = mounted.render()
    assert.equal(automatic, 1)
    assert.equal(forced, 0)
    assert.equal(mounted.choices.length, 0)
    assert.equal(mounted.intervalCalls, 1)
    assert.deepEqual(mounted.intervalDurations, [15 * 60 * 1000])
    assert.equal(selector(tree, 'launcher').props.value, '0.1.24')
    assert.equal(action(tree, 'launcher').props.disabled, true)
    assert.match(textOf(tree), /componentLatest.*0\.1\.46/)
    assert.match(textOf(tree), /componentPrerelease/)

    selector(tree, 'launcher').props.onChange({ target: { value: '0.1.46' } })
    tree = mounted.render()
    assert.equal(action(tree, 'launcher').props.disabled, false)
    assert.equal(textOf(action(tree, 'launcher')), 'componentDownloadUse')
    action(tree, 'launcher').props.onClick()
    assert.equal(mounted.choices[0].component, 'launcher')
    assert.equal(mounted.choices[0].version, '0.1.46')

    const check = walk(tree, (node) => node.type === 'button' && node.props.children === 'componentVersionsCheck')[0]
    await check.props.onClick()
    assert.equal(forced, 1)
    assert.equal(mounted.choices.length, 1)
  } finally { mounted.dispose() }
})

test('running Runtime blocks switching while release checking remains available', async () => {
  const mounted = mount({ componentVersions: async () => ({ ok: true, value: catalog() }) }, { status: { ...readyStatus, state: 'running', running: true } })
  try {
    await tick()
    let tree = mounted.render()
    selector(tree, 'launcher').props.onChange({ target: { value: '0.1.46' } })
    tree = mounted.render()
    assert.equal(action(tree, 'launcher').props.disabled, true)
    assert.equal(action(tree, 'launcher').props.title, 'componentStopFirst')
    assert.equal(walk(tree, (node) => node.type === 'button' && node.props.children === 'componentVersionsCheck')[0].props.disabled, false)
    assert.match(textOf(tree), /componentStopFirst/)
    assert.equal(mounted.choices.length, 0)
  } finally { mounted.dispose() }
})

test('offline checks preserve downloaded rollback versions and selection', async () => {
  const cached = catalog()
  cached.components.launcher.installedVersion = '0.1.46'
  cached.components.launcher.selectedVersion = '0.1.46'
  cached.error = 'Network request timed out'
  cached.warnings = ['Could not save Launcher download history. Check free space.']
  cached.stale = true
  const mounted = mount({
    componentVersions: async () => ({ ok: true, value: cached }),
    checkComponentVersions: async () => { throw new Error('offline') },
  }, { status: { ...readyStatus, components: { ...readyStatus.components, launcher: { installedVersion: '0.1.46' } } } })
  try {
    await tick()
    let tree = mounted.render()
    assert.match(textOf(tree), /componentVersionsOffline/)
    assert.match(textOf(tree), /componentVersionsWarning/)
    assert.match(textOf(tree), /Could not save Launcher download history/)
    selector(tree, 'launcher').props.onChange({ target: { value: '0.1.24' } })
    tree = mounted.render()
    assert.equal(textOf(action(tree, 'launcher')), 'componentUse')
    assert.equal(action(tree, 'launcher').props.disabled, false)
    const check = walk(tree, (node) => node.type === 'button' && node.props.children === 'componentVersionsCheck')[0]
    await check.props.onClick()
    tree = mounted.render()
    assert.equal(selector(tree, 'launcher').props.value, '0.1.24')
    assert.equal(action(tree, 'launcher').props.disabled, false)
    assert.match(textOf(tree), /componentVersionsOffline/)
    action(tree, 'launcher').props.onClick()
    assert.equal(mounted.choices[0].version, '0.1.24')
  } finally { mounted.dispose() }
})

test('incompatible releases cannot be activated and version input codecs stay strict', async () => {
  const mounted = mount({ componentVersions: async () => ({ ok: true, value: catalog() }) })
  try {
    await tick()
    let tree = mounted.render()
    selector(tree, 'launcher').props.onChange({ target: { value: '0.1.20' } })
    tree = mounted.render()
    assert.equal(action(tree, 'launcher').props.disabled, true)
    assert.match(textOf(tree), /Requires Launcher 0\.1\.24 or later/)
    assert.throws(() => mounted.codec.parse({ component: 'python', version: '3.12.13' }))
    assert.throws(() => mounted.codec.parse({ component: 'cli', version: '0.1.25', url: 'https://example.org' }))
    assert.throws(() => mounted.codec.parse({ component: 'cli', version: '../0.1.25' }))
    assert.equal(mounted.codec.parse({ component: 'cli', version: '0.1.25' }).version, '0.1.25')
    assert.match(textOf(mounted.progress({ kind: 'use-component-version', phase: 'preflight', state: 'running' }, (key) => key)), /componentVersionUpdating/)
    assert.match(textOf(mounted.progress({ kind: 'use-component-version', phase: 'complete', state: 'succeeded' }, (key) => key)), /componentVersionComplete/)
    assert.match(textOf(mounted.progress({ kind: 'initialize', phase: 'complete', state: 'succeeded' }, (key) => key)), /progressComplete/)
  } finally { mounted.dispose() }
})
