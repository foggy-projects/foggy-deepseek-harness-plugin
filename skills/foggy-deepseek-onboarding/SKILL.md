---
name: foggy-deepseek-onboarding
description: Install and operate a pinned Foggy CLI-first dev/test environment from DeepSeek Harness, including opaque datasource profiles, resumable verification, and schema discovery before semantic authoring. Use for initial Foggy setup or local Runtime onboarding; do not use for production deployment or MCP configuration.
---

# Foggy DeepSeek onboarding

Set up Foggy through shell and `foggy-runtime` CLI. Do not configure Foggy MCP for this local workflow.

## Native registry and installed-state gate

This Skill is registered by the Foggy plugin through DeepSeek Harness's native Skill registry. Its
resource base is the authoritative location for these scripts and references; do not search for or
copy this Skill into the current workspace.

- Resolve the global install state from the platform default component directory: on Linux use
  `${XDG_DATA_HOME:-$HOME/.local/share}/foggy/deepseek-harness/install-state.json`; on Windows use
  `%LOCALAPPDATA%\Foggy\DeepSeekHarness\install-state.json`.
- Confirm the installation with this Skill's `doctor` wrapper and pass the current DSH session
  workspace as `--project-root`. The absence of `foggy-runtime` from `PATH` is not evidence that the
  managed CLI is missing; the plugin intentionally installs it in an isolated environment and records
  its absolute command in the global install state.
- Do not independently download or reinstall the CLI. If the global install state, managed marker, or
  analysis Skill is missing or invalid, ask the user to open the Foggy plugin settings and use
  **Re-download / Repair**. Repair restores the global managed analysis Skill and invalidates the
  native DSH Skill catalog. Reinstall or upgrade the plugin itself to restore this bundled Skill.
- Treat the current DSH session workspace as the authoritative `projectRoot` for the whole onboarding
  run. Do not redirect semantic drafts or contracts to a different repository merely because another
  Skill or example was found there. Place non-secret contracts below
  `<projectRoot>/.foggy/onboarding-contracts/<profile>/`, drafts below
  `<projectRoot>/.foggy/onboarding-drafts/<profile>/`, and published files below the approved
  project-relative `modelsDir`.

## Mandatory orchestration boundary

For every new-database onboarding session, this Skill is the orchestration authority until
`onboard-status` reports `next.status=completed`:

- Invoke datasource, schema, semantic, bundle, and query operations only through this Skill's
  `scripts/onboard.ps1` or `scripts/onboard.sh`. Do not call `foggy-runtime` directly for those
  operations, even if another loaded Skill documents equivalent CLI commands.
- Use `foggy-ai-analysis` only to author TM/QM draft content. Its general direct-CLI workflow does not
  supersede this Skill's state machine, approval gates, names, paths, query limit, or evidence rules.
- Use the exact profile, datasource, namespace, bundle, model names, paths, fields, and query limit
  supplied or confirmed by the user. Do not replace them with examples or inferred alternatives.
- Do not use raw SQL to sample business rows during onboarding. `schema-discover` is the metadata gate;
  any later SQL probe requires separate explicit approval and must be bounded and read-only.
- Never use `--replace`, `--replace-bundle`, `--prune`, `--watch`, or `--execute` unless that exact
  mutation was explicitly approved. Approval for adding a new resource is not approval to replace one.
- Save each wrapper result as the single JSON object returned on stdout when the user requests evidence.
  Do not claim completion when required evidence is missing or the persisted status is incomplete.
- Never read query-execution evidence back into the conversation. Report only validation state,
  execution state, row count, and evidence path; do not report row values or generated SQL containing
  business literals.
- Prefer one composite command per approval boundary. Do not inspect this Skill's Python implementation
  or the CLI package source during a normal run; use the documented command contract and inspect code
  only after a structured wrapper error requires troubleshooting.

## Boundaries

- Treat the bundled Launcher as local dev/test only. Its expected security mode is
  `none-dev-test-only`; never expose it to a network.
- Do not print, persist, or request secrets in chat. Use named environment variables or a private env
  file outside the Skill and evidence directories.
- Do not modify Foggy engine or CLI source. If setup cannot continue without such a change, stop and
  ask the user for explicit authorization.
- Before downloads, installs, replacement, Runtime start/stop, or removal, state the concrete action
  and obtain any authorization required by the host.

## Workflow

1. Run `scripts/doctor.ps1 --project-root <current-session-workspace>` on Windows or
   `bash scripts/doctor.sh --project-root <current-session-workspace>` on Linux.
2. If the pinned CLI, Launcher, or global managed analysis Skill is missing, use the Foggy
   plugin's Repair action. Use the matching install script only when the plugin UI is unavailable;
   use `--dry-run` first when paths or permissions are uncertain.
3. Run `runtime-start` and require successful `wait-ready` plus `capabilities`. Record engine,
   Runtime API version, schema version, security mode, URL, namespace, PID, and evidence path.
4. Load `foggy-ai-analysis` from the native DSH Skill registry. Do not require a workspace copy.
5. For a new business database, read [references/onboarding-workflow.md](references/onboarding-workflow.md)
   and prefer its two composite `onboard-datasource-run` / `onboard-semantic-run` commands. Require the
   trusted operator to create the private CLI profile outside Harness. Unless the operator explicitly
   overrides it, use the persistent profile store reported by the wrapper under the Foggy data root
   (`<dataRoot>/cli-profiles`), never `/tmp`. Accept only the opaque profile
   ID, exact revision, datasource name/type, and namespace; never request JDBC URL, username,
   password, or password environment-variable name in Harness.
6. After schema discovery, use `foggy-ai-analysis` only to author TM/QM files in the standard project-local
   draft directory. Register, validate, publish, and verify them through this Skill's wrapper using the deterministic commands in
   [references/onboarding-workflow.md](references/onboarding-workflow.md). Do not publish, prune, replace
   a bundle, or execute a business-data query without the matching explicit flag and user approval.
7. Stop only the Runtime PID recorded by this package. Preserve Runtime data unless the user explicitly
   requests purge.

## Command contract

All package scripts return one JSON object on stdout. Treat `success=false` or a nonzero exit code as a
failure. Do not infer readiness from a fixed sleep; require CLI `wait-ready` and `capabilities`.

Use this analysis order after setup:

```text
datasource test -> bind -> diagnostics
tables list -> inspect -> optional bounded read-only SQL
models validate -> bundles add/update -> models refresh -> models describe
query validate -> query execute -> interpretation
```

In DeepSeek Harness, do not expand the composite onboarding commands back into these individual CLI
operations. This order documents what the wrapper enforces internally and becomes a direct CLI workflow
only after onboarding is complete.

Composite commands are checkpointed and idempotent: a retry skips completed datasource, validation,
publication, and verification phases when the approved contract and draft digest are unchanged. Fix a
query payload in place and rerun the same semantic composite command; do not remove a successfully
published bundle merely to recover from a later query-validation failure.

Keep user business data separate from the sales-drop SQLite demo. Prefer a read-only database account,
opaque CLI profile references, and bounded query limits.
