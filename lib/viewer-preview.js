import { randomUUID } from 'node:crypto'
import { previewPayload, safeRuntimeUrl } from './query-tool.js'

const identifier = /^[A-Za-z0-9_.-]{1,128}$/

/** Call the existing MCP connector through Harness's tool policy pipeline.
 * Its transport owns Authorization and X-NS; no credential enters the remote UI contract.
 */
export async function createViewerPreview({ model, namespace, payload }, tools, managedRuntime = null) {
  if (!identifier.test(model) || !identifier.test(namespace)) throw new Error('Invalid model or namespace')
  const matches = tools.schemas().filter(tool => /^mcp__.+__dataset_open_in_viewer(?:_[a-f0-9]+)?$/.test(tool.name))
  if (matches.length !== 1) throw new Error('Configure exactly one Foggy MCP connector with dataset.open_in_viewer')
  const outcome = await tools.execute({
    callId: randomUUID(), name: matches[0].name,
    arguments: { model, namespace, title: `${model} · Harness preview`, payload: previewPayload(payload) },
    signal: AbortSignal.timeout(30_000),
  })
  if (outcome.isError || !outcome.value) throw new Error('The authorized MCP viewer tool rejected this query')
  const value = outcome.value
  let result = value.structuredContent
  if (!result) {
    try { result = JSON.parse(value.content?.find(item => item.type === 'text')?.text || '') }
    catch { throw new Error('MCP viewer tool did not return a link') }
  }
  result = result?.data || result
  if (typeof result.viewerUrl !== 'string') throw new Error('MCP viewer tool did not return a link')
  const url = new URL(result.viewerUrl)
  safeRuntimeUrl(url.origin)
  if (url.username || url.password || url.search) throw new Error('MCP returned an unexpected viewer URL')
  if (url.pathname === '/data-viewer/open' && /^#[A-Za-z0-9_-]{43}$/.test(url.hash)) {
    return { success: true, url: url.href, queryId: result.queryId, authorizationMode: 'service' }
  }
  // The lite launcher's public development viewer uses an opaque query ID. It
  // does not carry service Authorization. Never accept that route for another
  // service or a protected host, and never request an anonymous fallback link.
  const local = managedRuntime?.securityMode === 'none-dev-test-only'
    ? new URL(safeRuntimeUrl(managedRuntime.runtimeUrl)) : null
  if (local && local.port === url.port && !url.hash
      && typeof result.queryId === 'string' && /^[a-f0-9]{32}$/i.test(result.queryId)
      && url.pathname === `/data-viewer/view/${encodeURIComponent(model)}/${result.queryId}`) {
    return { success: true, url: url.href, queryId: result.queryId, authorizationMode: 'local-development' }
  }
  throw new Error('MCP returned an unsupported viewer link. Protected services require a grant-authorized preview; local development links must match the running managed Runtime.')
}
