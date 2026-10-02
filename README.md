# Foggy for DeepSeek Harness (Beta)

This package is the lightweight DeepSeek Harness Bundle for Foggy's Java data
analysis engine. Installing the Bundle adds a native Foggy tab under **Settings
→ Built-in plugins**. The private Python runtime, Launcher, and isolated CLI environment
are downloaded only when the user selects **Initialize and start** (or the
equivalent component action). Existing installations are not silently changed
when the plugin package is upgraded.

The `0.4.3-rc.1` compatibility candidate targets DeepSeek Harness `0.2.0-rc.2`
and requires a system Node.js `>=24.0.0`. Foggy's Java Launcher uses a system
Java 17+. Foggy manages its own pinned Python 3.12 runtime
inside the per-user component directory; it does not require a system Python,
modify `PATH`, or register Python globally. Advanced users may explicitly set
`FOGGY_PYTHON` to a compatible Python 3.11+ executable.

## Local release-candidate installation

```powershell
dsh plugin --profile web add --workspace-root ./foggy-projects-deepseek-harness-plugin-0.4.3-rc.1.tgz
```

Restart `dsh web`, use the browser it opens (or the complete printed URL,
including `?token=...`), open Settings → Built-in plugins → Foggy Data Analysis, and
initialize the components from there. Do not share the launch-token URL.

After the version is available on npm, install the exact DSH 0.2.0-rc.2
compatibility candidate so the stable `beta` channel is not changed:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.3-rc.1
```

DSH 0.2.0 candidates use the `dsh020` npm dist-tag. Check that the tag resolves
to the version you intend to install before using it. GitHub's published
tarball can be installed directly when registry publication is still pending:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@dsh020
```

The earlier DSH `0.1.7-rc.2` and `0.1.5-rc.2` candidates remain available as
`@foggy-projects/deepseek-harness-plugin@dsh017` and `@foggy-projects/deepseek-harness-plugin@dsh015`.
The `dsh020` candidate does not move the existing `beta` or `latest` channels.

