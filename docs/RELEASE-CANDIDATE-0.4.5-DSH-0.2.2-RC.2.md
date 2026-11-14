# Foggy DeepSeek Harness plugin 0.4.5-rc.2

This follow-up candidate keeps the DeepSeek Harness `0.2.2-rc.3` compatibility
target and adds actionable network diagnostics for initialization and component
release checks. It supersedes `0.4.5-rc.1` for users who need help diagnosing
download failures.

Managed Python downloads now report the sanitized asset URL, the network error
code, and the failing redirect host when the HTTP client exposes it. Launcher,
CLI, and Skills downloads report the requested URL and any redirected HTTP
error URL. Version-check failures identify the GitHub API or release asset
address. HTTP status errors are distinct from DNS, timeout, TLS, and connection
failures. Error messages explain when proxy/VPN settings may help; they do not
present a VPN as a universal fix. URL credentials, query strings, and fragments
are removed from displayed diagnostics.

The compatibility target remains DeepSeek Harness `0.2.2-rc.3`, with system
Node.js `>=24.9.0`, Java 17+, managed Python `3.12.13`, Launcher `0.1.46`, CLI
`0.1.25`, and Foggy Skills `0.1.18`.

Install the packed candidate in a clean Harness profile:

```powershell
dsh plugin --profile web add --workspace-root ./foggy-projects-deepseek-harness-plugin-0.4.5-rc.2.tgz
```

Or install the exact npm candidate:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.5-rc.2
```

For the DSH `0.2.2-rc.3` compatibility channel, `@dsh022` points to this
candidate after publication.

## Verification

This document records the source change only. Do not treat the candidate as
accepted until package and compatibility checks are run on the target Harness
version and a clean Windows initialization confirms the new diagnostic text.
