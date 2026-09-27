# Foggy DeepSeek Harness plugin 0.4.2-rc.2

This pre-release targets DeepSeek Harness `0.1.7-rc.2` with system Node.js
`>=24.0.0` and Java 17+. It stays on the dedicated `dsh017` npm channel;
the existing `beta`, `rc`, and `dsh015` channels are unchanged.

## Changes since 0.4.2-rc.1

- Publish each polled operation state to the settings UI so initialization and
  Runtime startup progress remain visible while the operation runs. Known
  progress phases now use the selected UI language instead of raw English
  backend messages.
- Use the managed CLI's `wait-ready` response as Doctor's Runtime health check.
  Process inspection remains diagnostic context, so an unavailable Windows
  process query does not incorrectly label a healthy Runtime as stale.
- Clarify workspace behavior: an existing DSH session retains its original
  `cwd` when the default workspace changes. Create a new session in the chosen
  workspace to isolate new semantic-model files.

## Acceptance

- On a fresh Windows component/data root, the settings page visibly showed
  initialization progress during the private Python download (23%, step 2/7).
  CLI `0.1.23`, Launcher `0.1.21`, and analysis/query Skills `0.1.18` installed.
- The default Runtime port `18166` was occupied by an earlier acceptance
  Runtime. The new profile failed promptly at port preflight and displayed an
  explicit red port-conflict alert. Saving port `18167` in the isolated data
  root and starting the managed Launcher succeeded. Strict Doctor passed all
  eight checks; CLI `wait-ready` and `capabilities` reported a healthy Java
  Runtime at `http://127.0.0.1:18167`.
- A Harness chat created a separate TM/QM and a bounded 2024 monthly paid
  amount query against the local demo `fact_order` table. Runtime model
  describe, query validate, and query execute agreed with the four rows shown
  in the chat. This remains development/test data, not production deployment.
- The candidate tarball was installed over the local `0.4.2-rc.1` test profile.
  pnpm's lockfile policy passed; the installed client matched the packed source,
  DSH Web restarted without plugin activation errors, and its authenticated
  page returned HTTP 200. The existing component install state remained intact,
  with Runtime still healthy on port `18167` and strict Doctor again passing
  all eight checks.

Install the exact version with:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.2-rc.2
```

Publish this pre-release under the `dsh017` dist-tag only, leaving other npm
channels unchanged. The Linux `experience/linux/prepare.sh` entry is pinned to
the matching Git tag and becomes usable once that tag is published.
