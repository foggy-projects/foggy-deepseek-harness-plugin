import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const t = (key) => key
const result = { execution: { success: true, data: { items: [{ orderCount: 7 }] } } }

function clientQueryComponents() {
  let plugin
  let preview = null
  const openedUrls = []
  const element = (type, props, key) => ({ type, props, key })
  runInNewContext(source.replace('exports.NS = NS', 'exports.testQueries = { queryPreviewSupported, FoggyQueryCard, FoggyTurnQuery, useViewerPreview }; exports.NS = NS'), {
    window: { open: () => ({ location: { replace: (url) => openedUrls.push(url) }, close() {} }), __ModuleLoader__: { load({ factory }) {
      plugin = factory((specifier) => {
        if (specifier === 'react/jsx-runtime') return { jsx: element, jsxs: element }
        if (specifier === 'react') return {
          useState: (initial) => {
            if (typeof initial === 'boolean') return [true, () => {}]
            if (initial && typeof initial === 'object' && 'loading' in initial) {
              preview ??= initial
              return [preview, (next) => { preview = typeof next === 'function' ? next(preview) : next }]
            }
            return [initial, () => {}]
          },
          useCallback: (callback) => callback, useEffect() {},
        }
        throw new Error(`Unexpected client dependency: ${specifier}`)
      })
    } } },
    document: { querySelector: () => ({}) },
  })
  return { ...plugin.testQueries, currentPreview: () => preview, openedUrls }
}
function text(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node !== 'object') return String(node)
  return [node.props?.children].flat(Infinity).map(text).join(' ')
}
function buttons(node) {
  if (!node || typeof node !== 'object') return []
  return [...(node.type === 'button' ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(buttons)]
}
function renderQueries(ui, payload) {
  const args = { model: 'OrderQueryModel', namespace: 'demo', payload }
  const block = { call: { argsRaw: JSON.stringify(args) }, content: [{ type: 'text', text: JSON.stringify(result) }] }
  return [
    ui.FoggyQueryCard({ phase: 'result', block, api: {}, t }),
    ui.FoggyTurnQuery({ query: { args, result }, api: {}, t }),
  ]
}

test('unfiltered queries retain their successful results and explain the Viewer filter requirement', () => {
  const ui = clientQueryComponents()
  for (const payload of [{ columns: ['orderCount'] }, { columns: ['orderCount'], slice: [] }]) {
    const original = JSON.stringify(payload)
    assert.equal(ui.queryPreviewSupported({ payload }, result), false)
    const [toolCard, completedTurn] = renderQueries(ui, payload)
    assert.match(text(toolCard), /queryCardDone/)
    assert.match(text(toolCard), /queryCardRows 1/)
    assert.match(text(completedTurn), /7/)
    for (const view of [toolCard, completedTurn]) {
      assert.match(text(view), /queryCardFilterRequired/)
      assert.equal(buttons(view).some((button) => button.props.children === 'queryCardOpen'), false)
    }
    assert.equal(JSON.stringify(payload), original)
  }
})

test('filtered ordinary queries expose Viewer while other unsupported query shapes retain a general hint', () => {
  const ui = clientQueryComponents()
  const payload = { columns: ['orderCount'], slice: [{ field: 'businessDate', op: '=', value: '2026-10-27' }] }
  assert.equal(ui.queryPreviewSupported({ payload }, result), true)
  for (const view of renderQueries(ui, payload)) {
    assert.equal(buttons(view).some((button) => button.props.children === 'queryCardOpen'), true)
    assert.doesNotMatch(text(view), /queryCardFilterRequired/)
  }
  for (const view of renderQueries(ui, { ...payload, route: 'DSL_CTE' })) {
    assert.match(text(view), /queryCardUnsupported/)
    assert.doesNotMatch(text(view), /queryCardFilterRequired/)
    assert.equal(buttons(view).some((button) => button.props.children === 'queryCardOpen'), false)
  }
})

test('local development Viewer responses show the authorization notice only after a successful open', async () => {
  const ui = clientQueryComponents()
  const payload = { columns: ['orderCount'], slice: [{ field: 'businessDate', op: '=', value: '2026-10-27' }] }
  const args = { model: 'OrderQueryModel', namespace: 'demo', payload }
  for (const view of renderQueries(ui, payload)) assert.doesNotMatch(text(view), /queryCardLocalDevelopment/)
  const hook = ui.useViewerPreview({
    createViewerPreview: async () => ({ ok: true, value: { url: 'http://127.0.0.1:18166/data-viewer/view/OrderQueryModel/' + 'a'.repeat(32), authorizationMode: 'local-development' } }),
  })
  await hook.openViewer(args)
  assert.equal(ui.openedUrls.length, 1)
  assert.equal(ui.currentPreview().authorizationMode, 'local-development')
  for (const view of renderQueries(ui, payload)) assert.match(text(view), /queryCardLocalDevelopment/)

  await ui.useViewerPreview({ createViewerPreview: async () => { throw new Error('Protected preview unavailable') } }).openViewer(args)
  assert.equal(ui.currentPreview().authorizationMode, null)
  for (const view of renderQueries(ui, payload)) {
    assert.doesNotMatch(text(view), /queryCardLocalDevelopment/)
    assert.match(text(view), /Protected preview unavailable/)
  }
})

test('service-scoped Viewer responses preserve their existing preview messages', async () => {
  const ui = clientQueryComponents()
  const payload = { columns: ['orderCount'], slice: [{ field: 'businessDate', op: '=', value: '2026-10-27' }] }
  await ui.useViewerPreview({ createViewerPreview: async () => ({ ok: true, value: { url: 'http://127.0.0.1:18166/data-viewer/open#' + 'a'.repeat(43), authorizationMode: 'service' } }) }).openViewer({ model: 'OrderQueryModel', namespace: 'demo', payload })
  assert.equal(ui.currentPreview().authorizationMode, 'service')
  for (const view of renderQueries(ui, payload)) assert.doesNotMatch(text(view), /queryCardLocalDevelopment/)
  assert.match(text(renderQueries(ui, payload)[0]), /queryCardPreviewHint/)
})
