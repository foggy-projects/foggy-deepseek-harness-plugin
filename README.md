# Foggy for DeepSeek Harness (Beta)

This package is the lightweight DeepSeek Harness Bundle for Foggy's Java data
analysis engine. Installing the Bundle adds a native Foggy tab under **Settings
→ Plugins**. The private Python runtime, Launcher, and isolated CLI environment
are downloaded only when the user selects **Initialize Foggy**.

DeepSeek Harness uses a system Node.js (`^22.19.0 || >=24.0.0`) and Foggy's Java
Launcher uses a system Java 17+. Foggy manages its own pinned Python 3.12 runtime
inside the per-user component directory; it does not require a system Python,
modify `PATH`, or register Python globally. Advanced users may explicitly set
`FOGGY_PYTHON` to a compatible Python 3.11+ executable.

## Local beta installation

```powershell
dsh plugin --profile web add --workspace-root ./foggy-projects-deepseek-harness-plugin-0.4.0-beta.11.tgz
```

Restart `dsh web`, use the browser it opens (or the complete printed URL,
including `?token=...`), open Settings → Plugins → Foggy Data Analysis, and
initialize the components from there. Do not share the launch-token URL.

After npm beta publication, the corresponding one-line install is:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@beta
```

For development, `FOGGY_ASSET_CACHE_DIRS` can contain platform-delimited verified
asset-cache directories. It is not required for a normal install.

Database credentials remain outside the ordinary DSH settings document. The
bundled onboarding Skill drives datasource discovery, semantic drafting,
checkpointed publication, and bounded read-only query verification.

## Native Skill and workspace contract

The Bundle registers `foggy-deepseek-onboarding` and the downloaded
`foggy-ai-analysis` through DeepSeek Harness's native Skill provider API. Skills
are available in every DSH workspace without copying or symlinking `.agents`.
The current session `cwd` remains the workspace boundary for semantic drafts and
evidence.

Opaque CLI profiles default to the private persistent
`<dataRoot>/cli-profiles` directory. Composite onboarding commands are
idempotent: unchanged completed phases are resumed rather than re-adding a
datasource or re-registering a published bundle. Settings detects legacy
temporary profiles and offers an explicit, validated migration into the
persistent store. A completed profile can also be bound non-destructively to an
additional DSH workspace when its reviewed connection contract and published
semantic digest are unchanged.

Private Python, CLI, Launcher, the analysis Skill, install state, and Runtime
state live in the user-level Foggy component directories. The managed CLI is intentionally isolated
and does not need to be on `PATH`. **Re-download / Repair** verifies the global
analysis Skill, backs up modified or outdated managed content, restores it, and
invalidates DSH's Skill catalog. The onboarding Skill is bundled with the plugin
and is restored by reinstalling or upgrading the plugin package.

The Foggy settings tab shows the persisted database/semantic onboarding stages,
offers pinned checks and repair for CLI, Launcher, and the managed analysis
Skill, private Python, and exports a private redacted diagnostics report. Runtime start is
idempotent: an already-recorded process is verified with `wait-ready` and
`capabilities` instead of being treated as a failed second start.

This beta remains a local dev/test integration. The bundled Runtime reports
`securityMode=none-dev-test-only` and must not be exposed to a network or used as
a production service.

See [`docs/PUBLIC-BETA-READINESS.md`](./docs/PUBLIC-BETA-READINESS.md) for the
tested public Beta scope, release gates, and stable-release blockers.
Native Windows acceptance instructions are in
[`docs/WINDOWS-BETA-ACCEPTANCE.md`](./docs/WINDOWS-BETA-ACCEPTANCE.md); database
credentials intentionally remain outside the public repository.

## Linux and WSL2 experience

Ubuntu and WSL2 users can use the checked-in preflighted installer under
[`experience/linux`](./experience/linux/README.md). It keeps DSH, its profile,
the project workspace, and Foggy data on the Linux-native filesystem.
