import { open } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const DEFAULT_MAX_BYTES = 32 * 1024
const DEFAULT_MAX_LINES = 120
const ANSI_ESCAPE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g
const BEARER_SECRET = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi
const API_KEY_SECRET = /\bsk-[A-Za-z0-9._-]{12,}/g
const JDBC_URL = /\bjdbc:[^\s"'<>]+/gi
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi
const SENSITIVE_QUERY_VALUE = /([?&](?:password|passwd|pwd|secret|token|api[_-]?key|auth[_-]?code)=)[^&#\s]*/gi
const SENSITIVE_ASSIGNMENT = /\b([A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|auth[_-]?code)[A-Za-z0-9_.-]*)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi

export function sanitizeDiagnosticText(value) {
  return String(value ?? '')
    .replace(ANSI_ESCAPE, '')
    .replace(BEARER_SECRET, 'Bearer [REDACTED]')
    .replace(API_KEY_SECRET, '[REDACTED_API_KEY]')
    .replace(JDBC_URL, 'jdbc:[REDACTED_CONNECTION_URL]')
    .replace(URL_CREDENTIALS, '$1[REDACTED]@')
    .replace(SENSITIVE_QUERY_VALUE, '$1[REDACTED]')
    .replace(SENSITIVE_ASSIGNMENT, '$1$2[REDACTED]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}

function isInside(root, candidate) {
  const value = relative(resolve(root), resolve(candidate))
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value)
}

export async function readDiagnosticLogTail(path, {
  allowedRoot,
  maxBytes = DEFAULT_MAX_BYTES,
  maxLines = DEFAULT_MAX_LINES,
} = {}) {
  if (!path || !allowedRoot || !isInside(allowedRoot, path)) {
    return { sanitizedTail: '', tailTruncated: false, tailError: 'LOG_PATH_OUTSIDE_RUNTIME_ROOT' }
  }

  let handle
  try {
    handle = await open(path, 'r')
    const details = await handle.stat()
    const bytesToRead = Math.min(details.size, maxBytes)
    const buffer = Buffer.alloc(bytesToRead)
    if (bytesToRead > 0) await handle.read(buffer, 0, bytesToRead, details.size - bytesToRead)
    let text = buffer.toString('utf8')
    let truncated = details.size > bytesToRead
    if (truncated) {
      const firstLineEnd = text.indexOf('\n')
      if (firstLineEnd >= 0) text = text.slice(firstLineEnd + 1)
    }
    const lines = text.split(/\r?\n/)
    if (lines.length > maxLines) {
      text = lines.slice(-maxLines).join('\n')
      truncated = true
    }
    return {
      sanitizedTail: sanitizeDiagnosticText(text).trim(),
      tailTruncated: truncated,
      tailBytesRead: bytesToRead,
    }
  } catch (error) {
    return {
      sanitizedTail: '',
      tailTruncated: false,
      tailError: error?.code || 'LOG_READ_FAILED',
    }
  } finally {
    await handle?.close()
  }
}

export async function enrichRuntimeStartFailure(failure, dataRoot) {
  if (!failure || typeof failure !== 'object') return failure
  const runtimeRoot = join(dataRoot, 'runtime')
  const logs = Array.isArray(failure.logs)
    ? await Promise.all(failure.logs.map(async (entry) => ({
        ...entry,
        ...(entry?.exists && entry?.path
          ? await readDiagnosticLogTail(entry.path, { allowedRoot: runtimeRoot })
          : {}),
      })))
    : []
  return { ...failure, logs }
}
