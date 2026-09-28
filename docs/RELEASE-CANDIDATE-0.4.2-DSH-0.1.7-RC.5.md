# Foggy DeepSeek Harness plugin 0.4.2-rc.5

This pre-release targets DeepSeek Harness `0.1.7-rc.2` and stays on the
dedicated `dsh017` npm channel. The `beta`, `rc`, `dsh015`, and `latest`
channels remain unchanged.

## Changes since 0.4.2-rc.4

- Pin Runtime Launcher `0.1.23`, which includes the lite-profile DataViewer
  preview page without requiring the Analytics Console or MongoDB.
- The DataViewer page puts readable query details and the executed DSL side by
  side, supports copying DSL, and places refresh and CSV export below the
  details. Query links are created on demand from successful DSL result cards.
- The table supports local filtering and exports the current filtered result.
  CTE preview is not included. Preview links are process-local development
  aids, not durable production shares.

The plugin keeps the current Harness `0.1.7-rc.2` tool integration. The
Runtime is updated only when the user selects **Update components** or
**Update and start** in Foggy settings; package installation does not restart
an existing Runtime.

Install the exact version with:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.2-rc.5
```
