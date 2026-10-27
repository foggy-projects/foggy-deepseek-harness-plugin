# Foggy DeepSeek Harness plugin 0.4.4-rc.1

This candidate adds Launcher/CLI version selection and targets the published
DeepSeek Harness `0.2.1-rc.2` (`latest`). The `0.2.1-rc.4` (`next`) SDK is also
included in compatibility acceptance. Node.js 24+ and Java 17+ are required.

The settings page also provides a **Tutorial** link to
[ai-data.qlfloor.com](https://ai-data.qlfloor.com/) in its documentation section.

Native-host acceptance also fixed start/stop commands when download caches are
configured, completed the host's existing repair/diagnostics remote descriptors,
and ensured settings keep polling when operation completion races with status
probes. The current page refreshes to the new Runtime/component state without
requiring the user to close and reopen settings.

Bash entrypoints are normalized to LF and protected by `.gitattributes` so a
Windows-built npm package executes correctly on Linux and WSL2.

## Component versions

The Foggy settings page checks the fixed official GitHub repositories when
opened and every six hours while open. **Check for updates** forces a refresh.
It distinguishes installed versions, upstream latest versions, and the defaults
validated with this plugin. Prereleases are labeled. Checks never download or
activate a runtime component.

Select a version, stop Runtime, and choose **Download and use**. Launcher and
CLI choices are independent and persist across plugin upgrades. Saved downloads
can be selected again for offline rollback. A failed download does not change
the active install state. New versions use separate Launcher and CLI virtual
environment directories, retaining older components and their verified assets.
Runtime starts and managed component operations share a user-directory lock.

Only assets from the official `foggy-projects/foggy-data-mcp-bridge` and
`foggy-projects/foggy-runtime-cli` releases are accepted. Resolution checks
SHA256SUMS, GitHub digests when supplied, and the release manifests before the
existing installer verifies the downloaded bytes. Unsupported or incomplete
releases cannot be activated. The minimum selectable version is `0.1.24`.
Network failures retain cached release information and do not block the
installed Runtime; failed checks are retried after fifteen minutes or manually.

Validated bundled defaults:

| Component | Version |
| --- | --- |
| Launcher / Java Runtime | 0.1.46 |
| Runtime CLI | 0.1.25 |
| Analysis / Semantic Query Skills | 0.1.18 |
| Private Python | 3.12.13 |

Launcher 0.1.46 includes Compose/time-plan stability fixes. CLI 0.1.25 fixes
member-query routes and error handling. Analytics Console remains opt-in and
this candidate does not add a Console settings entry.

## Install and upgrade

The new `engines.dsh` declaration makes the supported host range explicit.
Upgrade Harness to `0.2.1-rc.2` or a compatible newer 0.2.x host before installing
this candidate. Older host users can keep their corresponding previous plugin
line. A new npm publication should use `dsh021`, preserving the existing
`latest`, `beta`, `rc`, `dsh015`, `dsh017`, and `dsh020` tags.

```powershell
dsh plugin --profile web add --workspace-root ./foggy-projects-deepseek-harness-plugin-0.4.4-rc.1.tgz
```

After npm publication, the equivalent channel installation is:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@dsh021
```

Restart Harness after installing the package. Open **Settings → Built-in plugins
→ Foggy Data Analysis**. Existing installations can stop Runtime and use
**Update components** to apply new defaults to components without a saved user
selection, or choose Launcher/CLI versions individually. First-time users
initialize Foggy before selecting alternative component versions.

## Acceptance

Run syntax and regression checks with Node.js 24. Real DSH API/package acceptance
must point to an isolated installation containing DSH and the final packed
plugin; omitting this configuration skips those checks and is insufficient for
release acceptance.

```powershell
$env:FOGGY_DSH_COMPAT_ROOT = '<isolated DSH 0.2.1-rc.2 installation>'
$env:FOGGY_COMPONENT_RELEASE_LIVE_TEST = '1'
npm run check
npm test

$env:FOGGY_DSH_COMPAT_ROOT = '<isolated DSH 0.2.1-rc.4 installation>'
$env:FOGGY_DSH_COMPAT_VERSION = '0.2.1-rc.4'
npm test
```

The API gates cover the host's official plugin compatibility evaluator, gateway
and native Skill loading, the actual MCP adapter/tool-policy denial, and the
completed-turn client contract. UI acceptance uses the real client component
with an isolated mock API; it is separate from Runtime acceptance.

Windows Runtime acceptance covers an old 0.1.24 installation, upgrade to the
new defaults, Java 17 startup and capabilities, explicit stop, and offline
component rollback. Publication requires preserving these checks and packaging
the final source with an updated checksum and release manifest.

Viewer creation continues through the configured MCP connector and tool policy.
Grant-authorized `/data-viewer/open#...` links retain their existing validation.
The standard lite launcher's development viewer route is accepted only for the
currently running managed loopback Runtime in `none-dev-test-only` mode, with
matching port, model, and opaque query ID. The UI identifies that route as a
local development preview: it does not carry MCP Authorization into the browser.
Other or protected services must supply a grant-authorized link. The plugin
does not anonymously create a replacement link or blindly enable the optional
authorization module, which requires a host-provided identity provider.

Viewer requests now require at least one detail-level `slice` filter. Unfiltered
queries continue to display their results and explain the preview requirement;
the plugin does not synthesize filters. Native queries keep their separately
configured CLI Runtime authorization; transport headers are not extracted from
MCP. This release does not unify those scopes.

The published Skill 0.1.18 demonstration requires explicit `salesdrop` →
`default` datasource binding before replay with Launcher 0.1.46; the normal
plugin onboarding already binds namespaces. Its full question bank also has a
pre-existing CLI source-field precheck that rejects SD-001's derived caption
field. The unchanged SD-001 payload passes direct Runtime validation/execution.
Do not claim the legacy full question bank passed unchanged.

## Recorded platform acceptance (2026-10-27)

- The actual Harness 0.2.1-rc.2 Web host passed 21 native settings assertions, including official CLI installation, private Python initialization, online release checks, real downloads, explicit switching, host restart persistence, rollback, diagnostics, and the Tutorial link. Browser errors: zero.
- WSL2 Ubuntu 24.04 passed 13 real installation/Runtime/rollback/failure-preservation phases and 16 native component/locking tests. All eight Bash entrypoints passed LF, syntax and help checks; private-Python manifest resolution and the Linux installer dry-run passed.
- The WSL environment had a DNS failure. Official assets were downloaded and SHA256-verified on Windows, then tested through the Linux-native cache. WSL online cold downloads are not claimed. No system packages or user profiles were changed.
- Final packed SDK test counts and artifact hashes are recorded in the attached release manifest.
