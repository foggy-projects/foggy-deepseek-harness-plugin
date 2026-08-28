import { z } from 'zod'

const resultSchema = z.unknown()

function descriptor(method) {
  return {
    id: `@foggy-projects/deepseek-harness-plugin#foggyIntegration/${method}`,
    service: 'foggyIntegration',
    namespace: 'foggyIntegration',
    method,
    invocation: { kind: 'direct' },
    parameters: [],
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
  descriptor('runtimeStart'),
  descriptor('runtimeStop'),
]
