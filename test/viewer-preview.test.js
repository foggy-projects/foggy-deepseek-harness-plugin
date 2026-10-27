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
  assert.throws(() => previewPayload({ columns: ['orderCount'] }), /at least one slice filter/)
  assert.throws(() => previewPayload({ columns: ['orderCount'], slice: [] }), /at least one slice filter/)
})

test('reuses the configured MCP connector, policy pipeline and having context', async () => {
  const input = { model: 'OrderQueryModel', namespace: 'demo', payload: { columns: ['orderCount'], slice: [{ field: 'year', op: '=', value: 2026 }], having: [{ field: 'orderCount', op: '[]', value: [1,2] }], limit: 10 } }
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

test('legacy development links require the running managed Runtime context and never replace protected previews', async () => {
  const queryId = 'b'.repeat(32)
  const input = { model: 'OrderQueryModel', namespace: 'demo', payload: { columns: ['orderCount'], slice: [{ field: 'year', op: '=', value: 2026 }] } }
  const tools = {
    schemas: () => [{ name: 'mcp__foggy__dataset_open_in_viewer' }],
    execute: async () => ({ value: { structuredContent: { viewerUrl: `http://localhost:18166/data-viewer/view/OrderQueryModel/${queryId}`, queryId } } }),
  }
  const local = { runtimeUrl: 'http://127.0.0.1:18166', securityMode: 'none-dev-test-only' }
  const result = await createViewerPreview(input, tools, local)
  assert.equal(result.authorizationMode, 'local-development')
  await assert.rejects(createViewerPreview(input, tools), /grant-authorized preview/)
  await assert.rejects(createViewerPreview(input, tools, { ...local, securityMode: 'auth-code' }), /grant-authorized preview/)
  await assert.rejects(createViewerPreview(input, tools, { ...local, runtimeUrl: 'http://127.0.0.1:18167' }), /match the running/)
  const wrongModel = { ...tools, execute: async () => ({ value: { structuredContent: { viewerUrl: `http://localhost:18166/data-viewer/view/OtherModel/${queryId}`, queryId } } }) }
  await assert.rejects(createViewerPreview(input, wrongModel, local), /match the running/)
  const wrongId = { ...tools, execute: async () => ({ value: { structuredContent: { viewerUrl: `http://localhost:18166/data-viewer/view/OrderQueryModel/${queryId}`, queryId: 'c'.repeat(32) } } }) }
  await assert.rejects(createViewerPreview(input, wrongId, local), /match the running/)
})
