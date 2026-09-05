# Development datasource and semantic-model workflow

Use this workflow after the Foggy plugin is initialized. It is designed for local experience and
model development in DeepSeek Harness, not for production deployment.

## Connection input

The simplest local connection contract may contain a direct password:

```json
{
  "schemaVersion": "foggy-deepseek-connection/v1",
  "profile": "business",
  "name": "business-db",
  "type": "mysql",
  "jdbcUrl": "jdbc:mysql://127.0.0.1:3306/business",
  "username": "business_dev",
  "password": "local-development-password",
  "namespace": "business",
  "modelsDir": "models",
  "evidenceDir": ".foggy/onboarding-command-evidence/business"
}
```

The wrapper uses the direct password only while submitting the datasource to the public Runtime API.
It does not copy it into onboarding state, command evidence, TM/QM files, or conversational output.
The source connection file is user-managed; do not commit it. The local Runtime currently stores a
direct password in its private datasource registry, so use `passwordRef`-style production credential
management when moving beyond local development.

An environment variable is an optional alternative:

```json
{
  "schemaVersion": "foggy-deepseek-connection/v1",
  "profile": "business",
  "name": "business-db",
  "type": "mysql",
  "jdbcUrl": "jdbc:mysql://127.0.0.1:3306/business",
  "username": "business_dev",
  "passwordEnv": "FOGGY_BUSINESS_DB_PASSWORD",
  "namespace": "business",
  "modelsDir": "models"
}
```

Here `passwordEnv` is read by the onboarding wrapper and submitted online to the already-running
Runtime. Do not restart Runtime merely to make the variable part of the Java process environment.
Opaque CLI profiles remain supported for users who already prefer them, but are not required for a
normal DSH experience.

## Normal sequence

Run the platform-specific wrapper from this Skill directory. `onboard-datasource-run` performs the
online datasource setup, namespace binding, and schema discovery against the healthy Runtime:

```text
onboard-datasource-run --project-root <current-workspace> \
  --connection-file <connection-json> \
  --approve-configure --approve-bind --include-indexes
```

If the user already requested the complete connection experience, include both approval flags in the
first call. They refer only to adding the named development datasource and binding the requested
namespace. Do not add `--replace` unless replacement was explicitly requested.

The command performs:

```text
datasource add -> datasource test -> namespace bind -> diagnostics
tables list -> bounded schema inspection
```

It does not stop or restart Runtime. Repeated calls reuse completed checkpoints when the public
connection contract is unchanged. Before reusing a datasource checkpoint, the wrapper verifies that
the named datasource still exists with the expected public type in the live Runtime. If it was
removed outside the wrapper, datasource configuration, verification, and schema discovery resume
automatically from the first affected step. Inline password values are excluded from the comparison.
Transient connection-pool readiness timeouts are retried a small, bounded number of times; invalid
credentials, invalid URLs, and other configuration errors fail immediately.

When the user's request clearly identifies a business subject or likely tables, add `--pattern` or
one or more `--table` arguments so discovery remains focused. Do not enumerate CLI help, inspect the
wrapper source, load unrelated examples, or fetch online documentation on the successful normal path.
Keep full command payloads in the numbered evidence files and use only their concise result fields in
the conversation.

After discovery, use `foggy-ai-analysis` to create TM/QM drafts from actual tables, columns, keys,
small read-only samples when useful, and the user's business questions. Keep the files in the current
workspace, normally:

```text
models/
  model/
    <Name>.tm
  query/
    <Name>QueryModel.qm
```

Then run the semantic composite:

```text
onboard-semantic-run --project-root <current-workspace> \
  --semantic-plan <semantic-json> \
  --query-payload <bounded-query-json> \
  --approve-validate --approve-publish --approve-execute
```

For an explicitly requested end-to-end local experience, these flags may be used together. The command
validates the model files, copies them to the approved model directory when needed, registers or
updates the local Runtime Bundle, refreshes/describes the declared QueryModels, validates the bounded
query, and executes it. It never means production publication.

Use `--watch` only when the user wants the local Runtime to follow model-file edits. Use `--prune` or
bundle replacement only when the user clearly asks for those changes.

## Iteration and troubleshooting

The granular commands remain available when a specific stage needs repair:

```text
onboard-plan --connection-file <json> --profile <profile>
datasource-configure --profile <profile> [--apply]
datasource-verify --profile <profile> [--bind]
schema-discover --profile <profile> [--include-indexes]
semantic-draft --profile <profile> --semantic-plan <json>
semantic-validate --profile <profile> [--apply]
semantic-publish --profile <profile> [--apply]
semantic-verify --profile <profile> --query-payload <json> [--execute]
onboard-status --profile <profile>
onboard-resume --profile <profile>
```

A standalone `datasource-configure --apply` can resolve `passwordEnv` from its current Agent process.
For a direct `password`, use the composite datasource command with the original connection file so the
secret stays ephemeral to that invocation.

When a failure occurs, repair only the failed input and rerun the same composite command. Do not remove
a successfully registered Bundle merely because later query validation failed. Keep SQL samples small,
read-only, and relevant to semantic authoring.

## Git handoff

When validation and representative questions pass, recommend placing the model directory under the
user's existing Git repository. Git is the source of truth for model history; Runtime Bundle
registration only makes a selected local directory active. Do not create commits, remotes, tags, or
pushes without the user's request.

## Production handoff

Stop the local onboarding flow when the user asks to publish or update a formal environment. A separate
manual or dedicated deployment workflow should collect the exact target, Launcher version, model Git
commit/tag, namespace, production datasource procedure, access credentials, verification plan, and
rollback point. It should then install/start Runtime if needed, prepare the target datasource, register
the versioned model directory, refresh, and run a narrow smoke check.

Local onboarding credentials and approvals do not authorize production access or publication.
