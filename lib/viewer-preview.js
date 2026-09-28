import { previewPayload, safeRuntimeUrl } from './query-tool.js'

const identifier = /^[A-Za-z0-9_.-]{1,128}$/

export async function createViewerPreview({ model, namespace, payload }, runtimeUrl, fetcher = fetch) {
  if (!identifier.test(model) || !identifier.test(namespace)) throw new Error('Invalid model or namespace')
  const origin = safeRuntimeUrl(runtimeUrl)
  const body = { model, namespace, title: `${model} · Harness preview`, payload: previewPayload(payload) }
  const response = await fetcher(`${origin}/data-viewer/api/query/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`DataViewer unavailable (HTTP ${response.status}); update and restart the managed Runtime`)
  const envelope = await response.json()
  const result = envelope?.data
  if (envelope?.code !== 200 || result?.success !== true || typeof result.viewerUrl !== 'string') {
    throw new Error(envelope?.msg || result?.error || 'DataViewer did not return a preview link')
  }
  const url = new URL(result.viewerUrl, origin)
  if (url.origin !== origin || !url.pathname.startsWith(`/data-viewer/view/${encodeURIComponent(model)}/`)
      || url.username || url.password || url.search || url.hash) {
    throw new Error('DataViewer returned an unexpected preview URL')
  }
  return { success: true, url: url.href, queryId: result.queryId }
}
