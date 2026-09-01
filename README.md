# Foggy for DeepSeek Harness (Beta)

This package is the lightweight DeepSeek Harness Bundle for Foggy's Java data
analysis engine. Installing the Bundle adds a native Foggy tab under **Settings
→ Plugins**. The large Launcher and the isolated CLI environment are downloaded
only when the user selects **Initialize Foggy**.

## Local beta installation

```powershell
dsh plugin --profile web add --workspace-root ./foggy-projects-deepseek-harness-plugin-0.4.0-beta.5.tgz
```

Restart `dsh web`, open Settings → Plugins → Foggy Data Analysis, and initialize
the components from there.

After npm beta publication, the corresponding one-line install is:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@beta
```

For development, `FOGGY_ASSET_CACHE_DIRS` can contain platform-delimited verified
asset-cache directories. It is not required for a normal install.

Database credentials are deliberately outside the ordinary DSH settings
document. The database and semantic-layer wizard is the next Bundle milestone.

## Native Skill and workspace contract

The Bundle registers `foggy-deepseek-onboarding` and the downloaded
`foggy-ai-analysis` through DeepSeek Harness's native Skill provider API. Skills
are available in every DSH workspace without copying or symlinking `.agents`.
The current session `cwd` remains the workspace boundary for semantic drafts and
evidence.

CLI, Launcher, the analysis Skill, install state, and Runtime state live in the
user-level Foggy component directories. The managed CLI is intentionally isolated
and does not need to be on `PATH`. **Re-download / Repair** verifies the global
analysis Skill, backs up modified or outdated managed content, restores it, and
invalidates DSH's Skill catalog. The onboarding Skill is bundled with the plugin
and is restored by reinstalling or upgrading the plugin package.

## Linux and WSL2 experience

Ubuntu and WSL2 users can use the checked-in preflighted installer under
[`experience/linux`](./experience/linux/README.md). It keeps DSH, its profile,
the project workspace, and Foggy data on the Linux-native filesystem.
