import assert from 'node:assert/strict'
import test from 'node:test'
import { createViewerPreview } from '../lib/viewer-preview.js'
import { assertStandardDsl, createFoggyQueryTool, previewPayload, safeRuntimeUrl } from '../lib/query-tool.js'

test('registers a plain Harness tool without a private tool-runtime dependency', () => {
  const tool = createFoggyQueryTool({})
  assert.equal(tool.name, 'foggy_query')
  assert.deepEqual(tool.parameters.required, ['model', 'namespace', 'payload'])
  assert.deepEqual(tool.output.schema.required, ['model', 'namespace', 'validation', 'execution'])
  assert.equal(typeof tool.execute, 'function')
  assert.equal(typeof tool.output.render, 'function')
})

test('accepts only standard DSL and drops pagination from a preview', () => {
  const payload = { columns: ['orderStatus', 'orderCount'], slice: [{ field: 'year', op: '=', value: 2024 }], limit: 20 }
  assert.deepEqual(previewPayload(payload), { columns: payload.columns, slice: payload.slice })
  assert.throws(() => assertStandardDsl({ ...payload, route: 'DSL_CTE' }), /CTE/)
  assert.deepEqual(previewPayload({ ...payload, having: [] }).having, [])
  assert.deepEqual(previewPayload({ ...payload, groupBy: ['orderStatus'], orderBy: ['orderStatus', '-orderCount', 'year desc'] }), {
    columns: payload.columns,
    slice: payload.slice,
    groupBy: [{ field: 'orderStatus' }],
    orderBy: [{ field: 'orderStatus', dir: 'asc' }, { field: 'orderCount', dir: 'desc' }, { field: 'year', dir: 'desc' }],
  })
  assert.throws(() => previewPayload({ ...payload, groupBy: [42] }), /groupBy entries/)
})

test('reuses the configured MCP connector, policy pipeline and having context', async () => {
  const input = { model: 'OrderQueryModel', namespace: 'demo', payload: { columns: ['orderCount'], having: [{ field: 'orderCount', op: '[]', value: [1,2] }], limit: 10 } }
  let calls = 0
  const tools = {
    schemas: () => [{ name: 'mcp__foggy_demo__dataset_open_in_viewer_ab1234' }],
    execute: async (call) => {
      calls++
      assert.equal(call.name, 'mcp__foggy_demo__dataset_open_in_viewer_ab1234')
      assert.equal(call.arguments.payload.limit, undefined)
      assert.deepEqual(call.arguments.payload.having, input.payload.having)
      assert.equal(call.arguments.namespace, 'demo')
      assert.equal(JSON.stringify(call.arguments).includes('Authorization'), false)
      return { isError: false, value: { content: [{ type: 'text', text: JSON.stringify({ viewerUrl: 'http://127.0.0.1:18172/data-viewer/open#' + 'a'.repeat(43), queryId: 'abc' }) }] } }
    },
  }
  const result = await createViewerPreview(input, tools)
  assert.equal(calls, 1)
  assert.match(result.url, /^http:\/\/127.0.0.1:18172\/data-viewer\/open#/)
  await assert.rejects(() => createViewerPreview(input, { ...tools, schemas: () => [] }), /exactly one/)
  await assert.rejects(() => createViewerPreview(input, { ...tools, schemas: () => [...tools.schemas(), ...tools.schemas()] }), /exactly one/)
  await assert.rejects(() => createViewerPreview(input, { ...tools, execute: async () => ({ isError: true }) }), /rejected/)
  await assert.rejects(() => createViewerPreview(input, { ...tools, execute: async () => ({ value: { structuredContent: { viewerUrl: 'https://evil.example/' } } }) }), /loopback/)
})
