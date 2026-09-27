# Foggy DeepSeek Harness plugin 0.4.2-rc.3

This pre-release targets DeepSeek Harness `0.1.7-rc.2` on the `dsh017` npm
channel. It keeps the `beta`, `rc`, and `dsh015` channels unchanged.

## Changes since 0.4.2-rc.2

- Add a native `foggy_query` tool for bounded, read-only standard QueryModel DSL
  validation and execution. Successful calls render a Harness card with the
  model, namespace, row count, DSL, SQL, and result.
- Create a DataViewer preview URL only when the card's **Open DataViewer**
  action is clicked. Links are short-lived local development previews, not
  frozen result snapshots. An expired link can be regenerated from the card.
- Update the managed Launcher to `0.1.22`. Its lite profile serves the existing
  DataViewer UI using a bounded in-memory cache without MongoDB, and its start
  scripts bind to loopback. Runtime restarts invalidate preview links.
- Do not claim CTE preview support in this release. Existing CTE execution
  remains available through its prior CLI path without a DataViewer card.

## Acceptance scope

- Plugin checks: `npm run check`, Node tests, Python onboarding tests, and an
  isolated DSH `0.1.7-rc.2` web boot with the Foggy settings tab visible.
- Launcher: formal release gate, default and Analytics Console smokes, six
  GitHub assets, and SHA-256 verification.
- End-to-end DSL: an isolated Java Runtime with SQLite demo data validates and
  executes a QueryModel query. A click-generated DataViewer link shows actual
  columns and six rows in the browser.

Install the exact version with:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.2-rc.3
```
