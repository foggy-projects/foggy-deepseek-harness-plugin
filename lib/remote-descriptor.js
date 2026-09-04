import { z } from 'zod'

const resultSchema = z.unknown()
const runtimeSettingsInputSchema = z.object({
  port: z.number().int().min(1024).max(65535),
}).strict()

function descriptor(method, parameters = []) {
  return {
    id: `@foggy-projects/deepseek-harness-plugin#foggyIntegration/${method}`,
    service: 'foggyIntegration',
    namespace: 'foggyIntegration',
    method,
    invocation: { kind: 'direct' },
    parameters,
    result: {
      mode: 'strict',
      typeSymbol: '@foggy-projects/deepseek-harness-plugin#FoggyIntegrationResult',
      schema: resultSchema,
    },
    sourceLocation: { file: 'lib/index.js', line: 1, column: 1 },
  }
}

export const descriptors = [
  descriptor('status'),
  descriptor('plan'),
  descriptor('initialize'),
  descriptor('repair'),
  descriptor('repairPython'),
  descriptor('runtimeStart'),
  descriptor('runtimeStop'),
  descriptor('saveRuntimeSettings', [{
    name: 'input',
    wire: 'input',
    source: 'json',
    codec: {
      mode: 'strict',
      typeSymbol: '@foggy-projects/deepseek-harness-plugin#FoggyRuntimeSettingsInput',
      schema: runtimeSettingsInputSchema,
    },
  }]),
]