For the existing stable beta channel, the corresponding one-line install is:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@beta
```

After updating the plugin package, open **Settings → Built-in plugins → Foggy Data
Analysis** and use **Update components** (or **Update and start**) to download
the pinned CLI, Launcher, and Skills. The settings page shows current and target
versions. Updates are blocked while Runtime is running so the active Java
process and the next-launcher state cannot diverge. Component-specific repair
actions remain available under **Advanced repair**.

DeepSeek Harness profiles can apply pnpm's minimum-release-age policy to their
lockfiles. An upgrade performed shortly after publication can therefore fail
while naming either the new plugin or a previously installed version. This is
a DSH profile-policy failure, not a damaged Foggy package. Use the exact profile
directory printed in the error and rebuild its lockfile, then rerun the same
`dsh plugin add` command:

```powershell
Set-Location "<the DSH profile directory printed in the error>"
npx --yes pnpm@11.7.0 clean --lockfile
```

The failed add normally records the requested exact version under
`minimumReleaseAgeExclude` before returning. If the error repeats, confirm that
both the installed and requested exact Foggy versions named by the error appear
under that key in the profile's `pnpm-workspace.yaml`; do not disable the policy
globally.

For development, `FOGGY_ASSET_CACHE_DIRS` can contain platform-delimited verified
asset-cache directories. It is not required for a normal install.

The bundled onboarding Skill is intentionally development-first. Users may
provide a local datasource password in the conversation, a user-managed
connection file, an Agent environment variable, or a compatible Runtime
Console. Direct passwords are submitted to the already-running Runtime without
being copied into onboarding state or evidence. The Skill then drives schema
discovery, semantic drafting, local Bundle registration, and bounded query
verification without restarting Runtime.

## Native Skill and workspace contract

The Bundle registers `foggy-deepseek-onboarding` and the downloaded
`foggy-ai-analysis` through DeepSeek Harness's native Skill provider API. Skills
are available in every DSH workspace without copying or symlinking `.agents`.
The current session `cwd` remains the workspace boundary for semantic drafts and
evidence.
An existing Harness session keeps its original workspace even if another workspace
becomes the default. Create a new session in the selected workspace when testing
model-file isolation; an isolated `DSH_HOME` alone does not change a session's
`cwd`. The `--workspace-root` option in the plugin install command is a pnpm
installation option, not a Harness workspace selector.

Opaque CLI profiles remain available for users who prefer them and default to
the private persistent `<dataRoot>/cli-profiles` directory, but they are not a
prerequisite for ordinary development. Composite onboarding commands are
idempotent: unchanged completed phases are resumed rather than re-adding a
datasource or re-registering a local Bundle. A resumed datasource checkpoint is
also reconciled against the live Runtime; if the datasource was removed outside
the wrapper, only datasource configuration, verification, and schema discovery
are resumed. Settings detects legacy temporary
profiles and offers an explicit, validated migration into the persistent store.

Private Python, CLI, Launcher, the analysis Skill, install state, and Runtime
state live in the user-level Foggy component directories. The managed CLI is intentionally isolated
and does not need to be on `PATH`. **Re-download / Repair** verifies the global
analysis Skill, backs up modified or outdated managed content, restores it, and
invalidates DSH's Skill catalog. The onboarding Skill is bundled with the plugin
and is restored by reinstalling or upgrading the plugin package.

The Foggy settings tab shows the persisted database/semantic onboarding stages,
offers pinned checks and repair for CLI, Launcher, and the managed analysis
Skill, private Python, and exports a private redacted diagnostics report. The report
includes bounded, sanitized tails of Runtime logs while refusing to read paths outside
the managed Runtime directory. Runtime start monitors the Launcher PID during
`wait-ready`, fails promptly if Java exits, and remains idempotent: an already-recorded
process is verified with `wait-ready` and `capabilities` instead of being treated as a
failed second start.

The same settings tab owns a persistent local Runtime port. New installations default
to `18166`; users can choose another port while Runtime is stopped. Startup checks the
same wildcard binding used by the Java server, so a conflicting application or Windows
port proxy produces an immediate, high-visibility error instead of a readiness timeout.
The CLI and Skills resolve the resulting stable Runtime URL from managed state.

For a successful standard QueryModel DSL call made through the native
`foggy_query` tool, Harness shows a compact result card below the completed
reply, outside the folded tool trace. A visible "Generated by Foggy plugin"
label distinguishes this programmatic record of executed results from the AI
reply. The card shows the model, namespace, row count, an optional five-row
result preview with DSL/SQL details, and **View data**. If a turn has more than six
successful queries, the first six are shown until the user expands the list.
The detailed DSL and execution record remains in the tool trace. Clicking
**View data** calls the configured Foggy MCP connector's `dataset.open_in_viewer`
tool through Harness's tool policy pipeline. Configure exactly one connector
that exposes this tool. Its transport retains the configured authorization
headers; the plugin does not put credentials in the browser contract and does
not fall back to anonymous HTTP link creation. Asking the assistant to open a
data view uses the same MCP tool. Both entry points follow the connector's
service authorization scope and open without an additional username/password
form.
The page re-executes the DSL against the current model and data rather than
freezing the original rows. Launcher 0.1.24 stores viewer links in SQLite by
default. Links default to no expiry and can be given a TTL or revoked; each
browser session defaults to one day and has a separately configurable TTL.
The historical card can request a new link while the transcript, connector,
Runtime, and model are available. Explicit aggregate `having` conditions are
retained alongside detail-level `slice` conditions. CTE preview is not included.
The Harness card retains the complete executed result; the web view displays
fields supported by the Runtime's model metadata.
The DataViewer page can export the current filtered and sorted model-backed
result to CSV (up to 10,000 rows). It refuses larger exports rather than
silently truncating them.

The native `foggy_query` tool uses the managed CLI's separately configured
Runtime authorization (for example `FOGGY_RUNTIME_AUTHORIZATION`). It does not
extract the MCP connector's headers. Verify the query tool and its identity
when demonstrating restricted data; the shared MCP scope described above
applies to the two viewer entry points.

This beta remains a local dev/test integration. It does not automatically extend
local credentials or approvals into a formal environment. Production model
publication should use a separate manual or dedicated deployment workflow with
an explicit target, model Git commit/tag, credentials, verification, and
rollback plan.

See [`docs/PUBLIC-BETA-READINESS.md`](./docs/PUBLIC-BETA-READINESS.md) for the
tested public Beta scope, release gates, and stable-release blockers.
The DSH 0.2.0-rc.2 compatibility candidate is documented in
[`docs/RELEASE-CANDIDATE-0.4.3-DSH-0.2.0-RC.1.md`](./docs/RELEASE-CANDIDATE-0.4.3-DSH-0.2.0-RC.1.md).
The previous DSH 0.1.7-rc.2 candidate is documented in
[`docs/RELEASE-CANDIDATE-0.4.2-DSH-0.1.7-RC.2.md`](./docs/RELEASE-CANDIDATE-0.4.2-DSH-0.1.7-RC.2.md).
The earlier DSH 0.1.5-rc.2 candidate is documented in
[`docs/RELEASE-CANDIDATE-0.4.1-DSH-0.1.5-RC.1.md`](./docs/RELEASE-CANDIDATE-0.4.1-DSH-0.1.5-RC.1.md).
Native Windows acceptance instructions are in
[`docs/WINDOWS-BETA-ACCEPTANCE.md`](./docs/WINDOWS-BETA-ACCEPTANCE.md); database
credentials intentionally remain outside the public repository.

## Community discovery

DeepSeek Harness does not currently publish a first-party plugin marketplace.
For discoverability, this repository is intended to carry the GitHub
[`dsh-plugin`](https://github.com/topics/dsh-plugin) topic. Independent community
directories and their submission rules are tracked in
[`docs/COMMUNITY-MARKETPLACES.md`](./docs/COMMUNITY-MARKETPLACES.md); inclusion in
any directory is community curation, not an endorsement by DeepSeek or Foggy.

## Linux and WSL2 experience

Ubuntu and WSL2 users can use the checked-in preflighted installer under
[`experience/linux`](./experience/linux/README.md). It keeps DSH, its profile,
the project workspace, and Foggy data on the Linux-native filesystem.
