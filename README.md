# Foggy for DeepSeek Harness (Beta)

This package is the lightweight DeepSeek Harness Bundle for Foggy's Java data
analysis engine. Installing the Bundle adds a native Foggy tab under **Settings
→ Plugins**. The large Launcher and the isolated CLI environment are downloaded
only when the user selects **Initialize Foggy**.

## Local beta installation

```powershell
dsh plugin --profile web add --workspace-root ./foggy-projects-deepseek-harness-plugin-0.4.0-beta.1.tgz
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
