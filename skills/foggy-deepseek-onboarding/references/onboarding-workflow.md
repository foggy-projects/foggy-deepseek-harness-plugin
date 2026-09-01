# Resumable database onboarding

Use the thin `scripts/onboard.ps1` or `scripts/onboard.sh` entrypoint. Every command emits one JSON
object. Preserve the returned `next` instruction and use `onboard-status` or `onboard-resume` after an
interruption.

The wrapper is mandatory for the entire sequence below. Until `onboard-status` returns
`next.status=completed`, do not substitute direct `foggy-runtime datasources`, `tables`, `sql`, `models`,
`bundles`, or `query` calls. A second Skill may help write draft TM/QM files, but must not take over
orchestration. Do not inspect sample rows to author the semantic layer; use schema metadata plus the
business definitions confirmed by the user.

## Conversation contract

Collect these non-secret values before creating a plan:

1. an opaque Foggy profile ID and its exact reviewed revision;
2. datasource name, database type, and namespace from the CLI's public profile summary;
3. optional schemas, the project-relative semantic model directory, and a project-relative evidence directory.

Create the private profile in a trusted operator session outside DeepSeek Harness. Do not ask the user
to paste a password and do not put a JDBC URL, username, password environment-variable name, or password in the JSON plan, command
line, logs, or evidence. For non-SQLite databases, ask the user to set the named environment variable
before Runtime starts so the Java process inherits it. Recommend a read-only database account.

Use the current DSH session workspace as `projectRoot`. Store approved non-secret contracts at
`.foggy/onboarding-contracts/<profile>/`, semantic drafts at `.foggy/onboarding-drafts/<profile>/`, and
command evidence at `.foggy/onboarding-command-evidence/<profile>/`. Do not split these files across the
session workspace and a separate example repository. The wrapper rejects a query payload outside the
recorded project root before any semantic validation or publication mutation occurs.

The wrapper defaults `FOGGY_RUNTIME_PROFILE_STORE` to the private persistent directory
`<dataRoot>/cli-profiles`. An explicit operator-provided value still wins. Do not use `/tmp` for a profile
that must survive a WSL or Harness restart.

Treat every user-supplied identifier and bound as immutable input: profile, datasource, namespace,
models directory, bundle name, TM/QM name, query fields, and limit. Do not swap in demo names, add
fields, raise the limit, or introduce replacement flags. If one of these inputs is missing, pause for
that input rather than inventing it.

For composite Harness execution, persist `profile` and `evidenceDir` inside both approved contract
files. The wrapper derives them from the files and rejects conflicting command-line values. Present the
normalized contracts to the user before accepting mutation approvals; do not combine contract drafting
and approval into an unseen one-turn mutation.

Write the non-secret input using `assets/connection.schema.json`; `assets/datasource.example.json` is a
template. Then execute the sequence below.

## Deterministic sequence

For Harness-driven onboarding, use the two composite commands below. Each writes the numbered JSON
evidence internally and refuses to cross an unapproved mutation gate:

```text
onboard-datasource-run --connection-file <approved-json> \
  --approve-configure --approve-bind --include-indexes

# After authoring the registered TM/QM draft from schema metadata:
onboard-semantic-run --semantic-plan <approved-json> --query-payload <approved-json> \
  --approve-validate --approve-publish --approve-execute
```

Include an approval flag only after the user approves that exact action. Without it, the composite
command stops after the corresponding dry-run and returns `phaseStatus=awaiting-...-approval`.

Both composite commands are resumable. When the approved contract is unchanged, they skip completed
checkpoints instead of re-adding an existing datasource, revalidating an already published draft, or
registering the same bundle twice. If query validation fails after publication, correct the project-local
payload and rerun `onboard-semantic-run`; it resumes at query verification and leaves the active bundle in
place. A same-name datasource is accepted idempotently only when its public name and database type match
the approved plan; otherwise replacement still requires explicit approval.

The granular commands below remain available for manual troubleshooting and resumption. Do not expand
the composite commands into this list during a normal Harness turn.

```text
onboard-plan --connection-file <json> --profile <profile>
datasource-configure --profile <profile>
datasource-configure --profile <profile> --apply
datasource-verify --profile <profile>
datasource-verify --profile <profile> --bind
schema-discover --profile <profile> --include-indexes
semantic-draft --profile <profile> --semantic-plan <json>
semantic-validate --profile <profile>
semantic-validate --profile <profile> --apply
semantic-publish --profile <profile>
semantic-publish --profile <profile> --apply
semantic-verify --profile <profile> --query-payload <json>
semantic-verify --profile <profile> --query-payload <json> --execute
onboard-status --profile <profile>
```

The first `datasource-configure` call is a dry run. Explain the concrete datasource mutation and get
approval before adding `--apply`. `datasource-verify` tests connectivity without binding; explain the
namespace binding mutation and get approval before adding `--bind`. Add `--replace` only when the user
explicitly approves replacing an existing datasource definition.

Schema discovery is metadata-only and inspects at most 25 tables by default. Use repeated `--schema` or
`--table` arguments to narrow scope, `--list-only` for inventory only, and raise `--max-tables` only when
the user needs broader inspection. The resulting evidence remains under the private Runtime data root.

## Semantic authoring and publishing

After `schemaDiscovered=completed`, review table names, columns, keys, and relationships with the user.
Use `foggy-ai-analysis` for TM/QM authoring in a separate project-local draft directory. Do not invent
business definitions, joins, units, enum meanings, or date semantics. Create a plan using
`assets/semantic-plan.schema.json`; its declared query-model names must exist in the draft `.qm` files.

`semantic-draft` records TM/QM hashes. Any later file change invalidates the recorded validation and must
be registered and validated again. `semantic-validate` is a dry run until `--apply`; applying it may
replace the Runtime validation catalog, so explain that mutation before approval.

`semantic-publish` shows added, updated, unchanged, preserved, and optionally removed files. Applying it:

1. backs up every overwritten or pruned project model file;
2. copies the registered draft;
3. validates the published directory;
4. registers the bundle;
5. refreshes only the declared query models.

Use `--prune` only when the user approves removing target-only TM/QM files. Use `--replace-bundle` only
when the user approves replacing an existing Runtime bundle, and `--watch` only when file watching is
desired. A failure before refresh restores project files; a refresh failure is reported as a partial
Runtime publication and must be diagnosed before retrying.

For verification, build a project-local query payload only from `models describe` field names. The helper
requires an integer `limit` from 1 through 100. The first `semantic-verify` call lists/describes models and
validates the query; only `--execute` reads business data. Full results stay in evidence and the command
returns only counts and paths.

Before the first semantic mutation, the composite command checks that the query payload is inside
`projectRoot`, has a bounded limit, and targets a query model declared in the approved semantic plan.
After publication, `semantic-verify` always describes the live model before validation. If a field is
rejected, update the payload from those described names and rerun the same composite command.

Do not open, summarize, or quote `query-execute.json` or the Runtime's generated SQL after execution.
The conversational result may contain only `queryValidated`, `queryExecuted`, `rowCount`, the model
name, and the evidence path. A successful direct CLI command is not proof that onboarding completed;
only the wrapper's persisted state with all steps `completed` is authoritative.

Do not bypass a failed step. If a command fails, report its structured error, fix only the relevant input
or environment, and run `onboard-resume` to continue from the first incomplete step.
