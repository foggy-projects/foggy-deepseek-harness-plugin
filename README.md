# Foggy for DeepSeek Harness (Beta)

This package is the lightweight DeepSeek Harness Bundle for Foggy's Java data
analysis engine. Installing the Bundle adds a native Foggy tab under **Settings
→ Plugins**. The large Launcher and the isolated CLI environment are downloaded
only when the user selects **Initialize Foggy**.

## Local beta installation

```powershell
dsh plugin --profile web add --workspace-root ./foggy-projects-deepseek-harness-plugin-0.4.0-beta.4.tgz
```

Restart `dsh web`, open Settings → Plugins → Foggy Data Analysis, and initialize
the components from there.

After npm beta publication, the corresponding one-line install is:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@beta
```

For development, `FOGGY_PROJECT_ROOT` can override the workspace that receives
the Skills and `FOGGY_ASSET_CACHE_DIRS` can contain platform-delimited verified
asset-cache directories. Neither variable is required for a normal install.

Database credentials are deliberately outside the ordinary DSH settings
document. The database and semantic-layer wizard is the next Bundle milestone.

## Managed workspace contract

Initialization writes a non-secret discovery document at
`.foggy/deepseek-harness/context.json` in the selected project. It points agents
to the authoritative global install state, the managed CLI's absolute command,
the Runtime state, and the two workspace Skills. The managed CLI is intentionally
isolated and does not need to be on `PATH`.

Both `foggy-deepseek-onboarding` and `foggy-ai-analysis` carry a
`.foggy-managed-skill.json` marker. **Re-download / Repair** verifies their
managed content, backs up a modified or outdated Skill under
`.foggy/onboarding-backups`, restores missing content, and regenerates the
project context. If a Skill is restored while Harness is already running, start
a new task or restart Harness so its Skill registry can reload it.

## Linux and WSL2 experience

Ubuntu and WSL2 users can use the checked-in preflighted installer under
[`experience/linux`](./experience/linux/README.md). It keeps DSH, its profile,
the project workspace, and Foggy data on the Linux-native filesystem.
