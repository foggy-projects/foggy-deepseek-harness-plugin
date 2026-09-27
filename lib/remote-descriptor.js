import { z } from 'zod'

const resultSchema = z.unknown()
const runtimeSettingsInputSchema = z.object({
  port: z.number().int().min(1024).max(65535),
}).strict()
const viewerPreviewInputSchema = z.object({
  model: z.string(),
  namespace: z.string(),
  payload: z.record(z.string(), z.unknown()),
}).strict()

function strictCodec(typeSymbol, schema) {
  return {
    mode: 'strict',
    typeSymbol,
    // DSH 0.1.5 consumes `schema`; DSH 0.1.7 materializes it through `create()`.
    schema,
    create: () => schema,
  }
}

function descriptor(method, parameters = []) {
  return {
    id: `@foggy-projects/deepseek-harness-plugin#foggyIntegration/${method}`,
    service: 'foggyIntegration',
    namespace: 'foggyIntegration',
    method,
    invocation: { kind: 'direct' },
    parameters,
    result: strictCodec('@foggy-projects/deepseek-harness-plugin#FoggyIntegrationResult', resultSchema),
    sourceLocation: { file: 'lib/index.js', line: 1, column: 1 },
  }
}

export const descriptors = [
  descriptor('status'),
  descriptor('plan'),
  descriptor('initialize'),
  descriptor('initializeAndStart'),
  descriptor('repair'),
  descriptor('updateComponents'),
  descriptor('repairPython'),
  descriptor('repairSemanticQuerySkill'),
  descriptor('runtimeStart'),
  descriptor('runtimeStop'),
  descriptor('saveRuntimeSettings', [{
    name: 'input',
    wire: 'input',
    source: 'json',
    codec: strictCodec('@foggy-projects/deepseek-harness-plugin#FoggyRuntimeSettingsInput', runtimeSettingsInputSchema),
  }]),
  descriptor('createViewerPreview', [{
    name: 'input',
    wire: 'input',
    source: 'json',
    codec: strictCodec('@foggy-projects/deepseek-harness-plugin#FoggyViewerPreviewInput', viewerPreviewInputSchema),
  }]),
]
