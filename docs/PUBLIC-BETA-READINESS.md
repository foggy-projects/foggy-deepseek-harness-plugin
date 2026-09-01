# Public Beta readiness

Assessment target: `@foggy-projects/deepseek-harness-plugin@0.4.0-beta.7` with
DeepSeek Harness `0.1.1-rc.2` on Ubuntu/WSL2.

## Release verdict

The plugin is ready for a **public, explicitly scoped dev/test Beta** after the
npm package has cleared DeepSeek Harness's minimum-release-age policy. It is not
a production Runtime distribution.

Supported public Beta scope:

- Linux and WSL2 on a Linux-native workspace filesystem;
- Node.js 22.19+, Python 3.11+, and Java 17+;
- DeepSeek Harness web profile `0.1.1-rc.2`;
- local-only Foggy Runtime with `securityMode=none-dev-test-only`;
- MySQL onboarding through an operator-created opaque CLI profile;
- schema discovery, TM/QM publication, and bounded read-only query verification.

SQLite and PostgreSQL remain accepted by the contract layer but are not part of
the first public Beta acceptance matrix until their own end-to-end fixtures pass.

## Acceptance evidence

- Package tests: 10 Node tests passed.
- Onboarding unit tests: 8 Python tests passed.
- Syntax checks: gateway, web client, and onboarding Python passed.
- Upgrade test: beta.6 to beta.7 in an active DSH web profile passed.
- Clean-user install: the final beta.7 tarball installed into a fresh DSH
  profile in about one second once the DSH runtime was available; initialization
  from a verified local asset cache and the subsequent `doctor` check passed.
- Registry install: the previously published beta.6 resolved and installed from
  npm in an otherwise clean DSH profile, validating the public package path.
- Runtime reuse: the recorded Java process was verified without a duplicate
  start (`action=already-running-verified`); the persistent-state content hash
  was unchanged before and after this read-only verification.
- Legacy profile migration: one opaque profile moved to the persistent private
  store; no password value was present or copied.
- New-workspace adoption: an existing completed `tms` profile was bound to a new
  workspace without replacing its datasource, bundle, or semantic models.
- Query acceptance: validation and execution passed with `rowCount=20`; an
  identical second run resumed without re-execution.
- Existing-workspace regression: `demo` completed datasource reuse and a bounded
  read-only query with `rowCount=20`.
- Settings UI: component status, eight onboarding phases, per-component repair,
  and diagnostics export were exercised in DSH web.
- Diagnostics privacy: exported JSON had mode `0600` and contained no JDBC URL,
  password marker, password environment-variable name, or database name.

## Release gates and operating limits

1. Publish with npm dist-tag `beta`; do not move `latest` yet.
2. Wait for the DSH/pnpm minimum-release-age window before announcing the
   one-line registry install command.
3. Clearly label the Runtime local dev/test only and never instruct users to
   expose port 18066 to a network.
4. Explain that DSH Workspace Write mode may request approval when onboarding
   writes private state below `~/.local/state/foggy/deepseek-harness`.
5. Treat a cold `npx @deepseek-ai/dsh` dependency resolution as Harness setup
   time, not plugin download time. One clean WSL run was still resolving the
   Harness dependency graph after 12 minutes, while the final plugin tarball is
   only about 59 KiB and installs in about one second once DSH is present.
6. Keep engine and CLI source changes outside this repository and require
   separate authorization for them.

## Stable-release blockers

- PostgreSQL and SQLite end-to-end database fixtures.
- A production-authenticated Runtime distribution and network threat model.
- Broader OS coverage, especially native Windows.
- Compatibility testing against a non-RC DeepSeek Harness release.
- A marketplace submission channel and its final review requirements.
