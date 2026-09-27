# Foggy DeepSeek Harness plugin 0.4.2-rc.4

This pre-release targets DeepSeek Harness `0.1.7-rc.2` and remains on the
`dsh017` npm channel. The `beta`, `rc`, `dsh015`, and `latest` channels are
unchanged.

## Fixes since 0.4.2-rc.3

- Register `foggy_query` with Harness's existing tool runtime instead of
  installing a second private `@deepseek-ai/dsh-tools` copy. The duplicate
  runtime caused `Cannot read properties of undefined (reading 'prepare')`
  before the DSL query reached Foggy Runtime.
- Allow a normal Launcher upgrade to replace a same-named asset only when the
  existing file still matches the SHA-256 recorded for the previous installed
  version. The previous file is backed up; unexpected file changes remain
  fail-closed. Downloads are verified before replacing the existing file.
- Convert Query DSL `groupBy` and `orderBy` string shorthand into equivalent
  object entries when creating a DataViewer preview. A valid, executed query
  is no longer incorrectly labeled as ineligible for preview.
- Warn that the current DataViewer table can omit ad-hoc aggregate columns
  even though the query card contains the complete result. This is an engine
  display limitation, not a failed Query DSL execution.

The DSL-only DataViewer behavior from rc.3 is unchanged: a preview URL is
created only when the user clicks the successful query card's button. CTE
preview is not included.

Install the exact version with:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.2-rc.4
```
