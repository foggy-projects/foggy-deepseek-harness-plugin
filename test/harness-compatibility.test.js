import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

// Release acceptance uses a separate published DSH installation; it must not
// change the user's web profile or start a web server.
const compatibilityRoot = process.env.FOGGY_DSH_COMPAT_ROOT
const acceptance = { skip: !compatibilityRoot && 'Set FOGGY_DSH_COMPAT_ROOT to the isolated DSH 0.2.0-rc.2 installation' }
const modulePath = (name, file = 'lib/index.js') => join(compatibilityRoot, 'node_modules', ...name.split('/'), file)
const load = (name, file) => import(pathToFileURL(modulePath(name, file)).href)

test('the packed gateway loads against actual DSH 0.2.0 remote and skill services', acceptance, async () => {
  for (const name of ['@deepseek-ai/dsh', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/dsh-skill']) {
    const pkg = JSON.parse(await readFile(modulePath(name, 'package.json'), 'utf8'))
    assert.equal(pkg.version, '0.2.0-rc.2', name)
  }
  const { FoggyIntegrationGateway } = await load('@foggy-projects/deepseek-harness-plugin')
  const { TypertRemoteService } = await load('@deepseek-ai/dsh-typert-protocol')
  assert.equal(Object.getPrototypeOf(FoggyIntegrationGateway), TypertRemoteService)
  const { TYPERT_REMOTE } = await load('@foggy-projects/deepseek-harness-plugin', 'lib/remote.js')
  const descriptor = TYPERT_REMOTE.descriptors.find(item => item.method === 'createViewerPreview')
  assert.equal(typeof descriptor.parameters[0].codec.create().parse, 'function')
  assert.deepEqual(descriptor.parameters[0].codec.create().parse({
    model: 'OrderQueryModel', namespace: 'demo', payload: { columns: ['orderCount'] },
  }), { model: 'OrderQueryModel', namespace: 'demo', payload: { columns: ['orderCount'] } })
})

test('actual DSH tool runtime dispatches viewer requests and honors a policy denial', acceptance, async () => {
  const { Context } = await load('@deepseek-ai/cordis')
  const { ToolRuntime } = await load('@deepseek-ai/dsh-tools')
  const { createMcpToolDefinition } = await load('@deepseek-ai/dsh-mcp-client')
  const { createViewerPreview } = await load('@foggy-projects/deepseek-harness-plugin', 'lib/viewer-preview.js')
  const ctx = new Context()
  ctx.provide('systemPrompt', { tools: () => () => {} })
  await ctx.fiber.await()
  const tools = new ToolRuntime(ctx)
  let dispatched = 0
  tools.register(createMcpToolDefinition(ctx, {
    name: 'mcp__foggy_demo__dataset_open_in_viewer_123456abcdef',
    rawName: 'dataset.open_in_viewer',
    description: 'Synthetic MCP connector; transport credentials remain private.',
    inputSchema: { type: 'object', properties: { model: { type: 'string' }, namespace: { type: 'string' }, title: { type: 'string' }, payload: { type: 'object', additionalProperties: true } }, required: ['model', 'namespace', 'payload'] },
    async call(args) {
      dispatched++
      assert.equal(args.payload.limit, undefined)
      assert.equal(args.payload.slice[0].field, 'businessDate')
      assert.equal(args.payload.having[0].field, 'orderCount')
      assert.equal('Authorization' in args, false)
      return { content: [], structuredContent: { viewerUrl: 'http://127.0.0.1:18166/data-viewer/open#' + 'a'.repeat(43), queryId: 'synthetic' } }
    },
  }))
  const input = { model: 'OrderQueryModel', namespace: 'demo', payload: { columns: ['orderCount'], slice: [{ field: 'businessDate', op: '=', value: '2026-09-26' }], having: [{ field: 'orderCount', op: '[]', value: [1, 2] }], limit: 10 } }
  try {
    const result = await createViewerPreview(input, tools)
    assert.equal(result.queryId, 'synthetic')
    assert.equal(dispatched, 1)
    tools.guard(() => 'Synthetic acceptance denial')
    await assert.rejects(() => createViewerPreview(input, tools), /rejected/)
    assert.equal(dispatched, 1)
  } finally {
    await ctx.fiber.dispose()
  }
})

test('DSH 0.2.0 keeps the completed-turn and query-source client contracts', acceptance, async () => {
  const slots = await readFile(modulePath('@deepseek-ai/dsh-client-ui-chat', 'lib/types/client/contract/slots.d.ts'), 'utf8')
  const snapshot = await readFile(modulePath('@deepseek-ai/dsh-client-ui-chat', 'lib/types/client/contract/snapshot.d.ts'), 'utf8')
  const nodes = await readFile(modulePath('@deepseek-ai/dsh-client-ui-chat', 'lib/types/client/contract/chat-nodes.d.ts'), 'utf8')
  const toolNodes = await readFile(modulePath('@deepseek-ai/dsh-client-ui-chat', 'lib/types/client/conversation-nodes/tool.d.ts'), 'utf8')
  assert.match(slots, /'conversation\.chat\.turnTail'/)
  assert.match(snapshot, /turnDataSource<Kind extends ChatNodeKind>\(turn: number, kind: Kind\)/)
  assert.match(nodes, /readonly root: ToolCallBlock/)
  assert.match(toolNodes, /'tool-call': ToolChatData/)
})
