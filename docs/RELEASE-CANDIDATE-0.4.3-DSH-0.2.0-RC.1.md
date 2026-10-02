# Foggy DeepSeek Harness plugin 0.4.3-rc.1

This pre-release targets the published DeepSeek Harness `0.2.0-rc.2`.
Npm publication uses the dedicated `dsh020` channel; `latest`, `beta`, `rc`, `dsh015`,
and `dsh017` remain unchanged. GitHub release assets can be installed directly
without relying on the npm channel.

## Changes since 0.4.2-rc.5

- Result-card **View data** uses the configured Foggy MCP connector's
  `dataset.open_in_viewer` tool through Harness's tool policy pipeline.
  The connector keeps its configured authorization headers; browser-side
  inputs contain the model, namespace, and query DSL. Missing or ambiguous
  connectors and policy denials fail without an anonymous HTTP fallback.
- The assistant's explicit open-view tool and the card entry share the same
  service authorization scope. The web view opens without an extra login form.
- Explicit `having` conditions remain in the card/viewer DSL alongside
  detail-level `slice`; the plugin does not convert one into the other.
- Pin CLI and Launcher `0.1.24`. The Launcher stores viewer links in SQLite by
  default, with configurable link lifetime (no expiry by default) and a
  separately configurable browser-session lifetime (one day by default).
  Existing URLs may also be revoked. The page re-executes the saved query and
  follows its service authorization scope; it is not a frozen result snapshot.
- Update DSH peer requirements and the Linux experience entry to `0.2.0-rc.2`.
  Private Python stays on `3.12.13` and both Foggy Skills stay on their latest
  published `0.1.18` release. Managed component updates remain explicit.

## Install and upgrade

Use Node.js 24+ and Java 17+. With the `0.2.0-rc.2` DSH command installed:

```powershell
dsh --version
dsh plugin --profile web add --workspace-root ./foggy-projects-deepseek-harness-plugin-0.4.3-rc.1.tgz
```

After npm publication, the equivalent exact-version installation is:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.3-rc.1
```

The pinned launcher command can also be selected without changing a global DSH
installation:

```powershell
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add --workspace-root ./foggy-projects-deepseek-harness-plugin-0.4.3-rc.1.tgz
```

Restart the Harness web process after the package upgrade. In **Settings →
Built-in plugins → Foggy Data Analysis**, confirm plugin `0.4.3-rc.1`, then stop the
managed Runtime and choose **Update components** before starting it again.
The page reports installed and target component versions. Plugin installation
does not replace or restart an already-running Runtime.

Configure exactly one Foggy MCP connector exposing `dataset.open_in_viewer`.
Keep its authorization headers in the private connector configuration. Neither
the video screenshots nor the public release evidence should show launch
tokens, viewer-link fragments, cookies, or credentials.

## Acceptance evidence

Windows API/package acceptance on 2026-10-02 uses Node.js `24.19.0` and a
separate npm installation of DSH `0.2.0-rc.2`; it does not modify the user's
Harness profile or launch a web server. The packed gateway loads against the
actual DSH Typert and Skill services. The actual DSH tool runtime successfully
dispatches a synthetic MCP viewer call and blocks it under an explicit policy
denial. Client contracts retain `conversation.chat.turnTail`, `turnDataSource`,
and tool-root records. The completed-turn card rendering regression and the
onboarding regression remain part of the full test gate.

The additional API acceptance gate is repeatable with:

```powershell
$env:FOGGY_DSH_COMPAT_ROOT = '<isolated installation containing DSH and the packed plugin>'
npm run check
npm test
```

Without this environment variable the three isolated API tests are reported as
skipped. Release acceptance must set it. Browser UI and real-data acceptance is
a separate post-publication check; passing an API/package test is not a claim
that a native Windows screenshot or real model query has already been verified.

## Authorization review boundary

The two viewer entry points inherit the MCP connector's service authorization.
The native `foggy_query` tool still validates and executes through the managed
CLI. Its Runtime authorization is configured separately, for example through
`FOGGY_RUNTIME_AUTHORIZATION`; this release does not extract MCP headers for
native CLI queries. A restricted-service demonstration must verify the actual
query tool and its matching authorization, then generate the viewer through
that service's MCP connector. This is service authorization, not a personal
login or a unified authorization protocol. The release review verifies the
MCP adapter and tool-policy denial without claiming that all query entry points
automatically share one identity.
