import assert from 'node:assert/strict'
import test from 'node:test'
import { createViewerPreview } from '../lib/viewer-preview.js'
import { assertStandardDsl, previewPayload, safeRuntimeUrl } from '../lib/query-tool.js'

test('accepts only standard DSL and drops pagination from a preview', () => {
  const payload = { columns: ['orderStatus', 'orderCount'], slice: [{ field: 'year', op: '=', value: 2024 }], limit: 20 }
  assert.deepEqual(previewPayload(payload), { columns: payload.columns, slice: payload.slice })
  assert.throws(() => assertStandardDsl({ ...payload, route: 'DSL_CTE' }), /CTE/)
  assert.throws(() => previewPayload({ ...payload, having: [] }), /does not support: having/)
  assert.throws(() => previewPayload({ ...payload, groupBy: ['orderStatus'] }), /object-form groupBy/)
})

test('creates a link only when explicitly called and verifies the returned origin', async () => {
  let calls = 0
  const input = { model: 'OrderQueryModel', namespace: 'demo', payload: { columns: ['orderCount'], limit: 10 } }
  const response = await createViewerPreview(input, 'http://127.0.0.1:18166', async (url, options) => {
    calls++
    assert.equal(url, 'http://127.0.0.1:18166/data-viewer/api/query/create')
    assert.equal(JSON.parse(options.body).payload.limit, undefined)
    return { ok: true, json: async () => ({ code: 200, data: { success: true, queryId: 'abc', viewerUrl: '/data-viewer/view/OrderQueryModel/abc' } }) }
  })
  assert.equal(calls, 1)
  assert.equal(response.url, 'http://127.0.0.1:18166/data-viewer/view/OrderQueryModel/abc')
  await assert.rejects(() => createViewerPreview(input, 'http://127.0.0.1:18166', async () => ({
    ok: true, json: async () => ({ code: 200, data: { success: true, viewerUrl: 'https://evil.example/' } }),
  })), /unexpected preview URL/)
  assert.throws(() => safeRuntimeUrl('http://192.168.2.227:18166'), /loopback/)
})
