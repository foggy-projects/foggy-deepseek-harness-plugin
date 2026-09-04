---
name: foggy-deepseek-onboarding
description: Set up and use Foggy Runtime for data-source exploration and semantic-model development inside DeepSeek Harness. Use for local experience, datasource onboarding, TM/QM authoring, validation, and development publication; route production deployment or updates to a separate release workflow.
---

# Foggy DeepSeek onboarding

Use this Skill for the normal DeepSeek Harness experience: connect a development datasource, inspect
it, create TM/QM files in the current workspace, and iterate until queries pass. Use the managed
`foggy-runtime` CLI and this Skill's wrappers; do not configure Foggy MCP for this local workflow.

## Product boundary

- Treat the plugin and bundled Launcher as local experience and development tooling.
- Datasources, namespace bindings, model Bundles, refreshes, and query checks are online Runtime
  operations. They do not require a Runtime restart.
- Start Runtime only when it is absent. Reuse a healthy running Runtime. Restart only when the user
  asks, a Launcher/JAR upgrade requires it, Runtime is unhealthy, or an actual startup setting such as
  port, JVM options, Runtime authentication, or an opt-in module changes.
- Do not turn production publication into a continuation of local onboarding. When the user wants to
  deploy or update a formal environment, recommend a manual release or a dedicated production
  deployment workflow with separately supplied target access, credentials, version, verification, and
  rollback information.
- Do not modify Foggy engine or CLI source. If progress genuinely requires either change, stop and ask
  for explicit authorization.

## Managed installation

This Skill is registered through DeepSeek Harness's native Skill registry. Its scripts and references
are authoritative; do not copy the Skill into the current workspace.

- Linux install state: `${XDG_DATA_HOME:-$HOME/.local/share}/foggy/deepseek-harness/install-state.json`.
- Windows install state: `%LOCALAPPDATA%\Foggy\DeepSeekHarness\install-state.json`.
- Run this Skill's `doctor` wrapper with the current DSH workspace as `--project-root`. The managed CLI
  is intentionally isolated, so absence from `PATH` does not mean it is missing.
- Use plugin settings to initialize or repair private Python, CLI, Launcher, or the managed analysis
  Skill. Do not independently reinstall them during a normal analysis session.
- Treat the current DSH workspace as `projectRoot`. Keep model drafts and final model files there rather
  than redirecting them to an example repository.

## Development workflow

1. Run `doctor`. Start Runtime only if it is not already healthy; require `wait-ready` and
   `capabilities` after a new start.
2. Accept datasource connection details from the user's message, a user-supplied local JSON file, an
   environment variable, or Runtime Console. Direct `password` is supported for local development.
   The wrapper submits it to the public Runtime API without copying it into onboarding state or
   evidence. Do not echo it in the response.
3. Create or select the namespace, add/test the datasource online, and bind it to the namespace. Do
   not stop or restart Runtime to make a password available. A running Runtime can accept a direct
   development password through its datasource API.
4. Inspect tables, columns, keys, and relationships. Small, bounded, read-only SQL samples are allowed
   when they help infer captions, enums, units, or date semantics. Do not run mutations unless the user
   explicitly requests them.
5. Load `foggy-ai-analysis` from the native registry only for TM/QM authoring and query tuning; its
   generic installation, datasource-secret, and production-deployment guidance does not override this
   development workflow. Default to a project-local `models/` directory unless the user specifies
   another directory.
6. Iterate through model validation, Bundle registration/update, model refresh/describe, query
   validation, and bounded query execution. Development publication means making the local model
   directory effective in this local Runtime; it is not a production release.
7. When the model works, recommend committing the model directory to the user's own Git repository.
   Do not initialize a repository, commit, push, or create a remote unless the user requests it.

For a normal end-to-end request, take the documented composite-command path first. Do not inspect
`onboarding.py`, enumerate CLI help, search installation directories, load the sales-drop example, or
fetch online syntax documentation before trying that path. Use those troubleshooting or reference
sources only when a concrete error or unsupported modeling requirement makes them relevant.

Use the user's business terms to narrow schema discovery with `--pattern` or repeated `--table` when
there are clear candidates. Otherwise keep the bounded default, then inspect only the few tables and
columns needed for the requested model. Full results belong in the evidence files; retain concise
summaries and paths in the conversation instead of repeatedly reading complete JSON artifacts.

Read [references/onboarding-workflow.md](references/onboarding-workflow.md) for the wrapper commands and
credential shapes. Use `foggy-ai-analysis` references for detailed TM/QM modeling and query tuning.

## Credential choices for local development

Choose the simplest source the user provides:

- `password` in a connection file: simplest for an experience session; the source file remains under
  the user's control and should normally stay outside Git.
- `passwordEnv`: the wrapper reads the variable from the Agent process and submits the value online;
  Runtime does not need to inherit it at startup.
- Opaque profile: optional for users who already have one; never require it for ordinary onboarding.
- Runtime Console: when a Launcher exposing Runtime Console is installed, the user may enter the
  connection there using the management token shown by the host/plugin.

Keep only a minimal development safety baseline: do not echo passwords, put them in TM/QM files,
include them in evidence/diagnostics, or commit them to Git. Do not impose production IAM, audit,
approval, secret-store, or network-governance requirements on this local flow.

## Command behavior

All scripts emit one JSON object. Treat `success=false` or a nonzero exit code as failure. Prefer the
two resumable composite commands for a complete requested experience:

```text
onboard-datasource-run --project-root <workspace> --connection-file <json> \
  --approve-configure --approve-bind --include-indexes

onboard-semantic-run --project-root <workspace> --semantic-plan <json> \
  --query-payload <json> --approve-validate --approve-publish --approve-execute
```

When the user has already asked to connect, build, and test a new local model, those flags implement
that request and do not require separate question-by-question confirmation. Replacement, pruning, broad
queries, destructive SQL, Git push, and production deployment still require their own clear scope.

The normal analysis order is:

```text
datasource add/test -> namespace bind -> table/schema inspection
TM/QM authoring -> models validate -> bundle add/update -> refresh/describe
query validate -> bounded query execute -> tune -> optional Git handoff
```

Stop only the PID recorded by this package and preserve the Runtime work directory unless the user
explicitly requests removal.

## Result

Report the Runtime URL, namespace, datasource name, model directory, Bundle and QueryModel names,
validation/query status, and useful evidence paths. Never include the password or business row values
unless the user specifically asks for those values.
