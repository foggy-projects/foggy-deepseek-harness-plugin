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
const componentVersionInputSchema = z.object({
  component: z.enum(['launcher', 'cli']),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/).max(80),
}).strict()

function strictCodec(typeSymbol, schema) {
  return {
    mode: 'strict',
    typeSymbol,
    // Legacy DSH consumes `schema`; DSH 0.2.0 materializes it through `create()`.
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
  descriptor('componentVersions'),
  descriptor('checkComponentVersions'),
  descriptor('useComponentVersion', [{
    name: 'input', wire: 'input', source: 'json',
    codec: strictCodec('@foggy-projects/deepseek-harness-plugin#FoggyComponentVersionInput', componentVersionInputSchema),
  }]),
  descriptor('repairPython'),
  descriptor('repairCli'),
  descriptor('repairLauncher'),
  descriptor('repairAnalysisSkill'),
  descriptor('repairSemanticQuerySkill'),
  descriptor('migrateProfiles'),
  descriptor('diagnostics'),
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
