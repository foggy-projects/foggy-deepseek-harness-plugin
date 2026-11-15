export function safeNetworkUrl(value) {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return String(value).replace(/[?#].*$/, '')
  }
}

function parsedHost(value) {
  if (typeof value !== 'string' || !value) return null
  try { return new URL(value.includes('://') ? value : `https://${value}`).hostname } catch { return null }
}

function networkDetails(error) {
  const seen = new Set()
  let current = error
  let code = null
  let host = null
  let certificateVerification = false
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const candidateCode = current.code ?? current.errno
    if (!code && (typeof candidateCode === 'string' || typeof candidateCode === 'number')) {
      code = String(candidateCode).slice(0, 80)
    }
    if (/SSLCertVerificationError|CERTIFICATE_VERIFY|CERT_HAS_EXPIRED|SELF_SIGNED_CERT|UNABLE_TO_VERIFY|ERR_TLS_CERT_ALTNAME_INVALID|self[- ]signed|certificate.*(?:verify|chain|expired|authority|altname)|unable to verify/i.test(`${current.name ?? ''} ${current.code ?? ''} ${current.message ?? ''}`)) {
      certificateVerification = true
    }
    if (!host) host = parsedHost(current.hostname) ?? parsedHost(current.host)
    if (!host && typeof current.message === 'string') {
      host = current.message.match(/(?:ENOTFOUND|getaddrinfo|name or service not known)\s+([a-z0-9.-]+\.[a-z]{2,})/i)?.[1] ?? null
    }
    current = current.cause
  }
  if (!code && error?.name === 'AbortError') code = 'TIMEOUT'
  return { code: code ?? 'FETCH_FAILED', host, certificateVerification }
}

export function networkFailureMessage(action, value, error) {
  const target = safeNetworkUrl(value)
  const targetHost = parsedHost(target)
  const { code, host, certificateVerification } = networkDetails(error)
  const failedHost = host ?? targetHost ?? 'the requested host'
  const redirect = host && targetHost && host !== targetHost
    ? `检测到连接失败主机：${host}。`
    : ''
  if (certificateVerification) {
    return `${action}失败。请求地址：${target}。${redirect}HTTPS 证书校验失败（${code}）：客户端收到了证书，但无法验证证书链。请检查系统日期/时间，以及代理或杀毒软件是否在检查 HTTPS；需要时将可信根证书正确加入系统证书库，Node.js 也可用 NODE_EXTRA_CA_CERTS 指定 PEM 证书。只有切换网络/VPN 能避开错误的 HTTPS 检查时才有帮助；不要关闭证书校验。`
  }
  return `${action}失败。请求地址：${target}。${redirect}网络错误码：${code}。请检查网络、代理和防火墙是否允许访问 ${failedHost}；如果当前网络限制 GitHub，可能需要配置代理/VPN 或切换到可访问该域名的网络。`
}

export function httpFailureMessage(action, value, status) {
  const target = safeNetworkUrl(value)
  const host = parsedHost(target) ?? 'the requested host'
  const advice = status === 403 || status === 429
    ? '服务端拒绝访问或触发了限流，请稍后重试并检查访问策略。只有当前网络限制该域名时，才需要代理/VPN。'
    : '网络已连接到服务端；请检查链接和发布资源状态。若该网络有访问限制，再检查代理/VPN 设置。'
  return `${action}失败，服务器返回 HTTP ${status}。请求地址：${target}。${advice}（${host}）`
}
