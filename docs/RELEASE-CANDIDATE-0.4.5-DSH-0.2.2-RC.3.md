# Foggy DeepSeek Harness plugin 0.4.5-rc.3

This candidate keeps the DeepSeek Harness `0.2.2-rc.3` compatibility target and
clarifies TLS certificate errors reported during component downloads.

An `SSLCertVerificationError` is now described as a certificate trust failure,
not a generic network connection failure. The message identifies the download
URL and advises checking the system clock, HTTPS inspection by proxies or
security software, and the trusted CA chain. For Python downloads it explains
that `SSL_CERT_FILE` can point to an organization-provided PEM certificate; for
Node.js downloads it mentions `NODE_EXTRA_CA_CERTS`. It explicitly says that
changing networks or using a VPN only helps when it avoids the problematic TLS
inspection, and that certificate verification should not be disabled.

Other DNS, timeout, and connection errors continue to show the sanitized
request URL, available failing host, and network error code. HTTP responses
continue to display their status separately.

The compatibility target remains DeepSeek Harness `0.2.2-rc.3`, with system
Node.js `>=24.9.0`, Java 17+, managed Python `3.12.13`, Launcher `0.1.46`, CLI
`0.1.25`, and Foggy Skills `0.1.18`.

Install the exact candidate in a clean Harness profile:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.5-rc.3
```

For the DSH `0.2.2-rc.3` channel, `@dsh022` points to this candidate after
publication.

## Verification

This document records the source change only. Do not treat the candidate as
accepted until package and compatibility checks are run on the target Harness
version and a clean Windows initialization confirms the diagnostic text.
